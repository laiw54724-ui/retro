import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ModuleProps } from "../types";

/** Authoring UI state belongs to this site/window/profile, never to the saved document. */
export function igEditorScope({ window, ctx }: ModuleProps<"instagram">): string {
  return JSON.stringify([ctx.siteId ?? "legacy", window.id, ctx.profileId ?? "legacy"]);
}

/** Keep each OC's filters and in-progress controls while switching within this mounted editor. */
export function useIgEditorState<T>(scope: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [states, setStates] = useState<Record<string, T>>(() => ({ [scope]: initial }));
  // Register the first value for each new scope so reordering data cannot change
  // an untouched default selection into a different item on the next render.
  useEffect(() => {
    setStates((previous) => Object.hasOwn(previous, scope) ? previous : { ...previous, [scope]: initial });
  }, [scope, initial]);
  const current = Object.hasOwn(states, scope) ? states[scope] : initial;
  // Capture the originating scope: delayed uploads must never update the newly selected OC's UI.
  const setCurrent = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setStates((previous) => {
      const value = Object.hasOwn(previous, scope) ? previous[scope] : initial;
      const next = typeof action === "function" ? (action as (value: T) => T)(value) : action;
      return Object.is(value, next) ? previous : { ...previous, [scope]: next };
    });
  }, [scope, initial]);
  return [current, setCurrent];
}
