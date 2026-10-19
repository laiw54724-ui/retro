import { useSyncExternalStore } from "react";
import { i18n } from "../../../i18n";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type MusicPlaybackSnapshot = {
  status: PlaybackStatus;
  windowId: string | null;
  trackId: string | null;
  url: string;
  currentTime: number;
  duration: number | null;
  volume: number;
  canSeek: boolean;
  error: string;
};

export type AudioPort = {
  src: string;
  currentTime: number;
  duration: number;
  volume: number;
  paused: boolean;
  seekable: { length: number };
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

type CoordinatorOptions = {
  createAudio: () => AudioPort;
  loadTimeoutMs?: number;
  setTimer?: (callback: () => void, delay: number) => number;
  clearTimer?: (id: number) => void;
};

const initialSnapshot = (): MusicPlaybackSnapshot => ({
  status: "idle", windowId: null, trackId: null, url: "", currentTime: 0, duration: null, volume: 1, canSeek: false, error: ""
});

function playableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "blob:";
  } catch { return false; }
}

export function createAudioCoordinator(options: CoordinatorOptions) {
  let audio: AudioPort | null = null;
  let generation = 0;
  let detachListeners = () => {};
  let suppliedMedia = false;
  let snapshot = initialSnapshot();
  let timeoutId: number | null = null;
  const listeners = new Set<() => void>();
  const setTimer = options.setTimer ?? ((callback, delay) => globalThis.setTimeout(callback, delay) as unknown as number);
  const clearTimer = options.clearTimer ?? ((id) => globalThis.clearTimeout(id));
  const loadTimeoutMs = options.loadTimeoutMs ?? 12_000;

  const emit = (patch: Partial<MusicPlaybackSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const cancelTimeout = () => {
    if (timeoutId !== null) clearTimer(timeoutId);
    timeoutId = null;
  };
  const mediaError = (fallback: string) => {
    generation += 1;
    cancelTimeout();
    releaseAudio();
    emit({ status: "error", error: fallback });
  };
  const syncTime = () => {
    if (!audio || !snapshot.windowId || !snapshot.url) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    emit({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0, duration, canSeek: !!duration && audio.seekable.length > 0 });
  };
  // Each source owns its listeners. Detached video/audio events cannot affect a newer source.
  function releaseAudio() {
    const previous = audio;
    audio = null;
    detachListeners();
    detachListeners = () => {};
    if (!previous) return;
    previous.pause();
    previous.currentTime = 0;
    previous.src = "";
    previous.load();
  }
  function bindAudio(player: AudioPort) {
    const handlers: [string, EventListener][] = [];
    const on = (type: string, callback: () => void) => {
      const listener = () => { if (audio === player) callback(); };
      handlers.push([type, listener]);
      player.addEventListener(type, listener);
    };
    on("timeupdate", syncTime);
    on("durationchange", syncTime);
    on("loadedmetadata", syncTime);
    on("volumechange", () => emit({ volume: player.volume }));
    on("playing", () => {
      if (["loading", "playing", "paused"].includes(snapshot.status)) { cancelTimeout(); emit({ status: "playing", error: "" }); }
    });
    on("pause", () => {
      if (snapshot.status !== "idle" && snapshot.status !== "error") emit({ status: "paused" });
    });
    on("ended", () => { if (snapshot.windowId && snapshot.url) { cancelTimeout(); syncTime(); emit({ status: "paused" }); } });
    on("error", () => { if (snapshot.windowId && snapshot.url) mediaError(i18n.t(suppliedMedia ? "music:m3.failure" : "music:audioCoordinator.theAudioCouldntBeLoaded")); });
    detachListeners = () => { for (const [type, listener] of handlers) player.removeEventListener(type, listener); };
  }

  async function play(windowId: string, trackId: string, url: string, element?: AudioPort): Promise<boolean> {
    const request = ++generation;
    if (!playableUrl(url)) {
      stopAll();
      emit({ status: "error", windowId, trackId, url, error: i18n.t("music:audioCoordinator.audioMustUseAValid"), currentTime: 0, duration: null, canSeek: false });
      return false;
    }
    const changed = !audio || snapshot.windowId !== windowId || snapshot.trackId !== trackId || snapshot.url !== url || (element ? audio !== element : suppliedMedia);
    cancelTimeout();
    if (changed) {
      releaseAudio();
      audio = element ?? options.createAudio();
      suppliedMedia = !!element;
      audio.volume = snapshot.volume;
      bindAudio(audio);
    }
    const player = audio!;
    emit({ status: "loading", windowId, trackId, url, currentTime: changed ? 0 : snapshot.currentTime, duration: changed ? null : snapshot.duration, canSeek: changed ? false : snapshot.canSeek, error: "" });
    if (changed) {
      player.src = url;
      player.load();
    }
    timeoutId = setTimer(() => {
      timeoutId = null;
      if (generation === request && snapshot.status === "loading" && snapshot.windowId === windowId && snapshot.trackId === trackId) mediaError(i18n.t(suppliedMedia ? "music:m3.failure" : "music:audioCoordinator.audioLoadingTimedOutOpen"));
    }, loadTimeoutMs);
    try {
      await player.play();
      if (generation !== request) return false;
      cancelTimeout();
      emit({ status: "playing", error: "" });
      return true;
    } catch {
      if (generation === request) mediaError(i18n.t(suppliedMedia ? "music:m3.failure" : "music:audioCoordinator.theBrowserCouldntPlayThis"));
      return false;
    }
  }

  async function playResolved(windowId: string, trackId: string, resolve: () => Promise<string | null>): Promise<boolean> {
    stopAll();
    const request = ++generation;
    emit({ status: "loading", windowId, trackId, url: "", error: "" });
    timeoutId = setTimer(() => {
      if (generation === request) mediaError(i18n.t("music:audioCoordinator.audioLoadingTimedOutRetry"));
    }, loadTimeoutMs);
    try {
      const url = await resolve();
      if (generation !== request) return false;
      if (!url) { mediaError(i18n.t("music:audioCoordinator.theAudioCouldntBeLoaded2")); return false; }
      return play(windowId, trackId, url);
    } catch {
      if (generation === request) mediaError(i18n.t("music:audioCoordinator.theAudioCouldntBeLoaded2"));
      return false;
    }
  }

  function pause(windowId?: string) {
    if (windowId && snapshot.windowId !== windowId) return;
    generation += 1;
    cancelTimeout();
    audio?.pause();
    if (snapshot.status !== "idle" && snapshot.status !== "error") emit({ status: "paused" });
  }

  function stopWindow(windowId: string) {
    if (snapshot.windowId !== windowId) return;
    stopAll();
  }

  function stopAll() {
    generation += 1;
    cancelTimeout();
    releaseAudio();
    snapshot = { ...initialSnapshot(), volume: snapshot.volume };
    for (const listener of listeners) listener();
  }

  function seek(windowId: string, seconds: number) {
    if (!audio || snapshot.windowId !== windowId || !snapshot.canSeek || snapshot.duration === null) return;
    if (!Number.isFinite(seconds)) return;
    audio.currentTime = Math.max(0, Math.min(snapshot.duration, seconds));
    syncTime();
  }

  function setVolume(value: number) {
    if (!Number.isFinite(value)) return;
    const volume = Math.max(0, Math.min(1, value));
    if (audio) audio.volume = volume;
    emit({ volume });
  }

  return {
    play, playResolved, pause, stopWindow, stopAll, seek, setVolume,
    stopElement(element: AudioPort) { if (audio === element) stopAll(); },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}

export const musicPlayback = createAudioCoordinator({
  createAudio: () => new Audio() as AudioPort
});

export function useMusicPlayback() {
  return useSyncExternalStore(musicPlayback.subscribe, musicPlayback.getSnapshot, musicPlayback.getSnapshot);
}
