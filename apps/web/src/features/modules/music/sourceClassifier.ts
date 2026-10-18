import { PLATFORM_LABELS, detectPlatformFromUrl, resolveEmbedUrl, type KnownPlatform, type MusicTrack } from "@retrodesk/shared";

type EmbedSource = Extract<MusicTrack["source"], { kind: "providerEmbed" }>;

const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i;
const VIDEO_FILE = /\.(mp4|m4v|mov|ogv|mkv|avi)$/i;

/** What a pasted link is, decided without asking the author to pick a source type. */
export type PastedSource =
  | { type: "empty" }
  | { type: "invalid"; reason: "not-url" | "not-https" | "credentials" | "port" | "too-long" }
  /** A platform link Retro can embed with the official player; plays in the page after the visitor presses play. */
  | { type: "embed"; source: EmbedSource; platformLabel: string }
  /** A direct audio file: played by Retro's own audio player. */
  | { type: "audio-file"; url: string }
  /** A direct video file: recognised, but there is no in-page video player yet, so it is kept as an external link. */
  | { type: "video-file"; url: string }
  /** Anything else on the web: kept as an external link. A web page is never handed to an audio/video element. */
  | { type: "web-page"; url: string; platform: KnownPlatform | null; platformLabel: string | null; reason: "short-link" | "unsupported-resource" | "unsupported-platform" | "page" };

const isBlank = (raw: string) => !raw.trim() || raw.trim() === "https://" || raw.trim() === "http://";

export function classifyPastedUrl(raw: string): PastedSource {
  const text = (raw ?? "").trim();
  if (isBlank(text)) return { type: "empty" };

  const resolved = resolveEmbedUrl(text);
  if (resolved.status === "supported") {
    return {
      type: "embed",
      platformLabel: PLATFORM_LABELS[resolved.provider],
      source: { kind: "providerEmbed", provider: resolved.provider, resourceType: resolved.resourceType, resourceId: resolved.resourceId, canonicalUrl: resolved.canonicalUrl, originalUrl: text }
    };
  }
  if (resolved.status === "invalid") {
    // Plain http:// is fine for an ordinary web page, but never for a player source.
    if (resolved.reason === "not-https") {
      let url: URL | null = null;
      try { url = new URL(text); } catch { /* not a URL */ }
      if (url && url.protocol === "http:" && !url.username && !url.password && !AUDIO_FILE.test(url.pathname) && !VIDEO_FILE.test(url.pathname) && !detectPlatformFromUrl(text)) {
        return { type: "web-page", url: text, platform: null, platformLabel: null, reason: "page" };
      }
      return { type: "invalid", reason: "not-https" };
    }
    return { type: "invalid", reason: resolved.reason as "not-url" | "credentials" | "port" | "too-long" };
  }

  let pathname = "";
  try { pathname = new URL(text).pathname; } catch { /* unreachable: resolveEmbedUrl parsed it */ }
  if (AUDIO_FILE.test(pathname)) return { type: "audio-file", url: text };
  if (VIDEO_FILE.test(pathname)) return { type: "video-file", url: text };

  const platform = resolved.platform ?? detectPlatformFromUrl(text);
  if (platform) {
    return {
      type: "web-page", url: text, platform, platformLabel: PLATFORM_LABELS[platform],
      reason: resolved.reason === "short-link" ? "short-link" : resolved.reason === "unsupported-resource" || platform === "youtube" || platform === "spotify" ? "unsupported-resource" : "unsupported-platform"
    };
  }
  return { type: "web-page", url: text, platform: null, platformLabel: null, reason: "page" };
}
