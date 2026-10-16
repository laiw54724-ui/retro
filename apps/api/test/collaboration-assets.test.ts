import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  role: "editor" | "viewer" | null;
  inserts: Array<Record<string, unknown>>;
} = { role: "editor", inserts: [] };

function queryFor(table: string) {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: async () => ({ data: [], error: null }),
    insert: async (row: Record<string, unknown>) => { state.inserts.push(row); return { error: null }; },
    delete: () => query,
    maybeSingle: async () => {
      if (table === "sites") return { data: { id: "site-a", owner_id: "owner-a" }, error: null };
      if (table === "site_memberships") return { data: state.role ? { role: state.role } : null, error: null };
      if (table === "site_assets") return { data: { id: "asset-a", object_key: "draft/users/owner-a/sites/site-a/asset-a.png", storage_scope: "draft_private", migration_status: "not_required", legacy_object_key: null }, error: null };
      return { data: null, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "member-a", email: "member@example.com" })),
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => queryFor(table)) }))
}));

const { assets } = await import("../src/routes/assets");

describe("shared draft asset permissions", () => {
  beforeEach(() => { state.role = "editor"; state.inserts.length = 0; });

  it("stores editor uploads under the authoritative owner's prefix", async () => {
    const put = vi.fn(async () => undefined);
    const body = new FormData();
    body.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" }));
    const response = await assets.request("/sites/site-a/assets", { method: "POST", body }, { ASSETS: { put, delete: vi.fn() } } as never);
    expect(response.status).toBe(201);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^draft\/users\/owner-a\/sites\/site-a\/.+\.png$/), expect.any(ArrayBuffer), expect.objectContaining({ customMetadata: { ownerId: "owner-a", siteId: "site-a" } }));
    expect(state.inserts[0]).toMatchObject({ site_id: "site-a", owner_id: "owner-a", object_key: expect.stringContaining("draft/users/owner-a/sites/site-a/") });
  });

  it("allows viewers to list and preview but not delete", async () => {
    state.role = "viewer";
    expect((await assets.request("/sites/site-a/assets", {}, {} as never)).status).toBe(200);
    const object = { body: new ReadableStream<Uint8Array>(), httpEtag: '"asset"', writeHttpMetadata() {} };
    expect((await assets.request("/sites/site-a/assets/asset-a/content", {}, { ASSETS: { get: vi.fn(async () => object) } } as never)).status).toBe(200);
    expect((await assets.request("/sites/site-a/assets/asset-a", { method: "DELETE" }, { ASSETS: { delete: vi.fn() } } as never)).status).toBe(403);
  });

  it("keeps legacy migration owner-only", async () => {
    const response = await assets.request("/sites/site-a/assets/migrate", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }, {} as never);
    expect(response.status).toBe(403);
  });

  it("removes access on the next request", async () => {
    expect((await assets.request("/sites/site-a/assets", {}, {} as never)).status).toBe(200);
    state.role = null;
    expect((await assets.request("/sites/site-a/assets", {}, {} as never)).status).toBe(404);
  });
});
