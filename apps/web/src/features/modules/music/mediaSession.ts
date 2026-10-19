import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { musicPlayback, type AudioPort } from "./audioCoordinator";

export type EmbedSnapshot = { windowId: string | null; trackId: string | null; instanceId: string | null };

const idle: EmbedSnapshot = { windowId: null, trackId: null, instanceId: null };

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
    /**
     * `instanceId` identifies the mounted player component. A preview may use the same window
     * and track ids as the editor; only the exact instance clicked by the visitor may create
     * an iframe. Public desktop/mobile hosts are mounted exclusively.
     */
    activate(windowId: string, trackId: string, instanceId: string) {
      stopNative();
      emit({ windowId, trackId, instanceId });
    },
    /** With no arguments disposes any active embed; with ids only if that exact embed is active. */
    dispose(windowId?: string, trackId?: string, instanceId?: string) {
      if (snapshot.windowId === null) return;
      if (windowId !== undefined && snapshot.windowId !== windowId) return;
      if (trackId !== undefined && snapshot.trackId !== trackId) return;
      if (instanceId !== undefined && snapshot.instanceId !== instanceId) return;
      emit(idle);
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
  };
}

export const embedSession = createEmbedSession(() => musicPlayback.stopAll());

/** Starts native audio after making sure no platform player is still mounted. */
export function playNative(windowId: string, trackId: string, url: string) {
  flushSync(() => embedSession.dispose());
  return musicPlayback.play(windowId, trackId, url);
}

export function useActiveEmbed() {
  return useSyncExternalStore(embedSession.subscribe, embedSession.getSnapshot, embedSession.getSnapshot);
}

/** Source resolution is owned by the coordinator, so closing or another play cancels it. */
export function playResolvedNative(windowId: string, trackId: string, resolve: () => Promise<string | null>) {
  flushSync(() => embedSession.dispose());
  return musicPlayback.playResolved(windowId, trackId, resolve);
}

export function stopWindowMedia(windowId: string) {
  embedSession.dispose(windowId);
  musicPlayback.stopWindow(windowId);
}

export function stopAllMedia() {
  embedSession.dispose();
  musicPlayback.stopAll();
}

/** A visible native video participates in exactly the same session as audio. */
export function playVideo(windowId: string, trackId: string, url: string, video: AudioPort) {
  flushSync(() => embedSession.dispose());
  return musicPlayback.play(windowId, trackId, url, video);
}

export function useStopMediaOnResize(windowId: string) {
  useEffect(() => {
    const stop = () => stopWindowMedia(windowId);
    globalThis.addEventListener("resize", stop);
    return () => globalThis.removeEventListener("resize", stop);
  }, [windowId]);
}
