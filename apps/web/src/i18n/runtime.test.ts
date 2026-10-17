import { describe, expect, it, vi } from "vitest";
import { createLocaleController } from "./index";
import { SUPPORTED_LOCALES, enabledLocales, LOCALE_STORAGE_KEY, type Locale } from "./locale";
import { resources } from "./resources";
import { translateError } from "./errors";

function controllerFixture({ stored, browser = ["zh-TW"], available = SUPPORTED_LOCALES as readonly Locale[] }: {
  stored?: string;
  browser?: string[];
  available?: readonly Locale[];
} = {}) {
  const data = new Map<string, string>(stored ? [[LOCALE_STORAGE_KEY, stored]] : []);
  const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  const root = { lang: "", dir: "" };
  const controller = createLocaleController({ available, getStorage: () => storage, getBrowserLanguages: () => browser, getDocumentElement: () => root });
  return { ...controller, storage, data, root };
}

describe("i18n runtime boundaries", () => {
  it("initializes once, sets html language before rendering, and does not save a detected preference", async () => {
    const runtime = controllerFixture({ browser: ["fr-FR", "ja-JP", "en-SG"] });
    const ready = runtime.init();
    expect(runtime.init()).toBe(ready);
    await ready;
    expect(runtime.i18n.resolvedLanguage).toBe("ja");
    expect(runtime.root).toEqual({ lang: "ja", dir: "ltr" });
    expect(runtime.storage.setItem).not.toHaveBeenCalled();
    expect(runtime.i18n.t("desktop.start")).toBe(resources.ja.common.desktop.start);
  });

  it("switches all four languages in the same instance and restores the manual preference on reload", async () => {
    const runtime = controllerFixture();
    await runtime.init();
    const originalInstance = runtime.i18n;
    for (const locale of SUPPORTED_LOCALES) {
      expect(await runtime.changeLocale(locale)).toBe(true);
      expect(runtime.i18n).toBe(originalInstance);
      expect(runtime.root.lang).toBe(locale);
      expect(runtime.i18n.t("desktop.start")).toBe(resources[locale].common.desktop.start);
      expect(runtime.data.get(LOCALE_STORAGE_KEY)).toBe(locale);
    }
    const reloaded = controllerFixture({ stored: runtime.data.get(LOCALE_STORAGE_KEY), browser: ["en-SG"] });
    await reloaded.init();
    expect(reloaded.i18n.resolvedLanguage).toBe("ko");
  });

  it("supports current-session changes when all storage operations throw", async () => {
    const runtime = createLocaleController({
      getStorage: () => { throw new Error("blocked storage"); },
      getBrowserLanguages: () => ["en-US"],
      getDocumentElement: () => undefined
    });
    await runtime.init();
    expect(runtime.i18n.language).toBe("en");
    expect(await runtime.changeLocale("zh-Hant")).toBe(true);
    expect(runtime.i18n.t("desktop.start")).toBe(resources["zh-Hant"].common.desktop.start);
  });

  it("rejects preview locales in a release runtime without persisting them", async () => {
    const runtime = controllerFixture({ stored: "ko", browser: ["ja-JP", "en-SG"], available: enabledLocales(false) });
    await runtime.init();
    expect(runtime.i18n.language).toBe("en");
    expect(await runtime.changeLocale("ja")).toBe(false);
    expect(runtime.root.lang).toBe("en");
    expect(runtime.storage.setItem).not.toHaveBeenCalled();
  });

  it("keeps the current language and persisted preference when a change fails", async () => {
    const runtime = controllerFixture({ stored: "en" });
    await runtime.init();
    vi.spyOn(runtime.i18n, "changeLanguage").mockRejectedValueOnce(new Error("private transport detail"));
    expect(await runtime.changeLocale("ja")).toBe(false);
    expect(runtime.i18n.language).toBe("en");
    expect(runtime.i18n.t("desktop.start")).toBe("Start");
    expect(runtime.root.lang).toBe("en");
    expect(runtime.data.get(LOCALE_STORAGE_KEY)).toBe("en");
    expect(await runtime.changeLocale("ko")).toBe(true);
    expect(runtime.root.lang).toBe("ko");
  });

  it("serializes concurrent controls so an earlier slow change cannot replace the last choice", async () => {
    const runtime = controllerFixture();
    await runtime.init();
    const original = runtime.i18n.changeLanguage.bind(runtime.i18n);
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(runtime.i18n, "changeLanguage").mockImplementationOnce(async (locale) => {
      await delayed;
      return original(locale);
    });
    const first = runtime.changeLocale("ja");
    const second = runtime.changeLocale("ko");
    release();
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(runtime.root.lang).toBe("ko");
    expect(runtime.data.get(LOCALE_STORAGE_KEY)).toBe("ko");
  });
});

describe("readable fallback, plurals, and errors", () => {
  it("falls back from a missing/empty locale key to English, then Traditional Chinese", async () => {
    const runtime = controllerFixture({ browser: ["ja-JP"] });
    await runtime.init();
    runtime.i18n.addResource("ja", "common", "desktop.start", "");
    expect(runtime.i18n.t("desktop.start")).toBe("Start");
    runtime.i18n.addResource("en", "common", "desktop.start", "");
    expect(runtime.i18n.t("desktop.start")).toBe(resources["zh-Hant"].common.desktop.start);
  });

  it("never exposes an unknown key, default server text, or resource object to the UI", async () => {
    const runtime = controllerFixture({ browser: ["ko-KR"] });
    await runtime.init();
    const fallback = resources.ko.errors.generic;
    // Dynamic/legacy callers may bypass TypeScript; runtime must remain readable.
    expect(runtime.i18n.t("private.internal.missing" as never)).toBe(fallback);
    expect(runtime.i18n.t("private.internal.missing" as never, { defaultValue: "private database error" })).toBe(fallback);
    expect(runtime.i18n.t("desktop" as never)).toBe(fallback);
    expect(runtime.i18n.t("private.internal.missing" as never, { lng: "en" })).toBe(resources.en.errors.generic);
  });

  it.each([[0, "0 windows"], [1, "1 window"], [2, "2 windows"]])("uses the English plural rule for %i", async (count, expected) => {
    const runtime = controllerFixture({ browser: ["en-SG"] });
    await runtime.init();
    expect(runtime.i18n.t("shell.windowsCount", { ns: "editor", count: Number(count), formattedCount: String(count) })).toBe(expected);
  });

  it("passes an author's interpolated name through literally without interpreting keys/templates/HTML", async () => {
    const runtime = controllerFixture({ browser: ["en-SG"] });
    await runtime.init();
    const title = "desktop.start {{name}} <b>日本語 한국어</b>";
    expect(runtime.i18n.t("shell.selected", { ns: "editor", title })).toBe(`Selected: ${title}`);
  });

  it("translates whitelisted codes and hides raw/unknown API messages", async () => {
    const runtime = controllerFixture({ browser: ["en-SG"] });
    await runtime.init();
    const t = runtime.i18n.getFixedT(null, "errors");
    expect(translateError({ code: "forbidden", message: "secret server value" }, t)).toBe(resources.en.errors.codes.forbidden);
    for (const error of [null, "raw failure", new Error("private URL"), { code: "__proto__" }, { code: "unmapped", details: "private" }]) {
      expect(translateError(error, t)).toBe(resources.en.errors.generic);
    }
  });
});
