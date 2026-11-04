/**
 * Resolves user-pasted media links into officially embeddable resources.
 *
 * Only exact, parsed hostnames and paths are accepted (never substring checks), the result carries
 * only ids that the code assembles into iframe URLs itself, and nothing is fetched or proxied.
 * "Supported" means Retro can build an official embed URL; it does not promise that the
 * platform will play the content for every region or account.
 */

export type EmbedProvider = "spotify" | "youtube";
export type EmbedResourceType = "track" | "album" | "playlist" | "video";

export type EmbedResource = {
  provider: EmbedProvider;
  resourceType: EmbedResourceType;
  resourceId: string;
  /** Normalised public page URL (what the "open original" link uses). */
  canonicalUrl: string;
  /** Official iframe URL assembled by Retro. */
  embedUrl: string;
};

export type KnownPlatform = "youtube" | "spotify" | "soundcloud" | "apple-music" | "bandcamp" | "deezer" | "tidal" | "kkbox";

export type EmbedResolution =
  | ({ status: "supported" } & EmbedResource)
  | { status: "unsupported"; reason: "unknown-host" | "unsupported-resource" | "short-link"; hostname: string; platform: KnownPlatform | null }
  | { status: "invalid"; reason: "empty" | "not-url" | "not-https" | "credentials" | "port" | "too-long" };

export const PLATFORM_LABELS: Record<KnownPlatform, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  "apple-music": "Apple Music",
  bandcamp: "Bandcamp",
  deezer: "Deezer",
  tidal: "TIDAL",
  kkbox: "KKBOX"
};

const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be", "www.youtu.be"]);
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

function hostIs(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith("." + domain);
}

/** Names the music platform a link belongs to (for guidance only; says nothing about embeddability). */
export function detectPlatform(hostname: string): KnownPlatform | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (hostIs(host, "youtube.com") || hostIs(host, "youtu.be") || hostIs(host, "youtube-nocookie.com")) return "youtube";
  if (hostIs(host, "spotify.com") || host === "spotify.link") return "spotify";
  if (hostIs(host, "soundcloud.com")) return "soundcloud";
  if (host === "music.apple.com" || host === "itunes.apple.com") return "apple-music";
  if (hostIs(host, "bandcamp.com")) return "bandcamp";
  if (hostIs(host, "deezer.com") || host === "deezer.page.link") return "deezer";
  if (hostIs(host, "tidal.com")) return "tidal";
  if (hostIs(host, "kkbox.com")) return "kkbox";
  return null;
}

/** Looks at a link only to identify the platform; null for anything that is not a parseable HTTP(S) URL. */
export function detectPlatformFromUrl(input: string): KnownPlatform | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return detectPlatform(url.hostname);
  } catch {
    return null;
  }
}

function spotify(url: URL): EmbedResolution {
  const match = url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?([a-z]+)\/([^/]+)\/?$/);
  if (!match) return { status: "unsupported", reason: "unsupported-resource", hostname: url.hostname, platform: "spotify" };
  const [, type, id] = match;
  if (!["track", "album", "playlist"].includes(type) || !SPOTIFY_ID.test(id)) {
    return { status: "unsupported", reason: "unsupported-resource", hostname: url.hostname, platform: "spotify" };
  }
  return {
    status: "supported", provider: "spotify", resourceType: type as "track" | "album" | "playlist", resourceId: id,
    canonicalUrl: `https://open.spotify.com/${type}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`
  };
}

function youtube(url: URL, hostname: string): EmbedResolution {
  const unsupported: EmbedResolution = { status: "unsupported", reason: "unsupported-resource", hostname, platform: "youtube" };
  let videoId: string | null = null;
  let listId: string | null = null;

  if (YOUTUBE_SHORT_HOSTS.has(hostname)) {
    const match = url.pathname.match(/^\/([^/]+)\/?$/);
    videoId = match?.[1] ?? null;
  } else {
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/watch") videoId = url.searchParams.get("v");
    else if (path === "/playlist") listId = url.searchParams.get("list");
    else {
      const match = path.match(/^\/(?:embed|shorts|live)\/([^/]+)$/);
      if (match && match[1] === "videoseries") listId = url.searchParams.get("list");
      else videoId = match?.[1] ?? null;
    }
  }

  if (videoId !== null) {
    if (!YOUTUBE_VIDEO_ID.test(videoId)) return unsupported;
    return {
      status: "supported", provider: "youtube", resourceType: "video", resourceId: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1`
    };
  }
  if (listId !== null && YOUTUBE_LIST_ID.test(listId)) {
    return {
      status: "supported", provider: "youtube", resourceType: "playlist", resourceId: listId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${listId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${listId}&rel=0&playsinline=1`
    };
  }
  return unsupported;
}

export function resolveEmbedUrl(input: string): EmbedResolution {
  const raw = (input ?? "").trim();
  if (!raw || raw === "https://" || raw === "http://") return { status: "invalid", reason: "empty" };
  if (raw.length > 2048) return { status: "invalid", reason: "too-long" };
  let url: URL;
  try { url = new URL(raw); } catch { return { status: "invalid", reason: "not-url" }; }
  if (url.protocol !== "https:") return { status: "invalid", reason: "not-https" };
  if (url.username || url.password) return { status: "invalid", reason: "credentials" };
  if (url.port) return { status: "invalid", reason: "port" };

  const hostname = url.hostname;
  if (SPOTIFY_HOSTS.has(hostname)) return spotify(url);
  if (YOUTUBE_HOSTS.has(hostname) || YOUTUBE_SHORT_HOSTS.has(hostname)) return youtube(url, hostname);
  const platform = detectPlatform(hostname);
  if (hostname === "spotify.link" || hostname === "on.soundcloud.com" || hostname === "deezer.page.link") {
    return { status: "unsupported", reason: "short-link", hostname, platform };
  }
  return { status: "unsupported", reason: "unknown-host", hostname, platform };
}

/** Rebuilds the embed URL from stored ids only. Returns null if the ids are not valid for the provider. */
export function embedUrlFor(provider: EmbedProvider, resourceType: EmbedResourceType, resourceId: string): string | null {
  const canonical = provider === "spotify"
    ? `https://open.spotify.com/${resourceType}/${resourceId}`
    : resourceType === "playlist" ? `https://www.youtube.com/playlist?list=${resourceId}` : `https://www.youtube.com/watch?v=${resourceId}`;
  const resolved = resolveEmbedUrl(canonical);
  return resolved.status === "supported" && resolved.provider === provider && resolved.resourceType === resourceType && resolved.resourceId === resourceId ? resolved.embedUrl : null;
}
