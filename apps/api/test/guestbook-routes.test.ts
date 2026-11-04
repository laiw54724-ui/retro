import { beforeEach, describe, expect, it, vi } from "vitest";

const entryId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const state = {
  user: { id: "owner-a" },
  ownerId: "owner-a",
  membershipRole: null as "editor" | "viewer" | null,
  enabled: true,
  rpcError: null as { message: string } | null,
  eqs: [] as Array<[string, unknown]>,
  tables: [] as string[],
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>
};

const approved = { id: entryId, display_name: "訪客", body: "你好", status: "approved", created_at: "2026-10-17T00:00:00.000Z" };

function queryFor(table: string) {
  state.tables.push(table);
  let operation = "select";
  const result = () => {
    if (table === "sites") return { data: { id: "site-a", owner_id: state.ownerId, published_document: { windows: [{ type: "guestbook", content: { enabled: state.enabled } }] } }, error: null };
    if (table === "site_memberships") return { data: state.membershipRole ? { role: state.membershipRole } : null, error: null };
    if (table === "guestbook_entries") return { data: operation === "delete" ? [{ id: entryId }] : [approved], error: null };
    if (table === "guestbook_reports") return { data: [{ id: "report-a" }], error: null };
    return { data: null, error: null };
  };
  const query: any = {
    select: () => query,
    eq: (field: string, value: unknown) => { state.eqs.push([field, value]); return query; },
    not: () => query,
    order: () => query,
    limit: async () => result(),
    update: () => { operation = "update"; return query; },
    delete: () => { operation = "delete"; return query; },
    maybeSingle: async () => ({ ...result(), data: Array.isArray(result().data) ? result().data[0] : result().data }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => state.user),
  serviceClient: vi.fn(() => ({
    from: vi.fn((table: string) => queryFor(table)),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return state.rpcError ? { data: null, error: state.rpcError } : { data: [{ ...approved, status: "pending" }], error: null };
    })
  }))
}));

const { guestbook } = await import("../src/routes/guestbook");
const env = { SUPABASE_SERVICE_ROLE_KEY: "test-service-secret" } as never;

describe("guestbook route boundaries", () => {
  beforeEach(() => {
    state.user = { id: "owner-a" };
    state.ownerId = "owner-a";
    state.membershipRole = null;
    state.enabled = true;
    state.rpcError = null;
    state.eqs.length = 0;
    state.tables.length = 0;
    state.rpcCalls.length = 0;
  });

  it("returns only explicitly approved public rows without caching", async () => {
    const response = await guestbook.request("/public/sites/demo/guestbook", {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(state.eqs).toContainEqual(["status", "approved"]);
    expect(await response.json()).toEqual({ entries: [{ id: entryId, displayName: "訪客", body: "你好", status: "approved", createdAt: "2026-10-17T00:00:00.000Z", reportCount: 0, openReportCount: 0 }] });
  });

  it("submits pending plain text using an irreversible abuse digest", async () => {
    const response = await guestbook.request("/public/sites/demo/guestbook", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ displayName: "匿名", body: "<script>文字</script>", requestId }) }, env);
    expect(response.status).toBe(202);
    expect(state.rpcCalls[0]).toMatchObject({ name: "submit_guestbook_entry", args: { p_display_name: "匿名", p_body: "<script>文字</script>", p_request_id: requestId, p_abuse_key: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(JSON.stringify(state.rpcCalls[0])).not.toContain("203.0.113.9");
  });

  it.each([["guestbook_disabled", 403, "guestbook_disabled"], ["guestbook_rate_limited", 429, "rate_limited"]])("maps %s without accepting the entry", async (message, status, code) => {
    state.rpcError = { message: String(message) };
    const response = await guestbook.request("/public/sites/demo/guestbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "匿名", body: "留言", requestId }) }, env);
    expect(response.status).toBe(status);
    expect((await response.json() as any).error.code).toBe(code);
  });

  it("does not expose a direct public entry endpoint", async () => {
    expect((await guestbook.request(`/public/sites/demo/guestbook/${entryId}`, {}, env)).status).toBe(404);
  });

  it("denies moderation to a collaborator editor before reading entries", async () => {
    state.user = { id: "editor-a" };
    state.ownerId = "owner-a";
    state.membershipRole = "editor";
    const response = await guestbook.request("/sites/site-a/guestbook", {}, env);
    expect(response.status).toBe(403);
    expect(state.tables.filter((table) => table === "guestbook_entries")).toHaveLength(0);
  });
});
