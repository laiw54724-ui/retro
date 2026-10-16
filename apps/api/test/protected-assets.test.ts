import { describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => ({ error: { message: "insert failed" } }));
const put = vi.fn(async () => undefined);
const remove = vi.fn(async () => undefined);

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: table === "sites" ? { id: "site-a", owner_id: "user-a" } : null, error: null }),
        insert
      };
      return query;
    })
  }))
}));

const { assets } = await import("../src/routes/assets");

describe("protected asset storage", () => {
  it("uses draft-private keys and removes the object if DB insert fails", async () => {
    const body = new FormData();
    body.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" }));
    const response = await assets.request("/sites/site-a/assets", { method: "POST", body }, { ASSETS: { put, delete: remove }, PUBLIC_ASSET_BASE_URL: "https://assets.example" } as never);
    expect(response.status).toBe(500);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^draft\/users\/user-a\/sites\/site-a\/.*\.png$/), expect.any(ArrayBuffer), expect.objectContaining({ httpMetadata: { contentType: "image/png", cacheControl: "private, no-store" } }));
    expect(remove).toHaveBeenCalledWith(expect.stringMatching(/^draft\/users\/user-a\/sites\/site-a\/.*\.png$/));
  });
});
