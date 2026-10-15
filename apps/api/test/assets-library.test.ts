import { beforeEach, describe, expect, it, vi } from "vitest";

const filters: Array<[string, unknown]> = [];
const deletedKeys: string[] = [];
const assetRow = { id: "asset-1", object_key: "users/user-a/sites/site-a/asset-1.png" };

function fakeQuery() {
  const query: Record<string, unknown> = {
    select: () => query,
    eq: (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    },
    order: () => query,
    limit: async () => ({ data: [], error: null }),
    delete: () => query,
    maybeSingle: async () => {
      const owner = filters.findLast(([field]) => field === "owner_id")?.[1];
      const site = filters.findLast(([field]) => field === "site_id")?.[1];
      return { data: owner === "user-a" && site === "site-a" ? assetRow : null, error: null };
    },
    then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null })
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a", email: "a@example.com" })),
  serviceClient: vi.fn(() => ({ from: vi.fn(() => fakeQuery()) }))
}));

const { assets } = await import("../src/routes/assets");
const env = { ASSETS: { delete: async (key: string) => { deletedKeys.push(key); } } } as never;

describe("icon library endpoints", () => {
  beforeEach(() => {
    filters.length = 0;
    deletedKeys.length = 0;
  });

  it("scopes asset listing to the owner and rejects unknown kinds", async () => {
    const ok = await assets.request("/sites/site-a/assets?kind=icon", {}, env);
    expect(ok.status).toBe(200);
    expect(filters).toContainEqual(["owner_id", "user-a"]);
    expect(filters).toContainEqual(["kind", "icon"]);

    const bad = await assets.request("/sites/site-a/assets?kind=video", {}, env);
    expect(bad.status).toBe(400);
  });

  it("deletes the owner's asset and its R2 object", async () => {
    const response = await assets.request("/sites/site-a/assets/asset-1", { method: "DELETE" }, env);
    expect(response.status).toBe(204);
    expect(deletedKeys).toEqual([assetRow.object_key]);
  });

  it("does not delete another user's asset or touch R2", async () => {
    const response = await assets.request("/sites/site-b/assets/asset-1", { method: "DELETE" }, env);
    expect(response.status).toBe(404);
    expect(deletedKeys).toEqual([]);
  });

  it("rejects anonymous draft and unknown namespaces before touching R2", async () => {
    const get = vi.fn();
    const draft = await assets.request("/assets/draft/users/user-a/sites/site-a/asset-1.png", {}, { ASSETS: { get } } as never);
    const unknown = await assets.request("/assets/private/users/user-a/sites/site-a/asset-1.png", {}, { ASSETS: { get } } as never);
    expect(draft.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});
