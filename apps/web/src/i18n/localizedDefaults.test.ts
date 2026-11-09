import { beforeAll, describe, expect, it } from "vitest";
import { createDemoDocument, createStarterDocument, createTemplateDocument, makeWindow } from "@retrodesk/shared";
import { i18n, initI18n } from "./index";
import { DEFAULT_TEXT_KEYS, createLocalizedDocument, localizeDefaults } from "./localizedDefaults";
import { resources } from "./resources";
import { SUPPORTED_LOCALES } from "./locale";

const HAN = /[㐀-鿿]/;
beforeAll(async () => { await initI18n(); });

const strings = (value: unknown): string[] => typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

describe("localized creation defaults", () => {
  it("has a translation of every default in every locale", () => {
    for (const locale of SUPPORTED_LOCALES) for (const key of DEFAULT_TEXT_KEYS) {
      const name = key.replace("defaults.", "");
      const node = resources[locale].editor.defaults as Record<string, string>;
      expect(node[name], `${locale} ${key}`).toBeTypeOf("string");
    }
  });

  it.each(["en", "ja", "ko"] as const)("turns a new document window into %s text and leaves nothing untranslated", async (locale) => {
    await i18n.changeLanguage(locale);
    const localized = localizeDefaults(makeWindow("document"));
    expect(localized.title).not.toBe("新文件.txt");
    expect(strings(localized.content).filter((text) => HAN.test(text))).toEqual([]);
    for (const template of ["card", "oc", "portfolio", "instagram", "blank"] as const) {
      const doc = localizeDefaults(createTemplateDocument("My site", "classic98", template));
      expect(strings(doc.windows).filter((text) => HAN.test(text)), `${locale} ${template}`).toEqual([]);
    }
    for (const kind of ["card", "ig", "oc", "portfolio"] as const) expect(strings(localizeDefaults(createDemoDocument(kind)).windows).filter((text) => HAN.test(text)), `${locale} demo ${kind}`).toEqual([]);
    await i18n.changeLanguage("zh-Hant");
  });

  it("never touches text the author wrote, and a switch never renames an existing work", async () => {
    await i18n.changeLanguage("en");
    const authored = createStarterDocument("我的世界", "classic98", "card");
    authored.windows[0].title = "我的相簿"; // authored, not a default
    const after = localizeDefaults(authored);
    expect(after.siteName).toBe("我的世界");
    expect(after.windows[0].title).toBe("我的相簿");
    // an already-created window is plain data: nothing re-translates it when the language changes again
    await i18n.changeLanguage("ja");
    expect(after.windows[0].title).toBe("我的相簿");
    await i18n.changeLanguage("zh-Hant");
    const zhNew = localizeDefaults(makeWindow("document"));
    expect(zhNew.title).toBe("新文件.txt");
  });
});

describe("author-supplied site names are never translated", () => {
  // Names that equal a built-in default or match a default pattern must stay exactly as typed.
  const names = ["相簿", "關於我", "連結", "作品：星", "設定圖：月", "你的名字", "My 相簿", "  關於我 "];
  it.each(["en", "ja", "ko"] as const)("keeps the name verbatim in every template (%s)", async (locale) => {
    await i18n.changeLanguage(locale);
    for (const name of names) for (const template of ["card", "oc", "portfolio", "instagram", "blank"] as const) {
      const doc = createLocalizedDocument(name, (siteName) => createTemplateDocument(siteName, "classic98", template));
      // where a neutral name lands is where the author's name must land (a default that merely equals the name is excluded)
      const reference = createTemplateDocument("ZZZ-NEUTRAL", "classic98", template);
      // every string the author's name reaches in the untouched document is still present, unchanged, after localizing
      const referenceCount = strings(reference).filter((text) => text.includes("ZZZ-NEUTRAL")).length;
      const keptCount = strings(doc).filter((text) => text.includes(name)).length;
      expect(keptCount, `${locale} ${template} "${name}"`).toBeGreaterThanOrEqual(referenceCount);
      expect(JSON.stringify(doc)).not.toContain("__RETRO_SITE_NAME");
    }
  });

  it("still localizes the built-in defaults around a custom name", async () => {
    await i18n.changeLanguage("en");
    const doc = createLocalizedDocument("相簿", (siteName) => createTemplateDocument(siteName, "classic98", "card"));
    expect(doc.windows.map((window) => window.title)).toContain("About me");
  });
});

describe("licensed demo media localization", () => {
  it.each(SUPPORTED_LOCALES)("localizes source and rights labels in %s without changing image/source URLs", async (locale) => {
    // Japanese and Korean are preview locales. Exercise their real catalogs here,
    // rather than silently testing the English fallback used in release builds.
    const supported = i18n.options.supportedLngs;
    const previous = i18n.language;
    try {
      await i18n.init({ ...i18n.options, supportedLngs: [...SUPPORTED_LOCALES], lng: locale });
      expect(i18n.resolvedLanguage).toBe(locale);
      const expected = resources[locale].editor.defaults;
      const sourceDocs = (["card", "ig", "oc", "portfolio"] as const).map(createDemoDocument);
      const [card, ig, oc, portfolio] = sourceDocs.map(localizeDefaults);
      const cardLinks = card.windows.find((window) => window.type === "links")!;
      if (cardLinks.type !== "links") throw new Error("missing card links");
      expect(cardLinks.content.links.map((link) => link.label)).toEqual([expected.demoCatSource, expected.demoRetroSource]);
      const profile = ig.windows[0];
      if (profile.type !== "instagram") throw new Error("missing profile");
      expect(profile.content.profile.linkLabel).toBe(expected.demoPixelSource);
      const ocGallery = oc.windows.find((window) => window.type === "gallery")!;
      if (ocGallery.type !== "gallery") throw new Error("missing OC gallery");
      expect(ocGallery.content.images[0].title).toBe(expected.demoMoonSurface);
      expect(ocGallery.content.images[5].title).toBe(expected.demoCoffee);
      expect(ocGallery.content.images[0].alt).toBe(expected.demoOcReferenceAlt.replace("{{title}}", expected.demoMoonSurface));
      expect(ocGallery.content.images[0].caption).toBe(expected.demoOcReferenceCaption.replace("{{title}}", expected.demoMoonSurface));
      const portfolioGallery = portfolio.windows.find((window) => window.type === "gallery")!;
      if (portfolioGallery.type !== "gallery") throw new Error("missing portfolio gallery");
      expect(portfolioGallery.content.images[0].alt).toBe(expected.demoPortfolioReferenceAlt.replace("{{title}}", "Logo"));
      expect(portfolioGallery.content.images[0].caption).toBe(expected.demoPortfolioReferenceCaption.replace("{{title}}", "Logo"));
      for (const [index, doc] of [card, ig, oc, portfolio].entries()) {
        const urls = (value: unknown) => strings(value).filter((text) => /^https?:\/\//.test(text));
        expect(urls(doc)).toEqual(urls(sourceDocs[index]));
        expect(JSON.stringify(doc)).toContain("CC0");
      }
    } finally {
      await i18n.init({ ...i18n.options, supportedLngs: supported, lng: previous });
    }
  });
});
