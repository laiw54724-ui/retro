import type { ReactElement } from "react";
import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import type { ThemeView } from "../../lib/themeView";

export type LinkAction = { target: "url" | "window"; url?: string; windowId?: string; label?: string };

export type ModuleCtx = {
  theme: RetroTheme;
  tv: ThemeView;
  /** True only in the desktop/mobile editor when inline editing is allowed. */
  editing: boolean;
  mobile: boolean;
  siteId?: string;
  windows: Array<{ id: string; title: string }>;
  onLink: (action: LinkAction) => void;
  /** Editor only. Resolves to the stored image URL, or null after showing an error. */
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
};

export type WindowOf<T extends DesktopWindow["type"]> = Extract<DesktopWindow, { type: T }>;

export type ModuleProps<T extends DesktopWindow["type"]> = {
  window: WindowOf<T>;
  ctx: ModuleCtx;
  /** `historyKey` merges rapid edits (typing) into one undo step. */
  update: (recipe: (window: WindowOf<T>) => WindowOf<T>, historyKey?: string) => void;
};

export type WindowModule<T extends DesktopWindow["type"]> = {
  label: string;
  description: string;
  icon: string;
  View: (props: ModuleProps<T>) => ReactElement;
  InlineEditor: (props: ModuleProps<T>) => ReactElement;
};

export function safeHref(url: string | undefined) {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? url : "#";
  } catch {
    return "#";
  }
}

export const opensNewTab = (url: string | undefined) => !!url && /^https?:/i.test(url);

/** Moves one item in an array by id. */
export function moveById<T extends { id: string }>(list: T[], id: string, direction: -1 | 1): T[] {
  const index = list.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

export function patchById<T extends { id: string }>(list: T[], id: string, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
