import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, type Locale } from "./locale";
import { NAMESPACES, resources } from "./resources";

type Leaves = Record<string, string>;
function leaves(value: unknown, prefix = ""): Leaves {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [[path, entry]] : Object.entries(leaves(entry, path));
  }));
}

const HAN = /[㐀-鿿]/;
const KANA = /[぀-ヿ]/;
const HANGUL = /[가-힯]/;
// Words that are legitimately the same in Traditional Chinese and Japanese (kanji compounds). Longer identical strings are
// treated as untranslated.
const SHORT_SHARED = 8;

const all = SUPPORTED_LOCALES.flatMap((locale) => NAMESPACES.map((namespace) => ({ locale, namespace, entries: leaves(resources[locale][namespace]) })));
const entriesOf = (locale: Locale) => all.filter((item) => item.locale === locale).flatMap(({ namespace, entries }) => Object.entries(entries).map(([key, value]) => ({ id: `${namespace}:${key}`, value })));
const zh = new Map(entriesOf("zh-Hant").map((entry) => [entry.id, entry.value]));

describe("translation quality across zh-Hant, en, ja and ko", () => {
  it("English contains no CJK text, so no Chinese fallback can leak into it", () => {
    expect(entriesOf("en").filter(({ value }) => HAN.test(value) || KANA.test(value) || HANGUL.test(value)).map((entry) => entry.id)).toEqual([]);
  });

  it("Korean contains no kana or Han characters, Japanese contains no Hangul", () => {
    expect(entriesOf("ko").filter(({ value }) => KANA.test(value) || HAN.test(value)).map((entry) => entry.id)).toEqual([]);
    expect(entriesOf("ja").filter(({ value }) => HANGUL.test(value)).map((entry) => entry.id)).toEqual([]);
  });

  it("no English, Japanese or Korean string is just the Chinese text", () => {
    for (const locale of ["en", "ja", "ko"] as const) {
      const same = entriesOf(locale).filter(({ id, value }) => HAN.test(zh.get(id) ?? "") && value === zh.get(id) && (locale !== "ja" || value.replace(/\{\{[^}]*\}\}/g, "").length > SHORT_SHARED));
      expect(same.map((entry) => entry.id), `${locale} strings identical to zh-Hant`).toEqual([]);
    }
  });

  it("every plural family is complete in every locale", () => {
    for (const { locale, namespace, entries } of all) {
      for (const key of Object.keys(entries)) {
        if (key.endsWith("_one")) expect(entries[`${key.slice(0, -4)}_other`], `${locale}/${namespace}:${key}`).toBeTypeOf("string");
        if (key.endsWith("_other")) expect(entries[`${key.slice(0, -6)}_one`], `${locale}/${namespace}:${key}`).toBeTypeOf("string");
      }
    }
  });

  it("keeps interpolation names identical across languages (including plural variants)", () => {
    const names = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)].map((match) => match[1]))].sort();
    for (const locale of ["en", "ja", "ko"] as const) {
      for (const { id, value } of entriesOf(locale)) {
        const source = zh.get(id);
        if (source !== undefined) expect(names(value), `${locale} ${id}`).toEqual(names(source));
      }
    }
  });

  it("does not display the generic-error fallback as ordinary UI text", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const generic = resources[locale].errors.generic;
      const hits = entriesOf(locale).filter(({ id, value }) => value === generic && !id.startsWith("errors:"));
      expect(hits.map((entry) => entry.id), locale).toEqual([]);
    }
  });

  it("has a sensible amount of text in every locale (the key sets are identical)", () => {
    const count = (locale: Locale) => entriesOf(locale).length;
    expect(count("en")).toBe(count("zh-Hant"));
    expect(count("ja")).toBe(count("zh-Hant"));
    expect(count("ko")).toBe(count("zh-Hant"));
    expect(count("zh-Hant")).toBeGreaterThan(1300);
  });
});
