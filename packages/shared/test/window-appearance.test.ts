import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createRetroExport, createStarterDocument, inspectRetroImport, migrateSiteDocumentV2, projectPublicSiteDocument, projectV2ToLegacyDocument, SiteDocumentSchema, WindowAppearanceSchema, loadVersionedSiteDocument, mergeLegacyDocumentIntoV2, parseSiteDocument } from "../src";

describe("existing window appearance persistence", () => {
  it("preserves solid and gradient titles through v2, public projection, export and import", () => {
    const document = createStarterDocument("Appearance", "classic98", "card");
    const solid = { titleFrom: "#ffffff", titleTo: "#000000", titleGradient: false };
    const gradient = { titleFrom: "#001144", titleTo: "#004444", titleGradient: true };
    document.windows[0].appearance = solid;
    document.windows[1].appearance = gradient;
    const parsed = SiteDocumentSchema.parse(JSON.parse(JSON.stringify(document)));
    const migrated = migrateSiteDocumentV2(parsed, { siteId: "site-a" });
    if (!migrated.ok) throw new Error("migration failed");
    const view = projectV2ToLegacyDocument(migrated.document);
    if (!view.ok) throw new Error("view projection failed");
    expect(view.document.windows.map((window) => window.appearance)).toEqual([solid, gradient]);
    const publicResult = projectPublicSiteDocument(migrated.document, "site-a");
    if (!publicResult.ok) throw new Error("public projection failed");
    expect(publicResult.document.windows.map((window) => window.appearance)).toEqual([solid, gradient]);
    const exported = createRetroExport({ scope: "public", siteId: "site-a", username: "alice", siteName: "Appearance", document: migrated.document });
    if (!exported.ok) throw new Error("export failed");
    const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
    if (!imported.ok) throw new Error("import failed");
    expect(imported.value.document.windows.map((window) => window.appearance)).toEqual([solid, gradient]);
  });
});

describe("P2 optional color reader contract", () => {
  const colors = { titleText: "#ffddaa", frameColor: "#112233", contentBackground: "#eeddcc", contentText: "#331122", desktopLabelText: "#ffffff", desktopLabelBackground: "#000000" };
  it("preserves partial fields through load, legacy edits, public projection and both export scopes", () => {
    const source = structuredClone(createStarterDocument("Colors", "classic98", "instagram"));
    source.theme.appearance = colors;
    source.windows[0].appearance = { ...colors, titleFrom: "#220044" };
    source.windows[1].appearance = { contentText: "#445566" };
    const migrated = migrateSiteDocumentV2(source, { siteId: "site-a" });
    if (!migrated.ok) throw new Error("migration");
    const expected = migrated.document.windows.map((window) => window.appearance);
    const reloaded = loadVersionedSiteDocument(JSON.parse(JSON.stringify(migrated.document)));
    if (!reloaded.ok || reloaded.version !== 2) throw new Error("reload");
    const view = projectV2ToLegacyDocument(reloaded.document);
    if (!view.ok) throw new Error("view");
    expect(view.document.theme.appearance).toEqual(colors);
    expect(view.document.windows.map((window) => window.appearance)).toEqual(expected);
    const merged = mergeLegacyDocumentIntoV2(reloaded.document, view.document, { siteId: "site-a" });
    expect(merged.windows.map((window) => window.appearance)).toEqual(expected);
    const projected = projectPublicSiteDocument(merged, "site-a");
    if (!projected.ok) throw new Error("public");
    expect(projected.document.theme.appearance).toEqual(colors);
    expect(projected.document.windows.map((window) => window.appearance)).toEqual(expected);
    for (const scope of ["public", "owner-backup"] as const) {
      const exported = createRetroExport({ scope, siteId: "site-a", username: "alice", siteName: "Colors", document: merged });
      if (!exported.ok) throw new Error("export");
      const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
      if (!imported.ok) throw new Error("import");
      expect(imported.value.document.theme.appearance).toEqual(colors);
      expect(imported.value.document.windows.map((window) => window.appearance)).toEqual(expected);
    }
  });
  it("does not freeze defaults on old, empty or partial appearance", () => {
    expect(WindowAppearanceSchema.parse({})).toEqual({});
    expect(WindowAppearanceSchema.parse({ contentText: "#112233" })).toEqual({ contentText: "#112233" });
    const source = structuredClone(createStarterDocument("Old", "classic98", "card"));
    const migrated = migrateSiteDocumentV2(source, { siteId: "site-a" });
    if (!migrated.ok) throw new Error("migration");
    expect(migrated.document.theme.appearance).toBeUndefined();
    expect(migrated.document.windows.every((window) => window.appearance === undefined)).toBe(true);
  });
  it.each(["titleText", "frameColor", "contentBackground", "contentText", "desktopLabelText", "desktopLabelBackground"])("rejects invalid %s and unknown appearance keys at both boundaries", (field) => {
    for (const bad of ["red", "#123", "#gggggg", "url(x)", null, 42]) {
      const source = structuredClone(createStarterDocument("Invalid", "classic98", "card"));
      const v2 = migrateSiteDocumentV2(source, { siteId: "site-a" });
      if (!v2.ok) throw new Error("migration");
      for (const document of [source, v2.document]) {
        const windowBad = structuredClone(document);
        windowBad.windows[0].appearance = { [field]: bad } as never;
        expect(parseSiteDocument(windowBad).ok).toBe(false);
        const themeBad = structuredClone(document);
        themeBad.theme.appearance = { [field]: bad } as never;
        expect(parseSiteDocument(themeBad).ok).toBe(false);
      }
    }
    expect(WindowAppearanceSchema.safeParse({ [field]: "#112233", css: "anything" }).success).toBe(false);
  });
});

// Frozen pre-P2 nested contracts from reviewed #89. This documents why reader-first
// deployment is required, rather than asserting that old readers can roll back safely.
describe("pre-P2 reader compatibility evidence", () => {
  const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
  const oldAppearance = z.object({ titleFrom: hex, titleTo: hex, titleGradient: z.boolean().default(true) });
  it("shows an old v1 nested reader strips new colors and an old strict v2 reader rejects them", () => {
    const next = { titleFrom: "#112233", titleTo: "#445566", titleGradient: true, contentText: "#aabbcc" };
    expect(oldAppearance.parse(next)).toEqual({ titleFrom: "#112233", titleTo: "#445566", titleGradient: true });
    expect(oldAppearance.strict().safeParse(next).success).toBe(false);
    expect(WindowAppearanceSchema.parse(next)).toEqual(next);
  });
});
