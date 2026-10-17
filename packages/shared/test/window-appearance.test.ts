import { describe, expect, it } from "vitest";
import { createRetroExport, createStarterDocument, inspectRetroImport, migrateSiteDocumentV2, projectPublicSiteDocument, projectV2ToLegacyDocument, SiteDocumentSchema } from "../src";

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
