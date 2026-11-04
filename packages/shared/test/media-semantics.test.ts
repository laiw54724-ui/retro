import { describe, expect, it } from "vitest";
import {
  createRetroExport,
  createStarterDocument,
  DocumentBlockSchema,
  GalleryImageSchema,
  IgPostSchema,
  inspectRetroImport,
  makeBlock,
  makeGalleryImage,
  makeIgPost,
  makeWindow,
  mergeLegacyDocumentIntoV2,
  migrateSiteDocumentV2,
  parseSiteDocument,
  PostEntityV2Schema,
  projectPublicSiteDocument,
  projectV2ToLegacyDocument,
  WindowChromeSchema,
  type SiteDocument,
  type SiteDocumentV2Input,
} from "../src";

const SITE_ID = "site-media";

function legacyFixture(): SiteDocument {
  const document = createStarterDocument("Media semantics", "classic98", "card");
  const text = makeWindow("document", 0);
  const gallery = makeWindow("gallery", 1);
  const instagram = makeWindow("instagram", 2);
  if (text.type !== "document" || gallery.type !== "gallery" || instagram.type !== "instagram") throw new Error("Unexpected fixture window type");
  text.id = "document-media";
  text.content.blocks = [
    { id: "image-legacy", kind: "image", src: "https://example.com/document-legacy.png", srcUrl: "", alt: "舊文件圖說與替代文字" },
    { id: "image-empty", kind: "image", src: "https://example.com/document-empty.png", srcUrl: "", alt: "有替代文字但沒有圖說", caption: "" },
    { id: "image-caption", kind: "image", src: "https://example.com/document-caption.png", srcUrl: "", alt: "圖片內容描述", caption: "作品名稱與作者" },
  ];
  gallery.id = "gallery-media";
  gallery.content.images = [
    makeGalleryImage({ id: "gallery-legacy", src: "https://example.com/gallery-legacy.png", title: "Legacy image", caption: "舊相簿圖說" }),
    makeGalleryImage({ id: "gallery-empty", src: "https://example.com/gallery-empty.png", title: "Decorative image", caption: "可見圖說", alt: "" }),
    makeGalleryImage({ id: "gallery-alt", src: "https://example.com/gallery-alt.png", title: "Artwork", caption: "作品資訊", alt: "獨立的圖片內容描述" }),
  ];
  instagram.id = "instagram-media";
  instagram.content.images = [makeIgPost({
    id: "oc-post",
    src: "https://example.com/oc-primary.png",
    caption: "既有 OC 貼文圖說",
    extra: [{ id: "oc-extra", src: "https://example.com/oc-secondary.png", srcUrl: "" }],
  })];
  document.windows = [text, gallery, instagram];
  return document;
}

function migratedFixture() {
  const migrated = migrateSiteDocumentV2(legacyFixture(), { siteId: SITE_ID });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Media fixture migration failed");
  return migrated.document;
}

function mediaContent(document: SiteDocument | SiteDocumentV2Input) {
  const text = document.windows.find((window) => window.id === "document-media");
  const gallery = document.windows.find((window) => window.id === "gallery-media");
  if (text?.type !== "document" || gallery?.type !== "gallery") throw new Error("Media fixture windows missing");
  return { blocks: text.content.blocks, images: gallery.content.images };
}

function expectOriginalMedia(document: SiteDocument | SiteDocumentV2Input) {
  const content = mediaContent(document);
  expect(content).toEqual(mediaContent(legacyFixture()));
  expect(content.blocks[0]).not.toHaveProperty("caption");
  expect(content.blocks[1]).toHaveProperty("caption", "");
  expect(content.images[0]).not.toHaveProperty("alt");
  expect(content.images[1]).toHaveProperty("alt", "");
}

describe("document and gallery media semantics", () => {
  it("preserves absent legacy fields and intentional empty strings while parsing v1", () => {
    const original = legacyFixture();
    const before = structuredClone(original);
    const parsed = parseSiteDocument(original);
    if (!parsed.ok || parsed.version !== 1) throw new Error("Media fixture parsing failed");
    expectOriginalMedia(parsed.document);
    expect(original).toEqual(before);
  });

  it("starts new document images with an independent empty caption without changing old images", () => {
    expect(makeBlock("image")).toMatchObject({ kind: "image", alt: "", caption: "" });
    const legacyImage = { id: "legacy", kind: "image", src: null, alt: "Original visible caption" };
    expect(DocumentBlockSchema.parse(legacyImage)).not.toHaveProperty("caption");
    expect(GalleryImageSchema.parse(makeGalleryImage())).not.toHaveProperty("alt");
  });

  it.each(["caption", "alt"] as const)("bounds the new %s field in both v1 and strict v2 without reducing old caption limits", (field) => {
    const withValue = (document: SiteDocument | SiteDocumentV2Input, value: unknown) => ({
      ...document,
      windows: document.windows.map((window) => {
        if (field === "caption" && window.type === "document") return {
          ...window,
          content: { ...window.content, blocks: window.content.blocks.map((block, index) => index === 0 ? { ...block, caption: value } : block) },
        };
        if (field === "alt" && window.type === "gallery") return {
          ...window,
          content: { ...window.content, images: window.content.images.map((image, index) => index === 0 ? { ...image, alt: value } : image) },
        };
        return window;
      }),
    });
    for (const document of [legacyFixture(), migratedFixture()]) {
      expect(parseSiteDocument(withValue(document, "字".repeat(300)))).toMatchObject({ ok: true });
      for (const invalid of ["字".repeat(301), null, 42]) {
        expect(parseSiteDocument(withValue(document, invalid))).toMatchObject({ ok: false, code: "invalid" });
      }
    }
    const originalCaption = "字".repeat(1000);
    expect(GalleryImageSchema.safeParse(makeGalleryImage({ caption: originalCaption })).success).toBe(true);
    expect(IgPostSchema.safeParse(makeIgPost({ caption: originalCaption })).success).toBe(true);
  });

  it("retains caption and alt distinctions through migration, legacy editing, and JSON reload", () => {
    const migrated = migratedFixture();
    expectOriginalMedia(migrated);
    const before = structuredClone(migrated);
    const view = projectV2ToLegacyDocument(migrated);
    if (!view.ok) throw new Error("Legacy projection failed");
    expectOriginalMedia(view.document);
    view.document.siteName = "A normal editor update";
    const merged = mergeLegacyDocumentIntoV2(migrated, view.document, { siteId: SITE_ID });
    expectOriginalMedia(merged);
    const reloaded = parseSiteDocument(JSON.parse(JSON.stringify(merged)));
    if (!reloaded.ok || reloaded.version !== 2) throw new Error("Reload failed");
    expectOriginalMedia(reloaded.document);
    expect(reloaded.document.siteName).toBe("A normal editor update");
    expect(migrated).toEqual(before);
  });

  it("commits separate caption and alt edits through the canonical legacy merge", () => {
    const canonical = migratedFixture();
    const view = projectV2ToLegacyDocument(canonical);
    if (!view.ok) throw new Error("Legacy projection failed");
    const content = mediaContent(view.document);
    const image = content.blocks[0];
    if (image.kind !== "image") throw new Error("Expected image block");
    image.caption = image.alt;
    image.alt = "Updated independent alternative text";
    content.images[0].alt = "";
    content.images[1].alt = "Independent gallery alternative text";
    content.images[1].caption = "";
    const merged = mergeLegacyDocumentIntoV2(canonical, view.document, { siteId: SITE_ID });
    const parsed = parseSiteDocument(merged);
    if (!parsed.ok || parsed.version !== 2) throw new Error("Edited document invalid");
    expect(mediaContent(parsed.document)).toEqual(content);
    expect(mediaContent(canonical).blocks[0]).not.toHaveProperty("caption");
    expect(mediaContent(canonical).images[0]).not.toHaveProperty("alt");
  });

  it("retains media text in public projection while continuing to remove draft OC content", () => {
    const canonical = migratedFixture();
    canonical.entities.profiles[0].visibility = "draft";
    canonical.entities.profiles[0].name = "PRIVATE_PROFILE_NAME";
    const before = structuredClone(canonical);
    const projected = projectPublicSiteDocument(canonical, SITE_ID);
    if (!projected.ok || projected.version !== 2) throw new Error("Public projection failed");
    expectOriginalMedia(projected.document);
    expect(projected.document.entities.profiles).toEqual([]);
    expect(projected.document.entities.posts).toEqual([]);
    expect(JSON.stringify(projected.document)).not.toContain("PRIVATE_PROFILE_NAME");
    expect(projected.document.windows.some((window) => window.type === "instagram")).toBe(false);
    expect(canonical).toEqual(before);
  });

  it.each([
    [1, "owner-backup"], [1, "public"], [2, "owner-backup"], [2, "public"],
  ] as const)("preserves absence and empty strings through v%s %s export and import", (version, scope) => {
    const document = version === 1 ? legacyFixture() : migratedFixture();
    const exported = createRetroExport({
      scope, document, siteId: SITE_ID, username: "media", siteName: document.siteName,
      exportedAt: "2026-10-17T00:00:00.000Z",
    });
    if (!exported.ok) throw new Error("Media export failed");
    const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
    if (!imported.ok) throw new Error("Media import failed");
    expect(imported.value.document.schemaVersion).toBe(version);
    expectOriginalMedia(imported.value.document);
  });
});

describe("OC media contract isolation", () => {
  it("keeps the original IG post fields and rejects gallery-only alt on canonical posts", () => {
    expect(Object.keys(IgPostSchema.shape).sort()).toEqual([
      "caption", "comments", "date", "extra", "href", "id", "likes", "location", "src", "srcUrl", "title",
    ]);
    expect(makeIgPost()).not.toHaveProperty("alt");
    expect(IgPostSchema.strict().safeParse({ ...makeIgPost(), alt: "Gallery-only field" }).success).toBe(false);
    const canonical = migratedFixture();
    const post = canonical.entities.posts[0];
    expect(PostEntityV2Schema.safeParse({ ...post, alt: "Gallery-only field" }).success).toBe(false);
    expect(parseSiteDocument({ ...canonical, entities: { ...canonical.entities, posts: [{ ...post, alt: "Gallery-only field" }] } })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("preserves canonical OC media alt while basic modules edit, project, reload, and export", () => {
    const canonical = migratedFixture();
    const post = canonical.entities.posts[0];
    if (!post.media || post.media.length !== 2) throw new Error("Expected two OC media items");
    post.media[0].alt = "Primary OC image description";
    post.media[0].crop = { x: 20, y: 40, zoom: 2 };
    post.media[1].alt = "Secondary OC image description";
    const expectedMedia = structuredClone(post.media);
    const view = projectV2ToLegacyDocument(canonical);
    if (!view.ok) throw new Error("Legacy projection failed");
    const firstImage = mediaContent(view.document).blocks[0];
    if (firstImage.kind !== "image") throw new Error("Expected image block");
    firstImage.caption = "A document edit must not replace OC media text";
    const merged = mergeLegacyDocumentIntoV2(canonical, view.document, { siteId: SITE_ID });
    expect(merged.entities.posts[0].media).toEqual(expectedMedia);
    const reloaded = parseSiteDocument(JSON.parse(JSON.stringify(merged)));
    if (!reloaded.ok || reloaded.version !== 2) throw new Error("OC reload failed");
    expect(reloaded.document.entities.posts[0].media).toEqual(expectedMedia);
    const projected = projectPublicSiteDocument(reloaded.document, SITE_ID);
    if (!projected.ok || projected.version !== 2) throw new Error("OC public projection failed");
    expect(projected.document.entities.posts[0].media).toEqual(expectedMedia);
    const exported = createRetroExport({ scope: "public", siteId: SITE_ID, username: "media", siteName: canonical.siteName, document: merged });
    if (!exported.ok) throw new Error("OC export failed");
    const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
    if (!imported.ok || imported.value.document.schemaVersion !== 2) throw new Error("OC import failed");
    expect(imported.value.document.entities.posts[0].media).toEqual(expectedMedia);
    expect(canonical.entities.posts[0].media).toEqual(expectedMedia);
  });
});


describe("Q0 combined reader and export compatibility", () => {
  function combinedFixture() {
    const legacy = legacyFixture();
    const explorer = makeWindow("explorer", legacy.windows.length);
    const music = makeWindow("music", legacy.windows.length + 1);
    if (explorer.type !== "explorer" || music.type !== "music") throw new Error("Q0 fixture types");
    legacy.windows[0].chrome = WindowChromeSchema.parse({ preset: "compact-98", controls: ["close"] });
    legacy.windows[1].icon = "haiku:folder";
    explorer.content.folders = [{ id: "art-folder", parentId: null, name: "Artwork", icon: "pixelart:heart", order: 0, visibility: "published" }];
    explorer.content.shortcuts = [{ id: "art-shortcut", parentId: "art-folder", label: "Gallery", icon: "pixelarticons:image", order: 0, visibility: "published", target: { siteId: SITE_ID, kind: "window", id: "gallery-media" } }];
    music.content.tracks = [{ id: "platform-track", title: "Platform link", artist: "", cover: null, coverUrl: "", lyrics: "", rightsNote: "", source: { kind: "providerEmbed", provider: "spotify", resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA", originalUrl: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA" } }];
    music.content.playlist.trackIds = ["platform-track"];
    legacy.windows.push(explorer, music);
    return legacy;
  }

  function allPresentation(document: SiteDocument | SiteDocumentV2Input) {
    return document.windows.filter((window) => window.type !== "instagram").map((window) => ({ id: window.id, icon: window.icon, chrome: window.chrome, content: window.content }));
  }

  it.each(["owner-backup", "public"] as const)("keeps chrome, all three icon sets, embeds and media semantics through %s transfers", (scope) => {
    const legacy = combinedFixture();
    const expected = allPresentation(legacy);
    const v1 = parseSiteDocument(JSON.parse(JSON.stringify(legacy)));
    if (!v1.ok || v1.version !== 1) throw new Error("Q0 v1 parse");
    expect(allPresentation(v1.document)).toEqual(expected);
    const migrated = migrateSiteDocumentV2(legacy, { siteId: SITE_ID });
    if (!migrated.ok || migrated.version !== 2) throw new Error("Q0 migration");
    const view = projectV2ToLegacyDocument(migrated.document);
    if (!view.ok) throw new Error("Q0 view adapter");
    view.document.siteName = "Edited without losing presentation";
    const updated = mergeLegacyDocumentIntoV2(migrated.document, view.document, { siteId: SITE_ID });
    expect(allPresentation(updated)).toEqual(expected);
    const projected = projectPublicSiteDocument(updated, SITE_ID);
    if (!projected.ok || projected.version !== 2) throw new Error("Q0 public projection");
    // Public/export documents retain player identity, not the author's pasted URL.
    const publicExpected = structuredClone(expected);
    for (const window of publicExpected) {
      if ("tracks" in window.content) for (const track of window.content.tracks) {
        if (track.source.kind === "providerEmbed") track.source.originalUrl = "";
      }
    }
    expect(allPresentation(projected.document)).toEqual(publicExpected);
    for (const document of [v1.document, updated]) {
      const exported = createRetroExport({ scope, document, siteId: SITE_ID, username: "media", siteName: document.siteName });
      if (!exported.ok) throw new Error("Q0 export");
      const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
      if (!imported.ok) throw new Error("Q0 import");
      // Exports also replace the source site scope; renderer values remain exact.
      const exportExpected = structuredClone(publicExpected);
      for (const window of exportExpected) {
        if ("shortcuts" in window.content) for (const shortcut of window.content.shortcuts) shortcut.target.siteId = "export:site";
      }
      expect(allPresentation(imported.value.document)).toEqual(exportExpected);
      expect(JSON.stringify(imported.value.document)).not.toContain(SITE_ID);
      expectOriginalMedia(imported.value.document);
    }
  });
});
