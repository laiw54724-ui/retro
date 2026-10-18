export const SUPPORTED_LOCALES = ["zh-Hant", "en", "ja", "ko"] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: Locale = "zh-Hant";
export const LOCALE_STORAGE_KEY = "retrodesk:locale";

export const LOCALE_NAMES: Record<Locale, string> = {
  "zh-Hant": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어"
};

/** #33 owns native-speaker review before Japanese/Korean become release locales. */
export function enabledLocales(preview = false): readonly Locale[] {
  return preview ? SUPPORTED_LOCALES : ["zh-Hant", "en"];
}

export const ENABLED_LOCALES = enabledLocales(import.meta.env.VITE_I18N_PREVIEW_LOCALES === "true");

/** UI-language aliases only. This never converts authored text or document data. */
export function normalizeLocale(input: unknown): Locale | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const language = new Intl.Locale(input.trim()).language;
    if (language === "zh") return "zh-Hant";
    return language === "en" || language === "ja" || language === "ko" ? language : null;
  } catch {
    return null;
  }
}

export function detectLocale({ storedLocale, browserLanguages = [], available = ENABLED_LOCALES }: {
  storedLocale?: unknown;
  browserLanguages?: readonly string[];
  available?: readonly Locale[];
} = {}): Locale {
  for (const candidate of [storedLocale, ...browserLanguages]) {
    const locale = normalizeLocale(candidate);
    if (locale && available.includes(locale)) return locale;
  }
  return DEFAULT_LOCALE;
}

export type LocaleStorage = Pick<Storage, "getItem" | "setItem">;
export type StorageAccessor = () => LocaleStorage | undefined;

export const browserStorage: StorageAccessor = () => typeof window === "undefined" ? undefined : window.localStorage;

export function readLocalePreference(getStorage: StorageAccessor = browserStorage): string | null {
  try {
    return getStorage()?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    // Accessing localStorage itself may throw, as well as getItem/setItem.
    return null;
  }
}

export function saveLocalePreference(locale: Locale, getStorage: StorageAccessor = browserStorage): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    // A blocked/quota-limited store must not prevent the current-session switch.
    return false;
  }
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

const UI_FONT_STACKS: Record<Locale, string> = {
  "zh-Hant": "'Cubic 11', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', 'Noto Sans TC', system-ui, sans-serif",
  en: "'Cubic 11', system-ui, 'PingFang TC', 'Yu Gothic', 'Malgun Gothic', 'Noto Sans CJK TC', 'Noto Sans CJK JP', 'Noto Sans CJK KR', sans-serif",
  ja: "'Cubic 11', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', Meiryo, 'Noto Sans CJK JP', 'Noto Sans JP', system-ui, sans-serif",
  ko: "'Cubic 11', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', 'Noto Sans KR', system-ui, sans-serif"
};

/** Apply only to translated UI chrome; the author's theme remains authoritative. */
export function fontStackForLocale(locale: Locale): string {
  return UI_FONT_STACKS[locale];
}
