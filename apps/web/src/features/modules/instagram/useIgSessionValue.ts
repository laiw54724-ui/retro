import { useSyncExternalStore, type SetStateAction } from "react";
import { getIgDraftSession } from "./igDraftSession";

/** Only unfinished controls use this cache; UI navigation and saved data stay separate. */
export function useIgSessionValue<T>(key: string, initial: T): [T, (action: SetStateAction<T>) => void] {
  const session = getIgDraftSession();
  useSyncExternalStore(session.subscribeControls, session.getRevision);
  if (!session.controls.has(key)) session.controls.set(key, initial);
  return [session.controls.get(key) as T, (action) => {
    const current = (session.controls.has(key) ? session.controls.get(key) : initial) as T;
    session.controls.set(key, typeof action === "function" ? (action as (value: T) => T)(current) : action);
    session.notifyControls();
  }];
}
export function clearIgSessionValue(key: string) {
  const session = getIgDraftSession(); session.controls.delete(key); session.notifyControls();
}

/** Qualify canonical "saved" while local IG input remains; never changes save state. */
export function useIgHasPendingDrafts() {
  const session = getIgDraftSession();
  return useSyncExternalStore(session.subscribeControls, session.getHasPendingDrafts);
}
