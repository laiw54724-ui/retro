import { PLATFORM_LABELS, detectPlatformFromUrl, resolveEmbedUrl, type EmbedResource, type KnownPlatform } from "@retrodesk/shared";
import { isVideoFileUrl } from "./sourceClassifier";
import { i18n } from "../../../i18n";

const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i;

export type UrlInsight = {
  /** The music platform the link belongs to, if any (guidance only). */
  platform: KnownPlatform | null;
  platformLabel: string | null;
  /** Set when Retro can build an official embed for this link. */
  embed: EmbedResource | null;
  /** Why a known platform link cannot be embedded (shown to the author). */
  embedProblem: string | null;
  looksLikeAudioFile: boolean;
  /** A platform web page, which a native <audio> element can never play. */
  isPlatformPage: boolean;
};

const empty: UrlInsight = { platform: null, platformLabel: null, embed: null, embedProblem: null, looksLikeAudioFile: false, isPlatformPage: false };

function pathnameOf(url: string): string {
  try { return new URL(url.trim()).pathname; } catch { return ""; }
}

const isBlank = (url: string) => !url.trim() || url.trim() === "https://" || url.trim() === "http://";

/** Looks at a pasted link and says what it is, so the editor can guide instead of silently failing. */
export function insightForUrl(url: string): UrlInsight {
  if (isBlank(url)) return empty;
  const looksLikeAudioFile = AUDIO_FILE.test(pathnameOf(url));
  const resolved = resolveEmbedUrl(url);
  if (resolved.status === "supported") {
    return { platform: resolved.provider, platformLabel: PLATFORM_LABELS[resolved.provider], embed: resolved, embedProblem: null, looksLikeAudioFile, isPlatformPage: true };
  }
  const platform = resolved.status === "unsupported" ? resolved.platform : detectPlatformFromUrl(url);
  if (!platform) return { ...empty, looksLikeAudioFile };

  const label = PLATFORM_LABELS[platform];
  let embedProblem: string;
  if (resolved.status === "unsupported" && resolved.reason === "short-link") embedProblem = i18n.t("music:sourceInsight.pasteTheFullUrlShort", { label });
  else if (platform === "spotify") embedProblem = i18n.t("music:sourceInsight.spotifyEmbedsCurrentlySupportTrack");
  else if (platform === "youtube") embedProblem = i18n.t("music:sourceInsight.youtubeEmbedsCurrentlySupportSingle");
  else embedProblem = i18n.t("music:sourceInsight.embedsArentSupportedYetUse", { label });
  return { platform, platformLabel: label, embed: null, embedProblem, looksLikeAudioFile, isPlatformPage: !looksLikeAudioFile };
}

/** Turns a raw playback error into a reason the author or visitor can act on. */
export function explainPlaybackFailure(url: string, rawMessage: string): string {
  if (isVideoFileUrl(url)) return i18n.t("music:m3.failure");
  const insight = insightForUrl(url);
  if (insight.isPlatformPage && insight.platformLabel) {
    return i18n.t("music:sourceInsight.thisIsAWebPage", { platformLabel: insight.platformLabel });
  }
  if (!isBlank(url) && !insight.looksLikeAudioFile) {
    return i18n.t("music:sourceInsight.thisUrlDoesntLookLike", { rawMessage });
  }
  return i18n.t("music:sourceInsight.theFileMayHaveBeen", { rawMessage });
}
