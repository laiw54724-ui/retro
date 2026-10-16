import { describe, expect, it, vi } from "vitest";

const asset = { id: "asset-1", object_key: "draft/users/user-a/sites/site-a/asset-1.png", storage_scope: "draft_private" };
const object = { body: new Blob(["0123456789"]).stream(), size: 10, httpEtag: '"asset"', writeHttpMetadata(headers: Headers) { headers.set("Content-Type", "audio/mpeg"); } };
const owner = vi.fn(async () => ({ id: "user-a" }));
const assetMaybeSingle = vi.fn(async () => ({ data: asset, error: null }));

vi.mock("../src/lib/supabase", () => ({
  requireUser: owner,
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: table === "sites" ? async () => ({ data: { id: "site-a", owner_id: "user-a" }, error: null }) : assetMaybeSingle };
    return query;
  }) }))
}));

const { assets } = await import("../src/routes/assets");

describe("owner-only draft asset preview", () => {
  it("serves a matching private object with no-store caching", async () => {
    const get = vi.fn(async () => object);
    const response = await assets.request("/sites/site-a/assets/asset-1/content", {}, { ASSETS: { get } } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(get).toHaveBeenCalledWith(asset.object_key);
  });

  it("authorizes before serving private HEAD and range responses", async () => {
    const head = vi.fn(async () => object);
    const get = vi.fn(async () => object);
    const response = await assets.request("/sites/site-a/assets/asset-1/content", { headers: { Range: "bytes=2-5" } }, { ASSETS: { head, get } } as never);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(head).toHaveBeenCalledWith(asset.object_key);
    expect(get).toHaveBeenCalledWith(asset.object_key, { range: { offset: 2, length: 4 } });
  });

  it("denies anonymous access even when the private key is known", async () => {
    owner.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "unauthorized" } }), { status: 401 }));
    const get = vi.fn();
    const response = await assets.request("/sites/site-a/assets/asset-1/content", {}, { ASSETS: { get } } as never);
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("denies a row whose storage key crosses the owner/site prefix", async () => {
    assetMaybeSingle.mockResolvedValueOnce({ data: { ...asset, object_key: "draft/users/user-b/sites/site-a/asset-1.png" }, error: null });
    const get = vi.fn();
    const response = await assets.request("/sites/site-a/assets/asset-1/content", {}, { ASSETS: { get } } as never);
    expect(response.status).toBe(404);
    expect(get).not.toHaveBeenCalled();
  });
});
