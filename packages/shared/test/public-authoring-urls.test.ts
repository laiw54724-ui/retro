import { describe, expect, it } from "vitest";
import { createRetroExport, createStarterDocument, makeGalleryImage, makeIgPost, makeWindow, migrateSiteDocumentV2, parseSiteDocument, projectPublicSiteDocument } from "../src";

const raw = (field: string) => `https://author-input.example/${field}?input=AUTHOR_ONLY_INPUT`;
const media = (field: string) => `https://public-media.example/${field}.png`;
const canonicalEmbedUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const mediaFields = ["document", "gallery", "about", "profile", "post", "extra", "highlight", "music", "image", "moodboard", "character"];

function fixture(withMedia: boolean) {
  const document = createStarterDocument("URL boundary", "classic98", "blank");
  const source = (field: string) => withMedia ? media(field) : null;
  document.windows = ["document", "gallery", "about", "instagram", "music", "image", "moodboard", "character-dialog", "links"].map((type, index) => {
    const window = makeWindow(type as Parameters<typeof makeWindow>[0], index);
    switch (window.type) {
      case "document":
        window.content.blocks = [
          { id: "doc-image", kind: "image", src: source("document"), srcUrl: raw("document"), alt: "Visible alt", caption: "Visible caption" },
          { id: "doc-link", kind: "link", text: "Author-selected public link", url: "https://public.example/profile?section=about" },
          { id: "doc-text", kind: "text", text: "The words srcUrl and avatarUrl are public authored text.", align: "left", bold: false, italic: false }
        ];
        break;
      case "gallery":
        window.content.images = [makeGalleryImage({ id: "gallery-image", src: source("gallery"), srcUrl: raw("gallery"), title: "Visible title", alt: "Visible gallery alt" })];
        break;
      case "about":
        window.content.avatar = source("about");
        window.content.avatarUrl = raw("about");
        break;
      case "instagram":
        window.content.profile.avatar = source("profile");
        window.content.profile.avatarUrl = raw("profile");
        window.content.profile.highlights = [{ id: "highlight", title: "Public highlight", src: source("highlight"), srcUrl: raw("highlight") }];
        window.content.images = [makeIgPost({ id: "post", src: source("post"), srcUrl: raw("post"), extra: [{ id: "extra", src: source("extra"), srcUrl: raw("extra") }] })];
        break;
      case "music":
        window.content.tracks = [
          { id: "audio", title: "Audio", artist: "Artist", cover: source("music"), coverUrl: raw("music"), source: { kind: "audioUrl", url: "https://public-media.example/audio.mp3" }, lyrics: "Public lyrics", rightsNote: "Public rights" },
          { id: "embed", title: "Embed", artist: "Artist", cover: null, coverUrl: "", source: { kind: "providerEmbed", provider: "youtube", resourceType: "video", resourceId: "dQw4w9WgXcQ", canonicalUrl: canonicalEmbedUrl, originalUrl: `${canonicalEmbedUrl}&authorInput=AUTHOR_ONLY_INPUT` }, lyrics: "", rightsNote: "" }
        ];
        window.content.playlist.trackIds = ["audio", "embed"];
        break;
      case "image":
        window.content.src = source("image");
        window.content.srcUrl = raw("image");
        break;
      case "moodboard":
        window.content.elements = [{ id: "mood-image", kind: "image", x: 0, y: 0, width: 100, height: 100, zOrder: 0, locked: false, src: source("moodboard"), srcUrl: raw("moodboard"), alt: "Visible moodboard alt" }];
        break;
      case "character-dialog":
        window.content.image = source("character");
        window.content.imageUrl = raw("character");
        break;
      case "links":
        window.content.links[0].icon = "https://public-media.example/icon.png";
        window.content.links[0].iconUrl = raw("icon");
        break;
    }
    return window;
  });
  return document;
}

function documentFor(version: number, withMedia = true) {
  const legacy = fixture(withMedia);
  if (version === 1) return legacy;
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!migrated.ok) throw new Error("Fixture migration failed");
  return migrated.document;
}

describe("public author-input URL boundary", () => {
  it.each([[1, true], [1, false], [2, true], [2, false]] as const)("clears raw fields in v%s (render media: %s) without changing drafts or renderer data", (version, withMedia) => {
    const document = documentFor(version, withMedia);
    const before = structuredClone(document);
    expect(parseSiteDocument(document).ok).toBe(true);
    expect(JSON.stringify(document)).toContain("AUTHOR_ONLY_INPUT");
    const projected = projectPublicSiteDocument(document, "site-a");
    if (!projected.ok) throw new Error("Projection failed");
    const json = JSON.stringify(projected.document);
    expect(json).not.toContain("AUTHOR_ONLY_INPUT");
    expect(json).not.toContain("author-input.example");
    expect(parseSiteDocument(projected.document).ok).toBe(true);
    expect(projected.version).toBe(version);
    expect(document).toEqual(before);
    for (const field of mediaFields) {
      if (withMedia) expect(json).toContain(media(field));
      else expect(json).not.toContain(media(field));
    }
    expect(json).toContain("https://public-media.example/icon.png");
    expect(json).toContain("https://public-media.example/audio.mp3");
    expect(json).toContain(canonicalEmbedUrl);
    expect(json).toContain("https://public.example/profile?section=about");
    expect(json).toContain("The words srcUrl and avatarUrl are public authored text.");
    expect(json).toContain("Visible caption");
    expect(projectPublicSiteDocument(projected.document, "site-a")).toEqual(projected);
  });

  it.each([1, 2])("public v%s export shares the boundary while keeping media manifest references", (version) => {
    const document = documentFor(version);
    const before = structuredClone(document);
    const exported = createRetroExport({ scope: "public", siteId: "site-a", username: "example", siteName: document.siteName, document });
    if (!exported.ok) throw new Error("Export failed");
    expect(JSON.stringify(exported.value)).not.toContain("AUTHOR_ONLY_INPUT");
    expect(exported.value.mediaManifest.items).toEqual(expect.arrayContaining(mediaFields.map((field) => expect.objectContaining({ source: media(field) }))));
    expect(parseSiteDocument(exported.value.document).ok).toBe(true);
    expect(document).toEqual(before);
  });
});
