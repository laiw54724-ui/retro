import { describe, expect, it, vi } from "vitest";
import { makeWindow } from "@retrodesk/shared";
import { copyReferencedAssets } from "../src/lib/publish";

const id = "11111111-1111-4111-8111-111111111111";
const document = { schemaVersion: 1, siteName: "Demo", theme: { id: "x", name: "x", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#000000", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" }, windows: [], mobileColumns: 4 } as any;

function withRef() { return { ...document, windows: [{ id: "w", title: "w", icon: "x", layout: { desktop: { x: 0, y: 0, w: 300, h: 200, z: 1 }, mobile: { order: 0 } }, defaultOpen: true, type: "document", content: { blocks: [{ id: "b", kind: "image", src: `retro-asset:${id}`, srcUrl: "", alt: "" }] } }] }; }
function withAudioRef() { return { ...document, windows: [{ id: "music", title: "Music", icon: "music", layout: { desktop: { x: 0, y: 0, w: 390, h: 430, z: 1 }, mobile: { order: 0 } }, defaultOpen: true, type: "music", content: { tracks: [{ id: "track", title: "Theme", artist: "OC", cover: null, coverUrl: "", source: { kind: "uploadedAudio", asset: `retro-asset:${id}` }, lyrics: "", rightsNote: "Original" }], playlist: { id: "playlist", title: "Themes", trackIds: ["track"] } } }] }; }

describe("publish asset preparation", () => {
  it.each([["jpg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"], ["gif", "image/gif"]])("uses the existing private image pipeline for %s without re-encoding or mutating the source", async (extension, mimeType) => {
    const image = makeWindow("image"); if (image.type !== "image") throw new Error("image");
    image.content.src = `retro-asset:${id}`;
    const source = { ...document, windows: [image] };
    const body = new ReadableStream(), put = vi.fn(async () => ({}));
    const row = { id, owner_id: "user-a", site_id: "site-a", object_key: `draft/users/user-a/sites/site-a/${id}.${extension}`, storage_scope: "draft_private", mime_type: mimeType };
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [row], error: null }) }) }) } as any;
    const env = { PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { head: async () => null, get: async () => ({ body, httpEtag: "x" }), put } } as any;
    const result = await copyReferencedAssets(env, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: source });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.windows[0].content.src).toBe(`https://assets.example/published/demo/assets/${id}.${extension}`);
    expect(put).toHaveBeenCalledWith(`draft/publication-assets/site-a/${id}.${extension}`, body, expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: mimeType, cacheControl: "private, no-store" }) }));
    expect(image.content.src).toBe(`retro-asset:${id}`);
    row.site_id = "other-site"; put.mockClear();
    expect(await copyReferencedAssets(env, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: source })).toMatchObject({ ok: false, code: "foreign" });
    expect(put).not.toHaveBeenCalled();
  });
  it("stages private assets while preparing unchanged immutable public URLs", async () => {
    const put = vi.fn(async (key: string, _body: ReadableStream, _options: R2PutOptions) => ({ key }));
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id, owner_id: "user-a", site_id: "site-a", object_key: `draft/users/user-a/sites/site-a/${id}.png`, storage_scope: "draft_private", mime_type: "image/png" }], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { head: async () => null, get: async () => ({ body: new ReadableStream(), httpEtag: "x" }), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withRef() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.windows[0].content.blocks[0].src).toBe(`https://assets.example/published/demo/assets/${id}.png`);
    expect(put).toHaveBeenCalledWith(`draft/publication-assets/site-a/${id}.png`, expect.any(ReadableStream), expect.objectContaining({ httpMetadata: expect.objectContaining({ cacheControl: "private, no-store" }) }));
    expect(put.mock.calls.map(([key]) => key).some((key) => key.startsWith("published/"))).toBe(false);
    expect(put.mock.calls[0][2].onlyIf).toBeInstanceOf(Headers);
    expect((put.mock.calls[0][2].onlyIf as Headers).get("If-None-Match")).toBe("*");
  });

  it("rejects missing references before copying", async () => {
    const put = vi.fn();
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { get: vi.fn(), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withRef() });
    expect(result).toMatchObject({ ok: false, code: "missing", assetId: id });
    expect(put).not.toHaveBeenCalled();
  });

  it("stages private audio and prepares the unchanged immutable public media URL", async () => {
    const put = vi.fn(async (key: string, _body: ReadableStream, _options: R2PutOptions) => ({ key }));
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id, owner_id: "user-a", site_id: "site-a", object_key: `draft/users/user-a/sites/site-a/${id}.mp3`, storage_scope: "draft_private", mime_type: "audio/mpeg" }], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { head: async () => null, get: async () => ({ body: new ReadableStream(), httpEtag: "x" }), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withAudioRef() });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.windows[0].content.tracks[0].source.asset).toBe(`https://assets.example/published/demo/assets/${id}.mp3`);
    expect(put).toHaveBeenCalledWith(`draft/publication-assets/site-a/${id}.mp3`, expect.any(ReadableStream), expect.objectContaining({ httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" } }));
    expect(put.mock.calls.map(([key]) => key).some((key) => key.startsWith("published/"))).toBe(false);
  });

  it("rejects a draft key whose filename UUID does not match the reference", async () => {
    const put = vi.fn();
    const supabase = { from: () => ({ select: () => ({ in: async () => ({ data: [{ id, owner_id: "user-a", site_id: "site-a", object_key: `draft/users/user-a/sites/site-a/22222222-2222-4222-8222-222222222222.png`, storage_scope: "draft_private", mime_type: "image/png" }], error: null }) }) }) } as any;
    const result = await copyReferencedAssets({ PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { get: vi.fn(), put } } as any, supabase, { ownerId: "user-a", siteId: "site-a", username: "demo", document: withRef() });
    expect(result).toMatchObject({ ok: false, code: "foreign", assetId: id });
    expect(put).not.toHaveBeenCalled();
  });
});
