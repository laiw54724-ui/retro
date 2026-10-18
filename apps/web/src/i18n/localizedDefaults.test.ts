import { beforeAll, describe, expect, it } from "vitest";
import { createDemoDocument, createStarterDocument, createTemplateDocument, makeWindow } from "@retrodesk/shared";
import { i18n, initI18n } from "./index";
import { DEFAULT_TEXT_KEYS, localizeDefaults } from "./localizedDefaults";
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
