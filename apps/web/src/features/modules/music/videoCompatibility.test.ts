import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow, MusicSourceSchema, parseSiteDocument, migrateSiteDocumentV2, projectV2ToLegacyDocument, mergeLegacyDocumentIntoV2, projectPublicSiteDocument, createRetroExport, inspectRetroImport } from "@retrodesk/shared";

const URL = "https://media.example.com/clip.MP4?v=example#t=1";
function fixture() {
  const document = createStarterDocument("Video compatibility", "classic98", "card");
  const music = makeWindow("music", 0);
  if (music.type !== "music") throw new Error("Music fixture");
  music.content.tracks = [{ id: "video", title: "Video", artist: "", cover: null, coverUrl: "", source: { kind: "audioUrl", url: URL }, lyrics: "", rightsNote: "Original" }];
  music.content.playlist.trackIds = ["video"];
  document.windows = [music];
  return document;
}
function source(document: { windows: { type: string; content: unknown }[] }) {
  const music = document.windows.find((window) => window.type === "music");
  if (music?.type !== "music") throw new Error("Missing Music");
  return (music.content as { tracks: { source: unknown }[] }).tracks[0].source;
}

describe("M3 unchanged audioUrl persistence", () => {
  it("uses the existing source shape accepted by pre-M3 readers", () => {
    expect(MusicSourceSchema.parse({ kind: "audioUrl", url: URL })).toEqual({ kind: "audioUrl", url: URL });
  });
  it("retains the exact URL in v1/v2 reload, legacy editing and public projection", () => {
    const original = fixture();
    expect(parseSiteDocument(JSON.parse(JSON.stringify(original)))).toMatchObject({ ok: true, version: 1 });
    const migrated = migrateSiteDocumentV2(original, { siteId: "video-site" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("Migration");
    const view = projectV2ToLegacyDocument(migrated.document);
    if (!view.ok) throw new Error("Projection");
    view.document.siteName = "Edited";
    const merged = mergeLegacyDocumentIntoV2(migrated.document, view.document, { siteId: "video-site" });
    const parsed = parseSiteDocument(JSON.parse(JSON.stringify(merged)));
    if (!parsed.ok || parsed.version !== 2) throw new Error("Reload");
    expect(source(parsed.document)).toEqual(source(original));
    const published = projectPublicSiteDocument(parsed.document, "video-site");
    if (!published.ok) throw new Error("Public projection");
    expect(source(published.document)).toEqual(source(original));
  });
  it.each(["public", "owner-backup"] as const)("survives v1/v2 %s export/import unchanged", (scope) => {
    const original = fixture();
    const migrated = migrateSiteDocumentV2(original, { siteId: "video-site" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("Migration");
    for (const document of [original, migrated.document]) {
      const exported = createRetroExport({ scope, document, siteId: "video-site", username: "video", siteName: "Video" });
      if (!exported.ok) throw new Error("Export");
      const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
      if (!imported.ok) throw new Error("Import");
      expect(source(imported.value.document)).toEqual(source(original));
    }
  });
});
