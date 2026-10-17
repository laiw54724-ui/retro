import { describe, expect, it } from "vitest";
import { createRetroExport, createStarterDocument, EXPORT_SITE_ID, inspectRetroImport, makeIgPost, makeWindow, migrateSiteDocumentV2, remapDocumentSiteId, validateSiteDocumentScope } from "../src";

function fixture() {
  const legacy = createStarterDocument("OC World", "classic98", "instagram");
  const ig = legacy.windows.find((window) => window.type === "instagram");
  if (!ig || ig.type !== "instagram") throw new Error("fixture Instagram missing");
  ig.content.profile.avatar = "retro-asset:11111111-1111-4111-8111-111111111111";
  ig.content.profile.avatarUrl = "https://private.example/avatar.png?token=must-not-leak";
  ig.content.images = [makeIgPost({ title: "Post", src: "https://cdn.example.com/post.png", srcUrl: "https://raw.example/post.png?signature=secret" })];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
  return migrated.document;
}

describe("Retro JSON export/import", () => {
  it("strips authoring mirrors, records missing private media, and remaps site references", () => {
    const result = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "alice", siteName: "OC World", document: fixture(), exportedAt: "2026-10-17T00:00:00.000Z" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.stringify(result.value)).not.toContain("must-not-leak");
    expect(JSON.stringify(result.value)).not.toContain("signature=secret");
    expect(result.value.mediaManifest.missing).toHaveLength(1);
    expect(validateSiteDocumentScope(result.value.document, EXPORT_SITE_ID)).toEqual([]);
    const preview = inspectRetroImport(JSON.parse(JSON.stringify(result.value)));
    expect(preview).toMatchObject({ ok: true, preview: { schemaVersion: 2, windowCount: 2, profileCount: 1, postCount: 1, mediaCount: 3 } });
    if (!preview.ok) return;
    const imported = remapDocumentSiteId(preview.value.document, EXPORT_SITE_ID, "site-copy");
    expect(validateSiteDocumentScope(imported, "site-copy")).toEqual([]);
    expect(imported.entities.posts[0].authorProfileId).toBe(preview.value.document.entities.posts[0].authorProfileId);
  });

  it("public export excludes draft entities and blocks credential-bearing authored links", () => {
    const document = fixture();
    document.entities.profiles[0].visibility = "draft";
    const publicResult = createRetroExport({ scope: "public", siteId: "site-a", username: "alice", siteName: "OC World", document });
    expect(publicResult.ok).toBe(true);
    if (publicResult.ok) expect(publicResult.value.document.entities.profiles).toEqual([]);

    const unsafe = fixture();
    const links = makeWindow("links", unsafe.windows.length);
    if (!links || links.type !== "links") throw new Error("link fixture missing");
    links.content.links[0] = { id: "secret", label: "secret", icon: "link", color: "#000000", target: "url", url: "https://example.com/?access_token=secret-value-here", windowId: "", iconUrl: "" };
    unsafe.windows.push(links);
    expect(createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "alice", siteName: "Unsafe", document: unsafe })).toMatchObject({ ok: false, code: "sensitive_content" });
  });

  it("rejects unknown formats, path traversal, and oversized manifests", () => {
    expect(inspectRetroImport({ format: "zip", formatVersion: 1 })).toMatchObject({ ok: false, code: "unsupported_format" });
    const result = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "alice", siteName: "OC World", document: fixture() });
    if (!result.ok) throw new Error("export failed");
    const traversal = structuredClone(result.value);
    traversal.mediaManifest.items[0].documentPath = "/../../secret";
    expect(inspectRetroImport(traversal)).toMatchObject({ ok: false, code: "unsupported_format" });
    const oversized = structuredClone(result.value) as any;
    oversized.mediaManifest.items = Array.from({ length: 2001 }, (_, index) => ({ ...result.value.mediaManifest.items[0], id: `m${index}` }));
    expect(inspectRetroImport(oversized)).toMatchObject({ ok: false, code: "unsupported_format" });
  });

  it("keeps library icon ids (windows, links and explorer items) through export and import without upstream URLs", () => {
    const legacy = createStarterDocument("Icons", "classic98", "instagram");
    legacy.windows[0].icon = "haiku:folder";
    const explorer = makeWindow("explorer");
    if (explorer.type !== "explorer") throw new Error("fixture explorer missing");
    explorer.content = { folders: [{ id: "f1", parentId: null, name: "相片", order: 0, visibility: "published", icon: "pixelart:calendar" }], shortcuts: [] };
    legacy.windows.push(explorer);
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok) throw new Error("migration failed");
    const exported = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "alice", siteName: "Icons", document: migrated.document });
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const text = JSON.stringify(exported.value);
    expect(text).toContain("haiku:folder");
    expect(text).toContain("pixelart:calendar");
    expect(text).not.toContain("github.com");
    const imported = inspectRetroImport(JSON.parse(text));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.document.windows[0].icon).toBe("haiku:folder");
    const importedExplorer = imported.value.document.windows.find((window) => window.type === "explorer");
    expect(importedExplorer?.type === "explorer" && importedExplorer.content.folders[0].icon).toBe("pixelart:calendar");
  });
});
