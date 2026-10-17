import type { DesktopWindow } from "@retrodesk/shared";
import { didMediaHistoryChange, type MediaEditorStore } from "./windowMediaSession";

export type IconMediaTarget = {
  windowId: string;
  windowType: DesktopWindow["type"];
  itemId?: string;
  itemKind?: "link" | "folder" | "shortcut";
};

export function iconTargetKey(target: IconMediaTarget | undefined): string {
  return JSON.stringify(target ? [target.windowId, target.windowType, target.itemKind ?? "link", target.itemId ?? null] : null);
}

/** undefined means missing, while an empty Explorer icon means its intentional default. */
export function readTargetIcon(window: DesktopWindow | undefined, target: IconMediaTarget): string | undefined {
  if (!window || window.id !== target.windowId || window.type !== target.windowType) return undefined;
  if (!target.itemId) return window.icon;
  if (window.type === "links" && (!target.itemKind || target.itemKind === "link")) {
    return window.content.links.find((item) => item.id === target.itemId)?.icon;
  }
  if (window.type === "explorer" && (target.itemKind === "folder" || target.itemKind === "shortcut")) {
    const list = target.itemKind === "folder" ? window.content.folders : window.content.shortcuts;
    const item = list.find((item) => item.id === target.itemId);
    return item ? item.icon ?? "" : undefined;
  }
  return undefined;
}

/** Protects both pending uploads and completed-but-not-yet-applied icon previews. */
export function observeIconSelection(store: MediaEditorStore, siteId: string, target: IconMediaTarget, initialIcon: string) {
  const identity = { ...target };
  const matches = () => {
    const state = store.getState();
    return state.siteId === siteId && state.accessRole !== "viewer" &&
      readTargetIcon(state.document?.windows.find((window) => window.id === identity.windowId), identity) === initialIcon;
  };
  let invalidated = !matches();
  const stop = store.subscribe((state, previous) => {
    if (didMediaHistoryChange(state, previous) || !matches()) invalidated = true;
  });
  return {
    isCurrent: () => !invalidated && matches(),
    dispose: () => { invalidated = true; stop(); }
  };
}
