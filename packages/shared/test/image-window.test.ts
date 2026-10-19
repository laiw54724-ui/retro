import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ImageContentSchema, buildPublishChecks, createRetroExport, createStarterDocument, inspectRetroImport, makeWindow, mergeLegacyDocumentIntoV2, migrateSiteDocumentV2, parseSiteDocument, projectPublicSiteDocument, projectV2ToLegacyDocument } from "../src";

const asset = "retro-asset:11111111-1111-4111-8111-111111111111";
function imageDocument() {
  const document = createStarterDocument("Image reader", "classic98", "card");
  const window = makeWindow("image");
  if (window.type !== "image") throw new Error("image default");
  window.content = { ...window.content, src: asset, srcUrl: "https://raw.example/image.png?signature=private", alt: "Character portrait", caption: "Original artwork", crop: { x: 25, y: 75, zoom: 2 }, background: { color: "#112233" }, pixelated: true };
  document.windows.push(window);
  return document;
}
function canonical(document = imageDocument()) {
  const migrated = migrateSiteDocumentV2(document, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration");
  return migrated.document;
}

describe("strict image window reader contract", () => {
  it("has explicit safe defaults while retaining the existing window title", () => {
    const image = makeWindow("image");
    expect(image).toMatchObject({ type: "image", title: "圖片", icon: "photo", content: { src: null, srcUrl: "", alt: "", caption: "", fit: "contain", background: "transparent", pixelated: false, showCaption: true, frameMode: "simple", interactionMode: "content" } });
    expect(ImageContentSchema.parse({ src: null })).toEqual(image.content);
  });
  it.each([
    { src: "javascript:alert(1)" }, { src: "blob:temporary" }, { fit: "stretch" }, { frameMode: "paint-canvas" }, { interactionMode: "clickable" },
    { actions: [] }, { title: "duplicate title" }, { background: { color: "red" } }, { background: { color: "#112233", extra: true } },
    { crop: { x: 0, y: 0, zoom: 1, extra: true } }, { crop: { x: 101, y: 0, zoom: 1 } }, { alt: "x".repeat(301) }, { caption: "x".repeat(301) }, { srcUrl: "x".repeat(2049) }
  ])("rejects unsupported data without stripping it: %j", (patch) => {
    const raw = imageDocument(); const image = raw.windows.at(-1)!;
    Object.assign(image.content, patch);
    expect(parseSiteDocument(raw).ok).toBe(false);
    const v2 = canonical(); Object.assign(v2.windows.at(-1)!.content, patch);
    expect(parseSiteDocument(v2).ok).toBe(false);
  });
  it("preserves v1/v2, migration, legacy projection, merge and independent duplicate data", () => {
    const v1 = imageDocument(), before = structuredClone(v1), v2 = canonical(v1);
    expect(parseSiteDocument(v1).ok).toBe(true); expect(parseSiteDocument(v2).ok).toBe(true);
    const projected = projectV2ToLegacyDocument(v2); if (!projected.ok) throw new Error("projection");
    expect(projected.document.windows.at(-1)).toEqual(v1.windows.at(-1));
    const copy = structuredClone(projected.document.windows.at(-1)!); copy.id = "image-copy";
    projected.document.windows.push(copy);
    const merged = mergeLegacyDocumentIntoV2(v2, projected.document, { siteId: "site-a" });
    expect(merged.windows.at(-1)).toEqual(copy); expect(parseSiteDocument(merged).ok).toBe(true);
    expect(v1).toEqual(before);
  });
  it("demonstrates the frozen old discriminant rejection rather than claiming rollback safety", () => {
    const oldDiscriminant = z.object({ type: z.enum(["document", "gallery", "links", "about", "instagram", "music", "moodboard", "explorer", "minesweeper", "character-dialog", "guestbook"]) }).passthrough();
    expect(oldDiscriminant.safeParse(makeWindow("about")).success).toBe(true);
    expect(oldDiscriminant.safeParse(makeWindow("image")).success).toBe(false);
  });
  it("retains images in public projection without releasing unrelated private entities", () => {
    const document = canonical(), before = structuredClone(document);
    document.entities.profiles.forEach((profile) => { profile.visibility = "draft"; });
    const result = projectPublicSiteDocument(document, "site-a"); if (!result.ok || result.version !== 2) throw new Error("public projection");
    expect(result.document.windows.at(-1)).toEqual(document.windows.at(-1));
    expect(result.document.entities.profiles).toEqual([]);
    expect(before.windows).toEqual(document.windows);
  });
  it("warns for content images without alt but accepts explicitly decorative empty alt", () => {
    const document = imageDocument(), image = document.windows.at(-1)!;
    if (image.type !== "image") throw new Error("image");
    image.content.alt = "";
    expect(buildPublishChecks(document).some((check) => check.level === "warn" && check.text.includes("缺少說明"))).toBe(true);
    image.content.interactionMode = "decorative";
    expect(buildPublishChecks(document).some((check) => check.level === "warn" && check.text.includes("缺少說明"))).toBe(false);
  });
  it("exports references, strips raw authoring URLs and keeps private-media re-upload warnings on import", () => {
    const result = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "image-reader", siteName: "Image", document: canonical() });
    if (!result.ok) throw new Error("export");
    expect(JSON.stringify(result.value)).not.toContain("signature=private");
    expect(result.value.mediaManifest.items).toEqual(expect.arrayContaining([expect.objectContaining({ source: asset, disposition: "private-asset-reference", included: false })]));
    const imported = inspectRetroImport(result.value); if (!imported.ok) throw new Error("import");
    expect(imported.preview.missingMedia).toEqual(expect.arrayContaining([expect.objectContaining({ reason: expect.stringContaining("re-upload") })]));
    expect(imported.value.document.windows.at(-1)).toMatchObject({ type: "image", content: { src: asset, srcUrl: "", crop: { x: 25, y: 75, zoom: 2 } } });
    expect(result.value.rightsNotice).toContain("does not grant redistribution rights");
  });
});
