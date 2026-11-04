import { describe, expect, it } from "vitest";
import { explainPlaybackFailure, insightForUrl } from "./sourceInsight";

describe("insightForUrl", () => {
  it("recognises the user-reported Spotify and YouTube links as embeddable platform pages", () => {
    const spotify = insightForUrl("https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA");
    expect(spotify).toMatchObject({ platform: "spotify", platformLabel: "Spotify", isPlatformPage: true, embedProblem: null });
    expect(spotify.embed).toMatchObject({ provider: "spotify", resourceType: "track" });
    const youtube = insightForUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ");
    expect(youtube.embed).toMatchObject({ provider: "youtube", resourceType: "video" });
  });

  it("explains platform links that cannot be embedded", () => {
    expect(insightForUrl("https://soundcloud.com/a/b")).toMatchObject({ platform: "soundcloud", embed: null, isPlatformPage: true });
    expect(insightForUrl("https://soundcloud.com/a/b").embedProblem).toContain("SoundCloud");
    expect(insightForUrl("https://spotify.link/abc").embedProblem).toContain("完整網址");
    expect(insightForUrl("https://open.spotify.com/artist/50q2aUjWoTn6CJIfSPRJQA").embedProblem).toContain("單曲");
  });

  it("does not treat ordinary audio files or blank values as platform pages", () => {
    expect(insightForUrl("https://media.example.com/a.mp3")).toMatchObject({ platform: null, looksLikeAudioFile: true, isPlatformPage: false });
    expect(insightForUrl("https://")).toMatchObject({ platform: null, isPlatformPage: false });
    expect(insightForUrl("")).toMatchObject({ platform: null });
  });
});

describe("explainPlaybackFailure", () => {
  it("names the platform and the fix", () => {
    const message = explainPlaybackFailure("https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA", "音訊無法載入");
    expect(message).toContain("Spotify");
    expect(message).toContain("外部連結");
  });
  it("keeps the raw reason and adds a hint for non-audio and normal files", () => {
    expect(explainPlaybackFailure("https://example.com/page", "音訊無法載入。")).toContain("看起來不是音訊檔");
    expect(explainPlaybackFailure("https://media.example.com/a.mp3", "音訊無法載入。")).toContain("檔案已移除");
  });
});
