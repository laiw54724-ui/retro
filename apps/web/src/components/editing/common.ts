import type { CSSProperties } from "react";
import type { ThemeView } from "../../lib/themeView";
import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";
import en from "./locale-deltas/en.json";
import zh from "./locale-deltas/zh-Hant.json";
import ja from "./locale-deltas/ja.json";
import ko from "./locale-deltas/ko.json";
export type EditingTheme = Pick<ThemeView, "face" | "text" | "shadow" | "bevel" | "sunken">;
export type EditingAppearance = { tv?: EditingTheme; mobile?: boolean; className?: string; style?: CSSProperties };
export function editingStyle(tv?: EditingTheme, style?: CSSProperties): CSSProperties {
  return { ...(tv ? { "--editing-face": tv.face, "--editing-text": tv.text, "--editing-shadow": tv.shadow, "--editing-bevel": tv.bevel, "--editing-sunken": tv.sunken } : {}), ...style } as CSSProperties;
}
export function useEditingText() {
  const { t, i18n } = useTranslation("editor");
  const lang = i18n.resolvedLanguage ?? i18n.language;
  const fallback = lang?.startsWith("ja") ? ja : lang?.startsWith("ko") ? ko : lang?.startsWith("en") ? en : zh;
  return (key: keyof typeof en.editing, values?: Record<string, string | number>) => String(t(`editing.${key}` as ParseKeys<"editor">, { defaultValue: fallback.editing[key], ...values }));
}
export function isComposing(event: { nativeEvent: { isComposing?: boolean }; keyCode?: number }, composing = false) {
  return composing || event.nativeEvent.isComposing || event.keyCode === 229;
}
export function clampPosition(position: { x: number; y: number }, size: { width: number; height: number }, bounds: { width: number; height: number }, margin = 4) {
  return { x: Math.max(margin, Math.min(position.x, bounds.width - size.width - margin)), y: Math.max(margin, Math.min(position.y, bounds.height - size.height - margin)) };
}
