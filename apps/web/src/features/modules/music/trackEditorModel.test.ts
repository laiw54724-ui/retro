import { describe, expect, it } from "vitest";
import { classifyNewTrack, sourceForNewTrack, titleFromAudioFilename, availableTrackSlots } from "./trackEditorModel";

describe("track editor additions", () => {
  it("normalizes a bare domain while preserving the canonical provider classification", () => {
    const guess = classifyNewTrack("  youtu.be/dQw4w9WgXcQ  ");
    expect(sourceForNewTrack(guess)).toMatchObject({ kind: "providerEmbed", provider: "youtube", originalUrl: "https://youtu.be/dQw4w9WgXcQ" });
    expect(sourceForNewTrack(classifyNewTrack("cdn.example.com/theme.mp3"))).toEqual({ kind: "audioUrl", url: "https://cdn.example.com/theme.mp3" });
    expect(sourceForNewTrack(classifyNewTrack("https://example.com/song"))).toEqual({ kind: "externalLink", url: "https://example.com/song" });
  });
  it("never creates tracks from invalid, empty, insecure or credentialed paste input", () => {
    for (const raw of ["", "https://", "not a url", "http://example.com/song", "javascript:alert(1)", "https://u:p@example.com/a.mp3"]) expect(sourceForNewTrack(classifyNewTrack(raw))).toBeNull();
  });
  it("cleans filenames without losing meaningful dots and respects schema limits", () => {
    expect(titleFromAudioFilename("My_First-Song.mp3")).toBe("My First Song");
    expect(titleFromAudioFilename("theme.v2.final.WAV")).toBe("theme.v2.final");
    expect(titleFromAudioFilename("x".repeat(300) + ".mp3")).toHaveLength(200);
    expect(titleFromAudioFilename("---.mp3")).toBe("");
    expect(availableTrackSlots(99, 4)).toBe(1);
    expect(availableTrackSlots(100, 1)).toBe(0);
    expect(availableTrackSlots(0, 150)).toBe(100);
  });
});
