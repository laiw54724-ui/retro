import { describe, expect, it } from "vitest";
import { WindowChromeSchema, createStarterDocument, makeBlock, makeGalleryImage, makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument } from "../src";

describe("public projection keeps the additive fields", () => {
  it("retains caption/alt, chrome, Explorer icons and provider embeds, and still drops draft shortcuts", () => {
    const legacy = createStarterDocument("Compat", "classic98", "oc");
    const doc = legacy.windows.find((window) => window.type === "document");
    const gallery = legacy.windows.find((window) => window.type === "gallery");
    if (!doc || doc.type !== "document" || !gallery || gallery.type !== "gallery") throw new Error("fixture");
    doc.chrome = WindowChromeSchema.parse({ preset: "classic-95", controls: ["close"] });
    doc.content.blocks.push({ ...makeBlock("image"), alt: "alt", caption: "cap" });
    gallery.content.images.push(makeGalleryImage({ title: "t", caption: "gc", alt: "ga" }));
    const explorer = makeWindow("explorer", 5);
    const music = makeWindow("music", 6);
    if (explorer.type !== "explorer" || music.type !== "music") throw new Error("fixture");
    explorer.content.folders = [{ id: "f", parentId: null, name: "F", icon: "pixelart:heart", order: 0, visibility: "published" }];
    explorer.content.shortcuts = [
      { id: "pub", parentId: "f", label: "公開", icon: "pixelarticons:image", order: 0, visibility: "published", target: { siteId: "site-a", id: gallery.id, kind: "window" } },
      { id: "hid", parentId: "f", label: "草稿", icon: "haiku:folder", order: 1, visibility: "draft", target: { siteId: "site-a", id: gallery.id, kind: "window" } }
    ];
    music.content.tracks = [{ id: "t", title: "T", artist: "", cover: null, coverUrl: "", lyrics: "", rightsNote: "", source: { kind: "providerEmbed", provider: "youtube", resourceType: "video", resourceId: "dQw4w9WgXcQ", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", originalUrl: "https://youtu.be/dQw4w9WgXcQ" } }];
    music.content.playlist.trackIds = ["t"];
    legacy.windows.push(explorer, music);
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok) throw new Error("migration failed");
    const projected = projectPublicSiteDocument(migrated.document, "site-a");
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const windows = projected.document.windows as Array<any>;
    expect(windows.find((window) => window.type === "document").chrome).toMatchObject({ preset: "classic-95" });
    expect(windows.find((window) => window.type === "document").content.blocks.find((block: any) => block.kind === "image")).toMatchObject({ alt: "alt", caption: "cap" });
    expect(windows.find((window) => window.type === "gallery").content.images.at(-1)).toMatchObject({ caption: "gc", alt: "ga" });
    const ex = windows.find((window) => window.type === "explorer").content;
    expect(ex.folders[0].icon).toBe("pixelart:heart");
    expect(ex.shortcuts.map((shortcut: any) => [shortcut.id, shortcut.icon])).toEqual([["pub", "pixelarticons:image"]]);
    expect(windows.find((window) => window.type === "music").content.tracks[0].source).toMatchObject({ kind: "providerEmbed", provider: "youtube" });
  });
});
