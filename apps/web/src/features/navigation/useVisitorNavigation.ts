import { useRef, useState } from "react";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import type { ProfileDirectoryEntry } from "../modules/types";
import type { PreviewNavigation } from "../site/previewNavigation";
import type { InternalDestination, NavigationRequest } from "./linkDestination";
import { dispatchUiActions } from "./dispatchUiActions";
import { createEntityViewer } from "./createEntityViewer";
export type ReturnFrame = { windowId: string; openedWindowId: string; focusKey: string | null };
export type VisitorSession = { source: SiteDocument | null; windows: DesktopWindow[]; requests: Record<string, NavigationRequest>; nextRequest: number; explorer: Record<string, { folderId: string | null; query: string }>; returns: ReturnFrame[] };
export const createVisitorSession = (): VisitorSession => ({ source: null, windows: [], requests: {}, nextRequest: 0, explorer: {}, returns: [] });
export function useVisitorNavigation(options: { document: SiteDocument; siteId?: string | null; profileDirectory?: ProfileDirectoryEntry[]; profileIdsByWindow?: Record<string, string>; navigation?: PreviewNavigation; editing?: boolean; recordReturns?: boolean; onOpen: (window: DesktopWindow) => void }) {
  const local = useRef(createVisitorSession()).current;
  const saved = options.navigation ? (options.navigation.visitor ??= createVisitorSession()) : local;
  if (saved.source !== options.document) Object.assign(saved, createVisitorSession(), { source: options.document });
  const [, render] = useState(0);
  // A source boundary must remount this hook or supply a different navigation session.
  const windows = [...options.document.windows, ...saved.windows];
  const navigate = (target: InternalDestination, sourceId: string) => dispatchUiActions({ kind: "openDestination", destination: target }, {
    editing: !!options.editing,
    catalog: { siteId: options.siteId ?? null, windows, profiles: options.profileDirectory ?? [], profileIdsByWindow: options.profileIdsByWindow ?? {} },
    open: (resolved) => {
      if (resolved.kind === "url") return; // Internal refs only on this channel.
      const window = resolved.kind === "window" ? resolved.window : resolved.window ?? createEntityViewer(resolved.profile, windows);
      if (!windows.some((item) => item.id === window.id)) saved.windows.push(window);
      if (options.recordReturns && sourceId !== window.id) {
        const active = globalThis.document.activeElement?.closest<HTMLElement>("[data-navigation-focus]");
        saved.returns = [...saved.returns.slice(-19), { windowId: sourceId, openedWindowId: window.id, focusKey: active?.dataset.navigationFocus ?? null }];
      }
      if (resolved.kind === "entity") saved.requests[window.id] = { requestId: ++saved.nextRequest, profileId: resolved.profile.id, postId: resolved.postId };
      render((value) => value + 1);
      options.onOpen(window);
    }
  });
  return { windows, requests: saved.requests, navigate, hasReturn: saved.returns.length > 0, clearReturns: () => { saved.returns = []; }, back: (currentId: string | null) => saved.returns.at(-1)?.openedWindowId === currentId ? saved.returns.pop()! : null };
}
export function restoreNavigationFocus(key: string | null) {
  if (!key) return;
  requestAnimationFrame(() => Array.from(document.querySelectorAll<HTMLElement>("[data-navigation-focus]")).find((node) => node.dataset.navigationFocus === key)?.focus());
}
