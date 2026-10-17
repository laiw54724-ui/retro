import { describe, expect, it } from "vitest";
import { detectPlatformFromUrl, embedUrlFor, resolveEmbedUrl } from "../src/embed-provider";

const SPOTIFY_ID = "50q2aUjWoTn6CJIfSPRJQA";
const YT = "dQw4w9WgXcQ";

describe("resolveEmbedUrl: Spotify", () => {
  it("accepts the user-reported track URL and builds the official embed URL", () => {
    expect(resolveEmbedUrl(`https://open.spotify.com/track/${SPOTIFY_ID}`)).toEqual({
      status: "supported", provider: "spotify", resourceType: "track", resourceId: SPOTIFY_ID,
      canonicalUrl: `https://open.spotify.com/track/${SPOTIFY_ID}`, embedUrl: `https://open.spotify.com/embed/track/${SPOTIFY_ID}`
    });
  });

  it("drops tracking params and accepts locale and embed paths, albums and playlists", () => {
    for (const url of [
      `https://open.spotify.com/track/${SPOTIFY_ID}?si=abc123&utm_source=copy-link`,
      `https://open.spotify.com/intl-zh/track/${SPOTIFY_ID}`,
      `https://open.spotify.com/intl-pt-br/track/${SPOTIFY_ID}/`,
      `https://open.spotify.com/embed/track/${SPOTIFY_ID}`
    ]) expect(resolveEmbedUrl(url)).toMatchObject({ status: "supported", resourceType: "track", resourceId: SPOTIFY_ID, canonicalUrl: `https://open.spotify.com/track/${SPOTIFY_ID}` });
    expect(resolveEmbedUrl(`https://open.spotify.com/album/${SPOTIFY_ID}`)).toMatchObject({ status: "supported", resourceType: "album" });
    expect(resolveEmbedUrl(`https://open.spotify.com/playlist/${SPOTIFY_ID}`)).toMatchObject({ status: "supported", resourceType: "playlist" });
  });

  it("rejects look-alike hosts, credentials, ports and plain http", () => {
    for (const url of [
      `https://open.spotify.com.evil.example/track/${SPOTIFY_ID}`,
      `https://evil.example/open.spotify.com/track/${SPOTIFY_ID}`,
      `https://evil.example/?u=https://open.spotify.com/track/${SPOTIFY_ID}`,
      `https://notopen.spotify.com/track/${SPOTIFY_ID}`,
      `https://open-spotify.com/track/${SPOTIFY_ID}`,
      `https://open.spotify.com./track/${SPOTIFY_ID}`
    ]) expect(resolveEmbedUrl(url).status, url).not.toBe("supported");
    expect(resolveEmbedUrl(`https://open.spotify.com@evil.example/track/${SPOTIFY_ID}`)).toMatchObject({ status: "invalid", reason: "credentials" });
    expect(resolveEmbedUrl(`https://user:pw@open.spotify.com/track/${SPOTIFY_ID}`)).toMatchObject({ status: "invalid", reason: "credentials" });
    expect(resolveEmbedUrl(`https://open.spotify.com:8443/track/${SPOTIFY_ID}`)).toMatchObject({ status: "invalid", reason: "port" });
    expect(resolveEmbedUrl(`http://open.spotify.com/track/${SPOTIFY_ID}`)).toMatchObject({ status: "invalid", reason: "not-https" });
    expect(resolveEmbedUrl(`javascript:alert(1)`)).toMatchObject({ status: "invalid" });
  });

  it("rejects malformed ids and unsupported resource kinds without throwing", () => {
    for (const path of ["/track/short", `/track/${SPOTIFY_ID}x`, `/track/${SPOTIFY_ID.slice(0, 21)}!`, `/artist/${SPOTIFY_ID}`, `/episode/${SPOTIFY_ID}`, "/track", "/", `/track/${SPOTIFY_ID}/extra`, `/track/..%2F${SPOTIFY_ID}`]) {
      expect(resolveEmbedUrl("https://open.spotify.com" + path), path).toMatchObject({ status: "unsupported", platform: "spotify" });
    }
  });

  it("tells short links to use the full address", () => {
    expect(resolveEmbedUrl("https://spotify.link/abc")).toMatchObject({ status: "unsupported", reason: "short-link", platform: "spotify" });
  });
});

describe("resolveEmbedUrl: YouTube", () => {
  it("accepts the common watch, short, embed and shorts URLs", () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${YT}`, `https://youtube.com/watch?v=${YT}&t=30s&list=PLabcdefghijklmn`, `https://m.youtube.com/watch?v=${YT}`,
      `https://music.youtube.com/watch?v=${YT}`, `https://youtu.be/${YT}?si=x`, `https://www.youtube.com/embed/${YT}`, `https://www.youtube-nocookie.com/embed/${YT}`,
      `https://www.youtube.com/shorts/${YT}`, `https://www.youtube.com/live/${YT}`
    ]) expect(resolveEmbedUrl(url), url).toMatchObject({ status: "supported", provider: "youtube", resourceType: "video", resourceId: YT, canonicalUrl: `https://www.youtube.com/watch?v=${YT}`, embedUrl: `https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1` });
  });

  it("accepts playlists and rejects bad ids", () => {
    expect(resolveEmbedUrl("https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuvwxyz012345")).toMatchObject({ status: "supported", resourceType: "playlist" });
    expect(resolveEmbedUrl("https://www.youtube.com/embed/videoseries?list=PLabcdefghijklmnop")).toMatchObject({ status: "supported", resourceType: "playlist" });
    for (const url of ["https://www.youtube.com/watch?v=short", `https://www.youtube.com/watch?v=${YT}x`, "https://www.youtube.com/watch", "https://www.youtube.com/", "https://www.youtube.com/@channel", "https://www.youtube.com/playlist?list=x", "https://www.youtube.com/watch?v=<script>"]) {
      expect(resolveEmbedUrl(url).status, url).toBe("unsupported");
    }
  });

  it("rejects look-alike hosts", () => {
    for (const url of [`https://www.youtube.com.evil.example/watch?v=${YT}`, `https://evil.example/youtube.com/watch?v=${YT}`, `https://youtube.com.evil.example/embed/${YT}`, `https://notyoutube.com/watch?v=${YT}`, `https://youtu.be.evil.example/${YT}`, `https://youtube.com./watch?v=${YT}`]) {
      expect(resolveEmbedUrl(url).status, url).not.toBe("supported");
    }
  });
});

describe("other inputs and helpers", () => {
  it("reports empty, malformed and unknown inputs", () => {
    expect(resolveEmbedUrl("")).toMatchObject({ status: "invalid", reason: "empty" });
    expect(resolveEmbedUrl("https://")).toMatchObject({ status: "invalid", reason: "empty" });
    expect(resolveEmbedUrl("not a url")).toMatchObject({ status: "invalid", reason: "not-url" });
    expect(resolveEmbedUrl("https://example.com/song.mp3")).toMatchObject({ status: "unsupported", reason: "unknown-host", platform: null });
    expect(resolveEmbedUrl("https://soundcloud.com/a/b")).toMatchObject({ status: "unsupported", platform: "soundcloud" });
    expect(resolveEmbedUrl("https://x.example/" + "a".repeat(2100))).toMatchObject({ status: "invalid", reason: "too-long" });
  });

  it("identifies platforms for guidance only", () => {
    expect(detectPlatformFromUrl("https://open.spotify.com/track/x")).toBe("spotify");
    expect(detectPlatformFromUrl("https://www.youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatformFromUrl("https://music.apple.com/tw/album/x")).toBe("apple-music");
    expect(detectPlatformFromUrl("https://someone.bandcamp.com/track/x")).toBe("bandcamp");
    expect(detectPlatformFromUrl("https://example.com/a.mp3")).toBeNull();
    expect(detectPlatformFromUrl("nope")).toBeNull();
  });

  it("rebuilds embed URLs from stored ids only when they are valid", () => {
    expect(embedUrlFor("spotify", "track", SPOTIFY_ID)).toBe(`https://open.spotify.com/embed/track/${SPOTIFY_ID}`);
    expect(embedUrlFor("youtube", "video", YT)).toBe(`https://www.youtube-nocookie.com/embed/${YT}?rel=0&playsinline=1`);
    expect(embedUrlFor("spotify", "track", "../../evil")).toBeNull();
    expect(embedUrlFor("youtube", "video", `${YT}"><script>`)).toBeNull();
    expect(embedUrlFor("spotify", "video", SPOTIFY_ID)).toBeNull();
  });
});
