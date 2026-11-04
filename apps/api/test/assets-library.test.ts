import { beforeEach, describe, expect, it, vi } from "vitest";

const filters: Array<[string, unknown]> = [];
const deletedKeys: string[] = [];
const assetId = "11111111-1111-4111-8111-111111111111";
const assetRow = { id: assetId, object_key: `users/user-a/sites/site-a/${assetId}.png`, migration_status: "not_required", legacy_object_key: null as string | null };
let referenced = false;

function fakeQuery(table: string) {
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
      if (table === "sites") {
        const id = filters.findLast(([field]) => field === "id")?.[1];
        return { data: id === "site-a" ? { id: "site-a", owner_id: "user-a", draft_document: referenced ? { asset: `retro-asset:${assetId}` } : {}, published_document: null } : null, error: null };
      }
      if (table === "site_memberships") return { data: null, error: null };
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
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => fakeQuery(table)) }))
}));

const { assets } = await import("../src/routes/assets");
const env = { ASSETS: { delete: async (key: string) => { deletedKeys.push(key); } } } as never;

describe("icon library endpoints", () => {
  beforeEach(() => {
    filters.length = 0;
    deletedKeys.length = 0;
    referenced = false;
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
    const response = await assets.request(`/sites/site-a/assets/${assetId}`, { method: "DELETE" }, env);
    expect(response.status).toBe(204);
    expect(deletedKeys).toEqual([assetRow.object_key]);
  });

  it("does not delete another user's asset or touch R2", async () => {
    const response = await assets.request(`/sites/site-b/assets/${assetId}`, { method: "DELETE" }, env);
    expect(response.status).toBe(404);
    expect(deletedKeys).toEqual([]);
  });

  it("does not delete while a tracked legacy public copy is pending", async () => {
    assetRow.migration_status = "pending";
    assetRow.legacy_object_key = assetRow.object_key;
    const response = await assets.request(`/sites/site-a/assets/${assetId}`, { method: "DELETE" }, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "asset_public_copy_pending" } });
    expect(deletedKeys).toEqual([]);
    assetRow.migration_status = "not_required";
    assetRow.legacy_object_key = null;
  });

  it("does not delete an asset that the current draft still references", async () => {
    referenced = true;
    const response = await assets.request(`/sites/site-a/assets/${assetId}`, { method: "DELETE" }, env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "asset_in_use" } });
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
