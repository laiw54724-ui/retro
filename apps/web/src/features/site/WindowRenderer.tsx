import type { DesktopWindow, ProfileEntityV2, RetroTheme } from "@retrodesk/shared";
import { useThemeView } from "../../lib/themeView";
import { renderModule } from "../modules/registry";
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
  profiles?: ProfileEntityV2[];
  profileId?: string;
  profileIdsByWindow?: Record<string, string>;
  onProfileSelect?: (id: string, windowId?: string) => void;
  onProfileAdd?: (windowId?: string) => void;
  onProfileDuplicate?: (id: string, windowId?: string) => void;
  onProfileChange?: (profileId: string, patch: Record<string, unknown>, historyKey?: string) => void;
  onProfileDelete?: (profileId: string, retargetProfileId?: string) => void;
  profileDeleteBlocked?: boolean;
  profileDeleteGuardById?: Record<string, { windowTitles: string[]; postIds: string[] }>;
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

export function WindowRenderer({ window: win, theme, onOpenWindow, allWindows, mobile = false, editing = false, siteId, upload, onUpdate, profiles, profileId, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById }: Props) {
  const tv = useThemeView(theme);
  const onLink = (action: LinkAction) => {
    if (editing) return; // links are inert while editing
    if (action.target === "window") { if (action.windowId) onOpenWindow?.(action.windowId); return; }
    if (action.url) openExternal(action.url);
  };
  const resolvedProfileId = profileIdsByWindow?.[win.id] ?? profileId;
  const profileThemeOverride = profiles?.find((profile) => profile.id === resolvedProfileId)?.themeOverride;
  const ctx: ModuleCtx = {
    theme, tv, editing: editing && !!onUpdate, mobile, siteId,
    windows: (allWindows ?? []).map((candidate) => ({ id: candidate.id, title: candidate.title })),
    onLink, upload, profiles, profileId: resolvedProfileId, profileThemeOverride,
    onProfileSelect: (id) => onProfileSelect?.(id, win.id),
    onProfileAdd: () => onProfileAdd?.(win.id),
    onProfileDuplicate: (id) => onProfileDuplicate?.(id, win.id), onProfileChange: (id, patch, key) => onProfileChange?.(id, patch, key),
    onProfileDelete: (id, target) => onProfileDelete?.(id, target),
    profileDeleteBlocked: !!profileDeleteGuardById?.[resolvedProfileId ?? ""] && ((profileDeleteGuardById?.[resolvedProfileId ?? ""]?.windowTitles.length ?? 0) > 0 || (profileDeleteGuardById?.[resolvedProfileId ?? ""]?.postIds.length ?? 0) > 0),
    profileDeleteGuard: profileDeleteGuardById?.[resolvedProfileId ?? ""]
  };
  const update = (recipe: (current: DesktopWindow) => DesktopWindow, key?: string) => onUpdate?.(win.id, recipe, key);

  return (
    <div className={`module-host module-${win.type}`} style={{ fontFamily: tv.fontFamily, color: tv.text, background: win.type === "about" || win.type === "instagram" ? tv.face : "#fff" }}>
      {renderModule({ window: win, ctx, editing: ctx.editing, update })}
    </div>
  );
}
