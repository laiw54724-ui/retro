import { useSyncExternalStore } from "react";
import { musicPlayback } from "./audioCoordinator";

export type EmbedSnapshot = { windowId: string | null; trackId: string | null };

const idle: EmbedSnapshot = { windowId: null, trackId: null };

/**
 * Tracks the single platform player (iframe) that is currently mounted.
 *
 * Platform iframes cannot be paused from outside, so exclusivity is enforced by mounting at most
 * one: starting an embed stops native audio, and starting native audio (or another embed)
 * unmounts the old frame so it cannot keep making sound.
 */
export function createEmbedSession(stopNative: () => void) {
  let snapshot = idle;
  const listeners = new Set<() => void>();
  const emit = (next: EmbedSnapshot) => { snapshot = next; for (const listener of listeners) listener(); };
  return {
    activate(windowId: string, trackId: string) {
      stopNative();
      emit({ windowId, trackId });
    },
    /** With no arguments disposes any active embed; with ids only if that exact embed is active. */
    dispose(windowId?: string, trackId?: string) {
      if (snapshot.windowId === null) return;
      if (windowId !== undefined && snapshot.windowId !== windowId) return;
      if (trackId !== undefined && snapshot.trackId !== trackId) return;
      emit(idle);
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
  };
}

export const embedSession = createEmbedSession(() => musicPlayback.stopAll());

/** Starts native audio after making sure no platform player is still mounted. */
export function playNative(windowId: string, trackId: string, url: string) {
  embedSession.dispose();
  return musicPlayback.play(windowId, trackId, url);
}

export function useActiveEmbed() {
  return useSyncExternalStore(embedSession.subscribe, embedSession.getSnapshot, embedSession.getSnapshot);
}
