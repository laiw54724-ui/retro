import type { ComponentType } from "react";
import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import { themeView } from "../../lib/themeView";
import { registry } from "../modules/registry";
import type { LinkAction, ModuleCtx } from "../modules/types";

type Props = {
  window: DesktopWindow;
  theme: RetroTheme;
  /** Visitor/preview: open another window by id. */
  onOpenWindow?: (id: string) => void;
  allWindows?: DesktopWindow[];
  mobile?: boolean;
  /** Editor-only: render inline editors and persist edits. */
  editing?: boolean;
  siteId?: string;
  upload?: ModuleCtx["upload"];
  onUpdate?: (id: string, recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
};

function openExternal(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "mailto:") window.location.href = url;
    else if (parsed.protocol === "https:" || parsed.protocol === "http:") window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore malformed links
  }
}

export function WindowRenderer({ window: win, theme, onOpenWindow, allWindows, mobile = false, editing = false, siteId, upload, onUpdate }: Props) {
  const tv = themeView(theme);
  const onLink = (action: LinkAction) => {
    if (editing) return; // links are inert while editing
    if (action.target === "window") { if (action.windowId) onOpenWindow?.(action.windowId); return; }
    if (action.url) openExternal(action.url);
  };
  const ctx: ModuleCtx = {
    theme, tv, editing: editing && !!onUpdate, mobile, siteId,
    windows: (allWindows ?? []).map((candidate) => ({ id: candidate.id, title: candidate.title })),
    onLink, upload
  };
  const update = (recipe: (current: never) => never, key?: string) => onUpdate?.(win.id, recipe as never, key);

  const module = registry[win.type] as unknown as { View: ComponentType<Record<string, unknown>>; InlineEditor: ComponentType<Record<string, unknown>> };
  const Component = ctx.editing ? module.InlineEditor : module.View;
  return (
    <div className="module-host" style={{ fontFamily: tv.fontFamily, color: tv.text, background: win.type === "about" || win.type === "instagram" ? tv.face : "#fff" }}>
      <Component window={win} ctx={ctx} update={update} />
    </div>
  );
}
