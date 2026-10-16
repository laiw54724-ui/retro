import { useSyncExternalStore } from "react";

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

function playableHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function createAudioCoordinator(options: CoordinatorOptions) {
  let audio: AudioPort | null = null;
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
    cancelTimeout();
    audio?.pause();
    emit({ status: "error", error: fallback });
  };
  const syncTime = () => {
    if (!audio) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    emit({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0, duration, canSeek: !!duration && audio.seekable.length > 0 });
  };
  const ensureAudio = () => {
    if (audio) return audio;
    audio = options.createAudio();
    audio.volume = snapshot.volume;
    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("durationchange", syncTime);
    audio.addEventListener("loadedmetadata", () => { cancelTimeout(); syncTime(); });
    audio.addEventListener("playing", () => { cancelTimeout(); emit({ status: "playing", error: "" }); });
    audio.addEventListener("pause", () => {
      if (snapshot.status !== "idle" && snapshot.status !== "error") emit({ status: "paused" });
    });
    audio.addEventListener("ended", () => { cancelTimeout(); syncTime(); emit({ status: "paused" }); });
    audio.addEventListener("error", () => mediaError("音訊無法載入，請檢查網址、權限或跨站限制。"));
    return audio;
  };

  async function play(windowId: string, trackId: string, url: string): Promise<boolean> {
    if (!playableHttpsUrl(url)) {
      emit({ status: "error", windowId, trackId, url, error: "音訊必須使用有效的 HTTPS 直連網址。", currentTime: 0, duration: null, canSeek: false });
      return false;
    }
    const player = ensureAudio();
    const changed = snapshot.windowId !== windowId || snapshot.trackId !== trackId || snapshot.url !== url;
    cancelTimeout();
    if (changed) {
      player.pause();
      player.currentTime = 0;
      player.src = url;
      player.load();
    }
    emit({ status: "loading", windowId, trackId, url, currentTime: changed ? 0 : snapshot.currentTime, duration: changed ? null : snapshot.duration, canSeek: changed ? false : snapshot.canSeek, error: "" });
    timeoutId = setTimer(() => {
      timeoutId = null;
      if (snapshot.status === "loading" && snapshot.windowId === windowId && snapshot.trackId === trackId) mediaError("音訊載入逾時，請開啟原連結確認來源是否仍可用。");
    }, loadTimeoutMs);
    try {
      await player.play();
      if (snapshot.windowId === windowId && snapshot.trackId === trackId) emit({ status: "playing", error: "" });
      return true;
    } catch {
      if (snapshot.windowId === windowId && snapshot.trackId === trackId) mediaError("瀏覽器未能播放這個音訊；請再次操作或開啟原連結。");
      return false;
    }
  }

  function pause(windowId?: string) {
    if (windowId && snapshot.windowId !== windowId) return;
    cancelTimeout();
    audio?.pause();
    if (snapshot.status !== "idle" && snapshot.status !== "error") emit({ status: "paused" });
  }

  function stopWindow(windowId: string) {
    if (snapshot.windowId !== windowId) return;
    stopAll();
  }

  function stopAll() {
    cancelTimeout();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
      audio.load();
      audio.volume = snapshot.volume;
    }
    snapshot = { ...initialSnapshot(), volume: snapshot.volume };
    for (const listener of listeners) listener();
  }

  function seek(windowId: string, seconds: number) {
    if (!audio || snapshot.windowId !== windowId || !snapshot.canSeek || snapshot.duration === null) return;
    audio.currentTime = Math.max(0, Math.min(snapshot.duration, seconds));
    syncTime();
  }

  function setVolume(value: number) {
    const volume = Math.max(0, Math.min(1, value));
    if (audio) audio.volume = volume;
    emit({ volume });
  }

  return {
    play, pause, stopWindow, stopAll, seek, setVolume,
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
