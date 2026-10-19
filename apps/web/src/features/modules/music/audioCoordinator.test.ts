import { describe, expect, it, vi } from "vitest";
import { createAudioCoordinator, type AudioPort } from "./audioCoordinator";

class FakeAudio extends EventTarget implements AudioPort {
  src = "";
  currentTime = 0;
  duration = 90;
  volume = 1;
  paused = true;
  seekable = { length: 1 };
  rejectNext = false;
  load = vi.fn();
  pause = vi.fn(() => { this.paused = true; this.dispatchEvent(new Event("pause")); });
  play = vi.fn(async () => {
    if (this.rejectNext) { this.rejectNext = false; throw new Error("blocked"); }
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  });
}

describe("music audio coordinator", () => {
  it("keeps one active source and pauses before switching tracks", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    expect(await player.play("window-a", "track-a", "https://media.example.com/a.mp3")).toBe(true);
    expect(player.getSnapshot()).toMatchObject({ status: "playing", windowId: "window-a", trackId: "track-a" });
    expect(await player.play("window-b", "track-b", "https://media.example.com/b.mp3")).toBe(true);
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe("https://media.example.com/b.mp3");
    expect(player.getSnapshot()).toMatchObject({ status: "playing", windowId: "window-b", trackId: "track-b" });
  });

  it("never reports playing after an invalid URL or rejected play promise", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    expect(await player.play("window-a", "track-a", "http://media.example.com/a.mp3")).toBe(false);
    expect(player.getSnapshot()).toMatchObject({ status: "error" });
    audio.rejectNext = true;
    expect(await player.play("window-a", "track-a", "https://media.example.com/a.mp3")).toBe(false);
    expect(player.getSnapshot()).toMatchObject({ status: "error" });
  });

  it("turns a native media error into a stopped, actionable state", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    await player.play("window-a", "track-a", "https://media.example.com/a.mp3");
    audio.dispatchEvent(new Event("error"));
    expect(player.getSnapshot()).toMatchObject({ status: "error", error: expect.stringContaining("無法載入") });
    expect(audio.pause).toHaveBeenCalled();
  });

  it("keeps volume in session state and only seeks seekable media", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    await player.play("window-a", "track-a", "https://media.example.com/a.mp3");
    audio.dispatchEvent(new Event("loadedmetadata"));
    player.setVolume(0.35);
    player.seek("window-a", 45);
    expect(audio.volume).toBe(0.35);
    expect(audio.currentTime).toBe(45);
    audio.seekable.length = 0;
    audio.dispatchEvent(new Event("durationchange"));
    player.seek("window-a", 70);
    expect(audio.currentTime).toBe(45);
  });

  it("stops only the owning window and clears runtime state", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    await player.play("window-a", "track-a", "https://media.example.com/a.mp3");
    player.stopWindow("other");
    expect(player.getSnapshot().status).toBe("playing");
    player.stopWindow("window-a");
    expect(player.getSnapshot()).toMatchObject({ status: "idle", windowId: null, trackId: null });
    expect(audio.src).toBe("");
    expect(audio.currentTime).toBe(0);
  });
});

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("integrated protected-media lifecycle", () => {
  it("plays a resolved private blob without rebuilding the native audio object", async () => {
    const audio = new FakeAudio();
    const createAudio = vi.fn(() => audio);
    const player = createAudioCoordinator({ createAudio });
    expect(await player.playResolved("w", "private", async () => "blob:https://retro.test/private-audio")).toBe(true);
    expect(audio.src).toBe("blob:https://retro.test/private-audio");
    audio.currentTime = 83;
    await player.play("w", "private", audio.src);
    expect(createAudio).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(83);
    player.stopAll();
  });

  it.each(["close", "pause", "switch-native", "switch-platform"] as const)("discards a late asset resolution after %s", async (action) => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    const source = pending<string | null>();
    const attempt = player.playResolved("w", "private", () => source.promise);
    if (action === "close") player.stopWindow("w");
    if (action === "pause") player.pause("w");
    if (action === "switch-native") await player.play("other", "new", "https://example.com/new.mp3");
    if (action === "switch-platform") player.stopAll(); // the embed session calls this before activation
    const before = { ...player.getSnapshot() };
    const calls = audio.play.mock.calls.length;
    source.resolve("blob:https://retro.test/stale");
    expect(await attempt).toBe(false);
    expect(player.getSnapshot()).toEqual(before);
    expect(audio.play).toHaveBeenCalledTimes(calls);
    expect(audio.src).not.toBe("blob:https://retro.test/stale");
    player.stopAll();
  });

  it("ignores rejection of an older play promise for the same track after its URL changed", async () => {
    const audio = new FakeAudio();
    const old = pending<void>();
    audio.play.mockImplementationOnce(() => old.promise);
    const player = createAudioCoordinator({ createAudio: () => audio });
    const attempt = player.play("w", "same", "https://example.com/old.mp3");
    await player.play("w", "same", "https://example.com/new.mp3");
    old.reject(new Error("late rejection"));
    expect(await attempt).toBe(false);
    expect(player.getSnapshot()).toMatchObject({ status: "playing", url: "https://example.com/new.mp3", error: "" });
    player.stopAll();
  });

  it("does not report playing when a paused pending play promise resolves", async () => {
    const audio = new FakeAudio();
    const waiting = pending<void>();
    audio.play.mockImplementationOnce(() => waiting.promise);
    const player = createAudioCoordinator({ createAudio: () => audio });
    const attempt = player.play("w", "t", "https://example.com/a.mp3");
    player.pause("w");
    waiting.resolve();
    expect(await attempt).toBe(false);
    expect(player.getSnapshot().status).toBe("paused");
    player.stopAll();
  });

  it("silences an existing native source when the next URL is invalid", async () => {
    const audio = new FakeAudio();
    const player = createAudioCoordinator({ createAudio: () => audio });
    await player.play("w", "t", "https://example.com/a.mp3");
    expect(await player.play("w", "invalid", "javascript:alert(1)")).toBe(false);
    expect(audio.paused).toBe(true);
    expect(audio.src).toBe("");
    expect(player.getSnapshot().status).toBe("error");
    player.stopAll();
  });

  it("times out a protected source and ignores its later result", async () => {
    let timeout: (() => void) | undefined;
    const audio = new FakeAudio();
    const source = pending<string | null>();
    const player = createAudioCoordinator({ createAudio: () => audio, setTimer: (callback) => { timeout = callback; return 1; }, clearTimer: () => {} });
    const attempt = player.playResolved("w", "t", () => source.promise);
    timeout!();
    expect(player.getSnapshot().status).toBe("error");
    source.resolve("blob:https://retro.test/too-late");
    expect(await attempt).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });
});

describe("visible video shares native ownership", () => {
  it("stops and clears audio before video, then clears video before a new audio source", async () => {
    const audio = new FakeAudio();
    const video = new FakeAudio();
    const coordinator = createAudioCoordinator({ createAudio: () => audio });
    await coordinator.play("audio-window", "audio", "https://media.example.com/a.mp3");
    await coordinator.play("video-window", "video", "https://media.example.com/a.mp4", video);
    expect(audio.src).toBe("");
    expect(audio.paused).toBe(true);
    expect(video.paused).toBe(false);
    await coordinator.play("audio-window", "audio", "https://media.example.com/b.mp3");
    expect(video.src).toBe("");
    expect(video.paused).toBe(true);
    // The detached element's events must never poison the newer source.
    for (const type of ["playing", "pause", "ended", "error", "loadedmetadata"]) video.dispatchEvent(new Event(type));
    expect(coordinator.getSnapshot()).toMatchObject({ status: "playing", trackId: "audio" });
    coordinator.stopAll();
  });

  it("ignores stale video play rejection and cleanup from another mounted copy", async () => {
    const audio = new FakeAudio();
    const video = new FakeAudio();
    const stale = pending<void>();
    video.play = vi.fn(() => stale.promise);
    const coordinator = createAudioCoordinator({ createAudio: () => audio });
    const first = coordinator.play("same-window", "same-track", "https://media.example.com/a.mp4", video);
    await coordinator.play("same-window", "same-track", "https://media.example.com/a.mp4", audio);
    coordinator.stopElement(video);
    stale.reject(new Error("old video"));
    expect(await first).toBe(false);
    expect(coordinator.getSnapshot()).toMatchObject({ status: "playing", trackId: "same-track" });
    coordinator.stopElement(audio);
    expect(coordinator.getSnapshot().status).toBe("idle");
  });

  it("clears failed video, supports retry and native control pause/resume", async () => {
    const video = new FakeAudio();
    const coordinator = createAudioCoordinator({ createAudio: () => new FakeAudio() });
    video.rejectNext = true;
    expect(await coordinator.play("w", "v", "https://media.example.com/a.mp4", video)).toBe(false);
    expect(video.src).toBe("");
    expect(coordinator.getSnapshot()).toMatchObject({ status: "error" });
    expect(await coordinator.play("w", "v", "https://media.example.com/a.mp4", video)).toBe(true);
    video.pause();
    expect(coordinator.getSnapshot().status).toBe("paused");
    await video.play();
    expect(coordinator.getSnapshot().status).toBe("playing");
    coordinator.stopWindow("w");
    expect(video.paused).toBe(true);
    expect(video.src).toBe("");
  });
});

describe("native session event boundaries", () => {
  it("does not let an already queued timeout fail a replacement source with the same ids", async () => {
    const callbacks: (() => void)[] = [];
    const video = new FakeAudio();
    const waiting = pending<void>();
    video.play = vi.fn(() => waiting.promise);
    const coordinator = createAudioCoordinator({ createAudio: () => new FakeAudio(), setTimer: (fn) => { callbacks.push(fn); return callbacks.length; }, clearTimer: () => {} });
    const first = coordinator.play("w", "v", "https://media.example.com/old.mp4", video);
    const replacement = new FakeAudio();
    const replacementReady = pending<void>();
    replacement.play = vi.fn(() => replacementReady.promise);
    const second = coordinator.play("w", "v", "https://media.example.com/new.mp4", replacement);
    callbacks[0]();
    expect(coordinator.getSnapshot()).toMatchObject({ trackId: "v", url: "https://media.example.com/new.mp4", status: "loading" });
    replacementReady.resolve();
    waiting.resolve();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    coordinator.stopAll();
  });
  it("retains real native-control volume when switching to another media source", async () => {
    const video = new FakeAudio();
    const audio = new FakeAudio();
    const coordinator = createAudioCoordinator({ createAudio: () => audio });
    await coordinator.play("w", "v", "https://media.example.com/a.mp4", video);
    video.volume = 0.3;
    video.dispatchEvent(new Event("volumechange"));
    await coordinator.play("w", "a", "https://media.example.com/a.wav");
    expect(audio.volume).toBe(0.3);
    coordinator.stopAll();
  });
});
