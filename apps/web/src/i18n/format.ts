import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, fontStackForLocale, normalizeLocale, type Locale } from "./locale";

export const INTL_LOCALES: Record<Locale, string> = {
  "zh-Hant": "zh-TW", en: "en", ja: "ja-JP", ko: "ko-KR"
};

export function formatNumber(value: number | bigint, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], options).format(value);
}

/** Intentionally accepts real dates only, never authored worldDateLabel strings. */
export function formatDate(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], options ?? { year: "numeric", month: "short", day: "numeric" }).format(value);
}

export function formatTime(value: Date | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], options ?? { hour: "numeric", minute: "2-digit" }).format(value);
}

export function useLocaleFormatting() {
  const { i18n } = useTranslation("common");
  const locale = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE;
  return useMemo(() => ({
    locale,
    fontFamily: fontStackForLocale(locale),
    formatNumber: (value: number | bigint, options?: Intl.NumberFormatOptions) => formatNumber(value, locale, options),
    formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => formatDate(value, locale, options),
    formatTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) => formatTime(value, locale, options)
  }), [locale]);
}
