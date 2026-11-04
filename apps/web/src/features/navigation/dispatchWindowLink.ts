import type { InternalDestination, NavigationResult } from "./linkDestination";

type Context = {
  editing: boolean;
  sourceId: string;
  siteId?: string | null;
  windows?: readonly { id: string }[];
  navigate?: (target: InternalDestination, sourceId: string) => NavigationResult;
  openWindow?: (id: string) => void;
};

/** Adapt existing window buttons to R1 session navigation without new stored fields. */
export function dispatchWindowLink(windowId: string | undefined, context: Context): NavigationResult {
  if (context.editing || !windowId) return { ok: false, reason: "unavailable" };
  if (context.siteId) {
    // A scoped rejection must never fall through to an unscoped callback.
    return context.navigate?.({ kind: "window", siteId: context.siteId, id: windowId }, context.sourceId)
      ?? { ok: false, reason: "unavailable" };
  }
  // Legacy v1 has no verified namespace. Keep its source-local callback, but
  // distinguish an omitted directory from an explicitly empty/missing target.
  if (!context.openWindow || (context.windows && !context.windows.some((window) => window.id === windowId))) {
    return { ok: false, reason: "unavailable" };
  }
  context.openWindow(windowId);
  return { ok: true };
}
