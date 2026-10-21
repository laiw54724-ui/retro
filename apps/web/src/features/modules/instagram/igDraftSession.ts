import { useEditorStore } from "../../editor/store";
import { didMediaHistoryChange, type MediaEditorStore } from "../../media/windowMediaSession";
import type { DraftError } from "./igDraftValidation";

export type IgFieldDraft = { base: string; text: string; error?: DraftError };

/** Memory only: editor close/reopen retains work; a document/access epoch never does. */
export function createIgDraftSession(store: MediaEditorStore) {
  const drafts = new Map<string, IgFieldDraft>();
  const controls = new Map<string, unknown>();
  let revision = 0;
  const controlListeners = new Set<() => void>();
  const notifyControls = () => { revision++; controlListeners.forEach((listener) => listener()); };
  // Canonical autosave and retained local input are independent.
  const getHasPendingDrafts = () => [...drafts.values()].some((draft) => draft.text !== draft.base || !!draft.error)
    || [...controls.entries()].some(([key, value]) => {
      if (!value || typeof value !== "object") return false;
      if ("base" in value && "text" in value) {
        const draft = value as { base: string; text: string; error?: string };
        return draft.text !== draft.base || !!draft.error;
      }
      return (key.endsWith(":post-media-urls") || key.endsWith(":frame-urls"))
        && Object.values(value).some((text) => typeof text === "string" && text.length > 0);
    });
  const hasPendingEntity = (scope: string, entityId: string, additions: "post-media-urls" | "frame-urls") => {
    const prefix = `${scope}:${entityId}:`;
    const pending = (value: unknown) => {
      if (!value || typeof value !== "object" || !("base" in value) || !("text" in value)) return false;
      const draft = value as IgFieldDraft;
      return draft.text !== draft.base || !!draft.error;
    };
    return [...drafts.entries(), ...controls.entries()].some(([key, value]) => key.startsWith(prefix) && pending(value))
      || !!(controls.get(`${scope}:${additions}`) as Record<string, string> | undefined)?.[entityId];
  };
  // An explicit canonical deletion also discards its now-unreachable local inputs.
  const discardEntity = (scope: string, entityId: string, additions: "post-media-urls" | "frame-urls", childId?: string) => {
    const prefix = `${scope}:${entityId}:${childId ? `${childId}:` : ""}`;
    for (const key of drafts.keys()) if (key.startsWith(prefix)) drafts.delete(key);
    for (const key of controls.keys()) if (key.startsWith(prefix)) controls.delete(key);
    if (!childId) {
      const key = `${scope}:${additions}`;
      const values = controls.get(key) as Record<string, string> | undefined;
      if (values) { const next = { ...values }; delete next[entityId]; controls.set(key, next); }
    }
    notifyControls();
  };
  let epoch = 0;
  const listeners = new Set<() => void>();
  const dispose = store.subscribe((state, previous) => {
    if (state.siteId !== previous.siteId || state.accessRole !== previous.accessRole || didMediaHistoryChange(state, previous)) {
      drafts.clear(); controls.clear(); notifyControls();
      epoch++;
      listeners.forEach((listener) => listener());
    }
  });
  return {
    drafts, controls, notifyControls, getHasPendingDrafts, hasPendingEntity, discardEntity, getRevision: () => revision,
    subscribeControls: (listener: () => void) => { controlListeners.add(listener); return () => { controlListeners.delete(listener); }; },
    dispose, getEpoch: () => epoch,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

let session: ReturnType<typeof createIgDraftSession> | undefined;
// Lazy initialization avoids the store → module registry → IG → store cycle.
export function getIgDraftSession() { return session ??= createIgDraftSession(useEditorStore); }
if (import.meta.hot) import.meta.hot.dispose(() => session?.dispose());
