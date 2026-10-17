import { describe, expect, it } from "vitest";
import {
  createRetroExport,
  createStarterDocument,
  inspectRetroImport,
  loadVersionedSiteDocument,
  makeWindow,
  mergeLegacyDocumentIntoV2,
  migrateSiteDocumentV2,
  parseSiteDocument,
  projectPublicSiteDocument,
  projectV2ToLegacyDocument,
  resolveWindowChrome,
  SiteDocumentSchema,
  SiteDocumentV2Schema,
  WindowChromeSchema,
  type DesktopWindow,
  type SiteDocument,
  type SiteDocumentV2Input,
  type WindowChromeInput
} from "../src";

const defaults = {
  preset: "classic-98",
  controls: ["minimize", "maximize", "close"],
  showIcon: true,
  density: "normal"
};
const windowTypes: DesktopWindow["type"][] = [
  "document", "gallery", "links", "about", "instagram", "music",
  "moodboard", "explorer", "minesweeper", "character-dialog", "guestbook"
];
const configurations: WindowChromeInput[] = [
  { preset: "classic-95", controls: ["minimize", "close"], sections: { menuBar: true, toolbar: false, statusBar: true } },
  { preset: "classic-98", showIcon: false, sections: { footerActions: false } },
  { preset: "compact-98", density: "compact", controls: [], sections: {} }
];

function fixture(configured = true): SiteDocument {
  const document = createStarterDocument("Window chrome", "classic98", "blank");
  document.windows = windowTypes.map((type, index) => {
    const window = makeWindow(type, index);
    window.id = `window-${type}`;
    window.appearance = { titleFrom: "#112244", titleTo: "#556688", titleGradient: index % 2 === 0 };
    if (configured) window.chrome = WindowChromeSchema.parse(configurations[index % configurations.length]);
    return window;
  });
  return document;
}

function migrate(document: SiteDocument): SiteDocumentV2Input {
  const result = migrateSiteDocumentV2(document, { siteId: "site-chrome" });
  if (!result.ok || result.version !== 2) throw new Error("Window fixture migration failed");
  return result.document;
}

function windowPresentation(document: { windows: Array<{ id: string; chrome?: WindowChromeInput; appearance?: unknown; layout: unknown }> }) {
  return document.windows.map(({ id, chrome, appearance, layout }) => ({ id, chrome, appearance, layout }));
}

function expectAbsentChrome(document: { windows: Array<{ chrome?: WindowChromeInput }> }) {
  for (const window of document.windows) expect(Object.hasOwn(window, "chrome")).toBe(false);
}

describe("window chrome data contract", () => {
  it("resolves partial presentation settings without mutating input or sharing default arrays", () => {
    const partial: WindowChromeInput = { sections: { toolbar: false, statusBar: true } };
    const before = structuredClone(partial);
    expect(resolveWindowChrome(partial)).toEqual({ ...defaults, sections: { toolbar: false, statusBar: true } });
    expect(partial).toEqual(before);
    const first = resolveWindowChrome();
    first.controls.pop();
    expect(resolveWindowChrome()).toEqual(defaults);
    expect(Object.hasOwn(resolveWindowChrome(), "sections")).toBe(false);
  });

  it("keeps missing sections automatic and permits explicitly hidden controls and icon", () => {
    expect(WindowChromeSchema.parse({ controls: [], showIcon: false, sections: { menuBar: false } })).toEqual({
      ...defaults, controls: [], showIcon: false, sections: { menuBar: false }
    });
  });

  it("fills defaults only inside a present chrome object in both document versions", () => {
    const legacy = fixture(false);
    const rawV1 = { ...legacy, windows: legacy.windows.map((window, index) => index === 0 ? { ...window, chrome: {} } : window) };
    const parsedV1 = SiteDocumentSchema.parse(rawV1);
    expect(parsedV1.windows[0].chrome).toEqual(defaults);
    expectAbsentChrome({ windows: parsedV1.windows.slice(1) });
    const rawV2 = migrate(legacy);
    rawV2.windows[0].chrome = { preset: "classic-95", sections: { footerActions: false } };
    const before = structuredClone(rawV2);
    const parsedV2 = SiteDocumentV2Schema.parse(rawV2);
    expect(parsedV2.windows[0].chrome).toEqual({ ...defaults, preset: "classic-95", sections: { footerActions: false } });
    expectAbsentChrome({ windows: parsedV2.windows.slice(1) });
    expect(rawV2).toEqual(before);

    // The existing v2 load/migrate boundary is validation-only and must keep
    // the caller's raw input, including optional/defaulted fields, unchanged.
    const loaded = loadVersionedSiteDocument(rawV2);
    const migratedAgain = migrateSiteDocumentV2(rawV2, { siteId: "site-chrome" });
    if (!loaded.ok || !migratedAgain.ok) throw new Error("Valid partial chrome was rejected");
    expect(loaded.document).toBe(rawV2);
    expect(migratedAgain.document).toBe(rawV2);
    expect(rawV2).toEqual(before);
  });

  it.each([
    ["unsupported preset", { preset: "pixel-flat" }],
    ["arbitrary CSS", { style: "background: url(https://example.com/track)" }],
    ["callback", { onClose: () => undefined }],
    ["unknown control", { controls: ["fullscreen"] }],
    ["duplicate controls", { controls: ["close", "close"] }],
    ["too many controls", { controls: ["minimize", "maximize", "close", "minimize"] }],
    ["unknown section", { sections: { custom: true } }],
    ["nested runtime node", { sections: { toolbar: { type: "div", children: "Toolbar" } } }],
    ["non-boolean visibility", { showIcon: "false" }],
    ["unknown density", { density: "huge" }],
    ["null chrome", null]
  ])("rejects %s at standalone, v1, v2 and migration boundaries", (_name, chrome) => {
    const legacy = fixture(false);
    const v2 = migrate(legacy);
    const rawV1 = { ...legacy, windows: [{ ...legacy.windows[0], chrome }] };
    const rawV2 = { ...v2, windows: [{ ...v2.windows[0], chrome }] };
    expect(WindowChromeSchema.safeParse(chrome).success).toBe(false);
    expect(SiteDocumentSchema.safeParse(rawV1).success).toBe(false);
    expect(SiteDocumentV2Schema.safeParse(rawV2).success).toBe(false);
    expect(parseSiteDocument(rawV1)).toMatchObject({ ok: false, code: "invalid" });
    expect(parseSiteDocument(rawV2)).toMatchObject({ ok: false, code: "invalid" });
    expect(migrateSiteDocumentV2(rawV1, { siteId: "site-chrome" })).toMatchObject({ ok: false, code: "invalid" });
    expect(migrateSiteDocumentV2(rawV2, { siteId: "site-chrome" })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("window chrome persistence", () => {
  it("retains preferences, appearance and layout for every window type through v1/v2 and legacy edits", () => {
    const legacy = fixture();
    const original = structuredClone(legacy);
    const versioned = migrate(legacy);
    const expected = windowPresentation(legacy);
    expect(windowPresentation(versioned)).toEqual(expected);
    const view = projectV2ToLegacyDocument(versioned);
    if (!view.ok) throw new Error("Legacy view projection failed");
    expect(windowPresentation(view.document)).toEqual(expected);
    expect(windowPresentation(mergeLegacyDocumentIntoV2(versioned, view.document, { siteId: "site-chrome" }))).toEqual(expected);
    expect(legacy).toEqual(original);

    // Editor removal must restore automatic chrome, including on Instagram's
    // special entity-backed adapter, instead of resurrecting an old config.
    for (const window of view.document.windows) delete window.chrome;
    const edited = mergeLegacyDocumentIntoV2(versioned, view.document, { siteId: "site-chrome" });
    expectAbsentChrome(edited);
    expect(windowPresentation(versioned)).toEqual(expected);
  });

  it("preserves chrome on retained public windows while excluding draft profile windows", () => {
    const versioned = migrate(fixture());
    versioned.entities.profiles[0].visibility = "draft";
    const before = structuredClone(versioned);
    const publicResult = projectPublicSiteDocument(versioned, "site-chrome");
    if (!publicResult.ok) throw new Error("Public projection failed");
    expect(publicResult.document.windows.some((window) => window.type === "instagram")).toBe(false);
    expect(windowPresentation(publicResult.document)).toEqual(windowPresentation({ windows: versioned.windows.filter((window) => window.type !== "instagram") }));
    expect(versioned).toEqual(before);
  });

  it.each(["public", "owner-backup"] as const)("round-trips v1 and v2 presentation settings in %s JSON export/import", (scope) => {
    const legacy = fixture();
    for (const document of [legacy, migrate(legacy)]) {
      const before = structuredClone(document);
      const exported = createRetroExport({ scope, siteId: "site-chrome", username: "chrome", siteName: "Window chrome", document });
      if (!exported.ok) throw new Error("Export failed");
      const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
      if (!imported.ok) throw new Error("Import failed");
      expect(windowPresentation(imported.value.document)).toEqual(windowPresentation(document));
      expect(document).toEqual(before);

      const unsafe = { ...document, windows: [{ ...document.windows[0], chrome: { sections: { toolbar: "<script>" } } }] };
      expect(projectPublicSiteDocument(unsafe, "site-chrome")).toMatchObject({ ok: false, code: "invalid" });
      expect(createRetroExport({ scope, siteId: "site-chrome", username: "chrome", siteName: "Unsafe chrome", document: unsafe })).toMatchObject({ ok: false, code: "invalid_document" });
      const tampered = JSON.parse(JSON.stringify(exported.value));
      tampered.document.windows[0].chrome.sections = { toolbar: true, html: "<script>" };
      expect(inspectRetroImport(tampered)).toMatchObject({ ok: false, code: "invalid_package" });
    }
  });

  it("never materializes chrome in old documents through parsing, migration, public views and transfers", () => {
    const legacy = SiteDocumentSchema.parse(fixture(false));
    const versioned = migrate(legacy);
    const view = projectV2ToLegacyDocument(versioned);
    if (!view.ok) throw new Error("Legacy projection failed");
    expectAbsentChrome(view.document);
    expectAbsentChrome(mergeLegacyDocumentIntoV2(versioned, view.document, { siteId: "site-chrome" }));
    for (const document of [legacy, versioned]) {
      expectAbsentChrome(document);
      const projected = projectPublicSiteDocument(document, "site-chrome");
      if (!projected.ok) throw new Error("Public projection failed");
      expectAbsentChrome(projected.document);
      const exported = createRetroExport({ scope: "public", siteId: "site-chrome", username: "chrome", siteName: "Legacy chrome", document });
      if (!exported.ok) throw new Error("Export failed");
      const imported = inspectRetroImport(JSON.parse(JSON.stringify(exported.value)));
      if (!imported.ok) throw new Error("Import failed");
      expectAbsentChrome(imported.value.document);
    }
  });
});
