import { describe, expect, it } from "vitest";
import { classifyPastedUrl } from "./sourceClassifier";

const SPOTIFY_TRACK = "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA";
const YOUTUBE_VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

describe("classifyPastedUrl", () => {
  it("recognises supported platform links as official embeds, in their common forms", () => {
    for (const url of [SPOTIFY_TRACK, `${SPOTIFY_TRACK}?si=abc`, YOUTUBE_VIDEO, "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "https://www.youtube.com/playlist?list=PL1234567890ab"]) {
      const result = classifyPastedUrl(url);
      expect(result.type, url).toBe("embed");
    }
    const embed = classifyPastedUrl(YOUTUBE_VIDEO);
    if (embed.type !== "embed") throw new Error("expected embed");
    expect(embed.platformLabel).toBe("YouTube");
    expect(embed.source).toMatchObject({ kind: "providerEmbed", provider: "youtube", resourceType: "video", resourceId: "dQw4w9WgXcQ", originalUrl: YOUTUBE_VIDEO });
  });

  it("recognises a direct audio file URL, ignoring query strings, and keeps it for the native player", () => {
    for (const url of ["https://cdn.example.com/a/theme.mp3", "https://cdn.example.com/theme.OGG?token=1", "https://cdn.example.com/x.m4a", "https://cdn.example.com/x.wav"]) {
      expect(classifyPastedUrl(url), url).toMatchObject({ type: "audio-file", url });
    }
  });

  it("never treats a web page as audio, including platform pages it cannot embed", () => {
    expect(classifyPastedUrl("https://example.com/my-song")).toMatchObject({ type: "web-page", platform: null, reason: "page" });
    expect(classifyPastedUrl("https://www.youtube.com/@channel")).toMatchObject({ type: "web-page", platform: "youtube", reason: "unsupported-resource" });
    expect(classifyPastedUrl("https://open.spotify.com/artist/50q2aUjWoTn6CJIfSPRJQA")).toMatchObject({ type: "web-page", platform: "spotify", reason: "unsupported-resource" });
    expect(classifyPastedUrl("https://spotify.link/abc")).toMatchObject({ type: "web-page", platform: "spotify", reason: "short-link" });
    expect(classifyPastedUrl("https://music.apple.com/tw/album/x/1")).toMatchObject({ type: "web-page", platform: "apple-music", reason: "unsupported-platform" });
    expect(classifyPastedUrl("https://soundcloud.com/a/b")).toMatchObject({ type: "web-page", platform: "soundcloud", reason: "unsupported-platform" });
  });

  it("is honest about video files: recognised, kept as an external link", () => {
    expect(classifyPastedUrl("https://cdn.example.com/clip.mp4")).toMatchObject({ type: "video-file" });
    expect(classifyPastedUrl("https://cdn.example.com/clip.MOV?x=1")).toMatchObject({ type: "video-file" });
  });

  it("treats empty input as empty and unusable input as invalid with a reason", () => {
    for (const blank of ["", "  ", "https://", "http://"]) expect(classifyPastedUrl(blank).type).toBe("empty");
    expect(classifyPastedUrl("not a url")).toMatchObject({ type: "invalid", reason: "not-url" });
    expect(classifyPastedUrl("ftp://example.com/a.mp3")).toMatchObject({ type: "invalid", reason: "not-https" });
    expect(classifyPastedUrl("https://user:pw@example.com/a.mp3")).toMatchObject({ type: "invalid", reason: "credentials" });
    expect(classifyPastedUrl("https://example.com:8443/a.mp3")).toMatchObject({ type: "invalid", reason: "port" });
    expect(classifyPastedUrl(`https://example.com/${"a".repeat(2100)}`)).toMatchObject({ type: "invalid", reason: "too-long" });
  });

  it("allows plain http only for an ordinary web page, never as a player source", () => {
    expect(classifyPastedUrl("http://example.com/page")).toMatchObject({ type: "web-page", reason: "page" });
    expect(classifyPastedUrl("http://example.com/theme.mp3")).toMatchObject({ type: "invalid", reason: "not-https" });
    expect(classifyPastedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ type: "invalid", reason: "not-https" });
  });

  it("does not be fooled by look-alike hosts or paths", () => {
    expect(classifyPastedUrl("https://open.spotify.com.evil.example/track/50q2aUjWoTn6CJIfSPRJQA").type).toBe("web-page");
    expect(classifyPastedUrl("https://evil.example/open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA").type).toBe("web-page");
    expect(classifyPastedUrl("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ").type).toBe("web-page");
  });
});
