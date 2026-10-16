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
