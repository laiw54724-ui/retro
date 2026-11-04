import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, detectLocale,
  enabledLocales, fontStackForLocale, normalizeLocale, readLocalePreference,
  saveLocalePreference, type Locale
} from "./locale";

describe("UI locale detection", () => {
  it.each([
    ["zh", "zh-Hant"], ["zh-TW", "zh-Hant"], ["zh-HK", "zh-Hant"],
    ["zh-Hant-TW", "zh-Hant"], ["zh-Hans", "zh-Hant"], ["zh-CN", "zh-Hant"],
    ["zh-SG", "zh-Hant"], ["en-SG", "en"], ["en-GB", "en"],
    ["ja-JP", "ja"], ["ko-KR", "ko"], [" EN-us ", "en"]
  ])("normalizes %s to %s without converting any content", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it.each([null, undefined, 1, {}, "", " ", "fr-FR", "en_US", "english", "cimode", "__proto__", "en-<script>"])("ignores invalid/unsupported language %s", (input) => {
    expect(normalizeLocale(input)).toBeNull();
  });

  it("prioritizes a saved manual choice over browser languages", () => {
    expect(detectLocale({ storedLocale: "en-GB", browserLanguages: ["zh-HK", "ja-JP"] })).toBe("en");
  });

  it("uses the first supported browser entry, then Traditional Chinese", () => {
    expect(detectLocale({ storedLocale: "invalid", browserLanguages: ["fr-FR", "ko-KR", "en-SG"], available: SUPPORTED_LOCALES })).toBe("ko");
    expect(detectLocale({ browserLanguages: ["fr-FR", "de-DE"] })).toBe(DEFAULT_LOCALE);
    expect(detectLocale()).toBe(DEFAULT_LOCALE);
  });

  it("keeps unreviewed languages behind the same flag for storage, detection and selection", () => {
    expect(enabledLocales()).toEqual(["zh-Hant", "en"]);
    expect(enabledLocales(true)).toEqual(SUPPORTED_LOCALES);
    expect(detectLocale({ storedLocale: "ja", browserLanguages: ["ko-KR", "en-SG"], available: enabledLocales(false) })).toBe("en");
    expect(detectLocale({ storedLocale: "ja", available: enabledLocales(true) })).toBe("ja");
  });
});

describe("optional local UI preference storage", () => {
  it("round-trips only the locale preference key", () => {
    const values = new Map<string, string>();
    const storage = { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
    expect(saveLocalePreference("ko", () => storage)).toBe(true);
    expect(readLocalePreference(() => storage)).toBe("ko");
    expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(LOCALE_STORAGE_KEY, "ko");
  });

  it("survives a throwing localStorage getter and unavailable browser storage", () => {
    const denied = () => { throw new Error("SecurityError"); };
    expect(readLocalePreference(denied)).toBeNull();
    expect(saveLocalePreference("en", denied)).toBe(false);
    expect(readLocalePreference(() => undefined)).toBeNull();
    expect(saveLocalePreference("en", () => undefined)).toBe(false);
  });

  it("survives throwing getItem and setItem methods", () => {
    const storage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(readLocalePreference(() => storage)).toBeNull();
    expect(saveLocalePreference("en", () => storage)).toBe(false);
  });
});

describe("scoped CJK UI font contract", () => {
  it.each(SUPPORTED_LOCALES)("retains Cubic 11 first and a generic fallback for %s", (locale) => {
    expect(fontStackForLocale(locale)).toMatch(/^'Cubic 11',/);
    expect(fontStackForLocale(locale)).toMatch(/system-ui,?[^]*sans-serif$/);
  });

  it.each([
    ["ja", ["Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP"]],
    ["ko", ["Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR"]]
  ] as Array<[Locale, string[]]>)("names available macOS/Windows/Linux fallbacks for %s", (locale, expected) => {
    for (const font of expected) expect(fontStackForLocale(locale)).toContain(font);
  });
});
