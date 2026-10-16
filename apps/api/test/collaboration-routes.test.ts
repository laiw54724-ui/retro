import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  user: { id: "owner-a", email: "OWNER@EXAMPLE.COM" } as { id: string; email?: string | null },
  membershipRole: null as "editor" | "viewer" | null,
  rpcError: null as { code?: string; message: string; details?: string; hint?: string } | null,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  selects: [] as string[]
};

function queryFor(table: string) {
  const result = table === "sites"
    ? { id: "site-a", owner_id: "owner-a" }
    : table === "site_memberships" && state.membershipRole
      ? { role: state.membershipRole }
      : null;
  const rows = table === "site_invites" ? [{ id: "invite-a", email: "member@example.com", role: "viewer" }] : [];
  const query: any = {
    select: (fields: string) => { state.selects.push(fields); return query; },
    eq: () => query,
    maybeSingle: async () => ({ data: result, error: null }),
    order: async () => ({ data: rows, error: null })
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => state.user),
  serviceClient: vi.fn(() => ({
    from: vi.fn((table: string) => queryFor(table)),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      if (name === "create_site_invite") return { data: [{ id: "invite-a", site_id: "site-a", email: args.p_email, role: args.p_role }], error: null };
      if (name === "accept_site_invite") return { data: [{ site_id: "site-a", role: "viewer" }], error: null };
      return { data: null, error: null };
    })
  }))
}));

const { collaboration } = await import("../src/routes/collaboration");

describe("collaboration lifecycle routes", () => {
  beforeEach(() => {
    state.user = { id: "owner-a", email: "OWNER@EXAMPLE.COM" };
    state.membershipRole = null;
    state.rpcError = null;
    state.rpcCalls.length = 0;
    state.selects.length = 0;
  });

  it("returns the raw token once while sending only its digest to Postgres", async () => {
    const response = await collaboration.request("/sites/site-a/invites", { method: "POST", body: JSON.stringify({ email: " Member@Example.COM ", role: "editor", expiryHours: 24 }) }, {} as never);
    expect(response.status).toBe(201);
    const body = await response.json() as any;
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.invite).not.toHaveProperty("token_digest");
    expect(state.rpcCalls[0]).toMatchObject({ name: "create_site_invite", args: { p_site_id: "site-a", p_actor_id: "owner-a", p_email: "member@example.com", p_role: "editor", p_token_digest: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(state.rpcCalls[0].args.p_token_digest).not.toBe(body.token);
  });

  it("bounds invitation expiry and keeps list responses digest-free", async () => {
    const invalid = await collaboration.request("/sites/site-a/invites", { method: "POST", body: JSON.stringify({ email: "member@example.com", role: "viewer", expiryHours: 200 }) }, {} as never);
    expect(invalid.status).toBe(400);
    const list = await collaboration.request("/sites/site-a/invites", {}, {} as never);
    expect(list.status).toBe(200);
    expect(state.selects.some((fields) => fields.includes("token_digest"))).toBe(false);
  });

  it("does not allow editors to manage invitations", async () => {
    state.user = { id: "editor-a", email: "editor@example.com" };
    state.membershipRole = "editor";
    const response = await collaboration.request("/sites/site-a/invites", { method: "POST", body: JSON.stringify({ email: "member@example.com", role: "viewer" }) }, {} as never);
    expect(response.status).toBe(403);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("accepts using the authenticated normalized email and a digest", async () => {
    const token = "A".repeat(43);
    const response = await collaboration.request("/invites/accept", { method: "POST", body: JSON.stringify({ token }) }, {} as never);
    expect(response.status).toBe(200);
    expect(state.rpcCalls[0]).toMatchObject({ name: "accept_site_invite", args: { p_user_id: "owner-a", p_email: "owner@example.com", p_token_digest: expect.stringMatching(/^[0-9a-f]{64}$/) } });
  });

  it.each([
    ["invite_email_mismatch", 403],
    ["invite_expired", 409],
    ["invite_revoked", 409],
    ["invite_used", 409],
    ["invalid_invite", 404]
  ])("maps %s without leaking invite state", async (message, status) => {
    state.rpcError = { message };
    const response = await collaboration.request("/invites/accept", { method: "POST", body: JSON.stringify({ token: "B".repeat(43) }) }, {} as never);
    expect(response.status).toBe(status);
  });

  it("logs actionable database metadata without exposing invitation secrets", async () => {
    const token = "S".repeat(43);
    state.rpcError = { code: "42702", message: "column reference site_id is ambiguous", details: "output parameter collision", hint: "qualify the target" };
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await collaboration.request("/invites/accept", {
      method: "POST",
      headers: { authorization: "Bearer secret-authorization" },
      body: JSON.stringify({ token })
    }, {} as never);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "db_error", message: "Could not update collaboration access" } });
    const rendered = JSON.stringify(log.mock.calls);
    expect(rendered).toContain("accept_site_invite");
    expect(rendered).toContain("42702");
    expect(rendered).toContain("column reference site_id is ambiguous");
    expect(rendered).toContain("output parameter collision");
    expect(rendered).toContain("qualify the target");
    expect(rendered).not.toContain(token);
    expect(rendered).not.toContain("owner@example.com");
    expect(rendered).not.toContain("secret-authorization");
    log.mockRestore();
  });

  it("uses atomic RPCs for role changes, removal, and revocation", async () => {
    expect((await collaboration.request("/sites/site-a/members/member-a", { method: "PUT", body: JSON.stringify({ role: "editor" }) }, {} as never)).status).toBe(200);
    expect((await collaboration.request("/sites/site-a/members/member-a", { method: "DELETE" }, {} as never)).status).toBe(204);
    expect((await collaboration.request("/sites/site-a/invites/invite-a", { method: "DELETE" }, {} as never)).status).toBe(204);
    expect(state.rpcCalls.map((call) => call.name)).toEqual(["update_site_member_role", "remove_site_member", "revoke_site_invite"]);
  });
});
