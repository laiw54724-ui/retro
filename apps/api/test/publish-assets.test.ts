import { describe, expect, it, vi } from "vitest";
import { copyReferencedAssets } from "../src/lib/publish";

const id = "11111111-1111-4111-8111-111111111111";
const document = { schemaVersion: 1, siteName: "Demo", theme: { id: "x", name: "x", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#000000", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" }, windows: [], mobileColumns: 4 } as any;

function withRef() { return { ...document, windows: [{ id: "w", title: "w", icon: "x", layout: { desktop: { x: 0, y: 0, w: 300, h: 200, z: 1 }, mobile: { order: 0 } }, defaultOpen: true, type: "document", content: { blocks: [{ id: "b", kind: "image", src: `retro-asset:${id}`, srcUrl: "", alt: "" }] } }] }; }

describe("publish asset preparation", () => {
  it("copies private assets and rewrites references to immutable public URLs", async () => {
    const put = vi.fn(async () => undefined);
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id, owner_id: "user-a", site_id: "site-a", object_key: `draft/users/user-a/sites/site-a/${id}.png`, storage_scope: "draft_private", mime_type: "image/png" }], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { get: async () => ({ body: new ReadableStream(), httpEtag: "x" }), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withRef() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.windows[0].content.blocks[0].src).toBe(`https://assets.example/published/demo/assets/${id}.png`);
    expect(put).toHaveBeenCalledWith(`published/demo/assets/${id}.png`, expect.any(ReadableStream), expect.objectContaining({ httpMetadata: expect.objectContaining({ cacheControl: "public, max-age=31536000, immutable" }) }));
  });

  it("rejects missing references before copying", async () => {
    const put = vi.fn();
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { get: vi.fn(), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withRef() });
    expect(result).toMatchObject({ ok: false, code: "missing", assetId: id });
    expect(put).not.toHaveBeenCalled();
  });
});
