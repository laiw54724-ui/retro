import { beforeEach, describe, expect, it, vi } from "vitest";

const state: {
  role: "editor" | "viewer" | null;
  inserts: Array<Record<string, unknown>>;
  audioSizes: number[];
} = { role: "editor", inserts: [], audioSizes: [] };

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
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "site_assets" ? state.audioSizes.map((size_bytes) => ({ size_bytes })) : null, error: null }).then(resolve)
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "member-a", email: "member@example.com" })),
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => queryFor(table)) }))
}));

const { assets } = await import("../src/routes/assets");

describe("shared draft asset permissions", () => {
  beforeEach(() => { state.role = "editor"; state.inserts.length = 0; state.audioSizes.length = 0; });

  it("stores editor uploads under the authoritative owner's prefix", async () => {
    const put = vi.fn(async () => undefined);
    const body = new FormData();
    body.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" }));
    const response = await assets.request("/sites/site-a/assets", { method: "POST", body }, { ASSETS: { put, delete: vi.fn() } } as never);
    expect(response.status).toBe(201);
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^draft\/users\/owner-a\/sites\/site-a\/.+\.png$/), expect.any(ArrayBuffer), expect.objectContaining({ customMetadata: { ownerId: "owner-a", siteId: "site-a" } }));
    expect(state.inserts[0]).toMatchObject({ site_id: "site-a", owner_id: "owner-a", object_key: expect.stringContaining("draft/users/owner-a/sites/site-a/") });
  });

  it("validates and stores normalized private audio uploads", async () => {
    const put = vi.fn(async () => undefined);
    const body = new FormData();
    body.set("kind", "audio");
    body.set("file", new File([new TextEncoder().encode("RIFF0000WAVEfmt ")], "theme.wav", { type: "audio/x-wav" }));
    const response = await assets.request("/sites/site-a/assets", { method: "POST", body }, { ASSETS: { put, delete: vi.fn() } } as never);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ asset: { kind: "audio", mimeType: "audio/wav" } });
    expect(put).toHaveBeenCalledWith(expect.stringMatching(/^draft\/users\/owner-a\/sites\/site-a\/.+\.wav$/), expect.any(ArrayBuffer), expect.objectContaining({ httpMetadata: { contentType: "audio/wav", cacheControl: "private, no-store" } }));
    expect(state.inserts[0]).toMatchObject({ kind: "audio", mime_type: "audio/wav" });
  });

  it("rejects spoofed audio and site quota overflow before writing R2", async () => {
    const put = vi.fn(async () => undefined);
    const spoofed = new FormData();
    spoofed.set("kind", "audio");
    spoofed.set("file", new File(["<html>"], "fake.mp3", { type: "audio/mpeg" }));
    const spoofedResponse = await assets.request("/sites/site-a/assets", { method: "POST", body: spoofed }, { ASSETS: { put, delete: vi.fn() } } as never);
    expect(spoofedResponse.status).toBe(415);
    await expect(spoofedResponse.json()).resolves.toMatchObject({ error: { code: "invalid_audio_bytes" } });

    state.audioSizes.push(100 * 1024 * 1024);
    const quota = new FormData();
    quota.set("kind", "audio");
    quota.set("file", new File([new TextEncoder().encode("ID3\u0004\u0000")], "theme.mp3", { type: "audio/mpeg" }));
    const quotaResponse = await assets.request("/sites/site-a/assets", { method: "POST", body: quota }, { ASSETS: { put, delete: vi.fn() } } as never);
    expect(quotaResponse.status).toBe(413);
    await expect(quotaResponse.json()).resolves.toMatchObject({ error: { code: "site_audio_quota_exceeded" } });
    expect(put).not.toHaveBeenCalled();
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
