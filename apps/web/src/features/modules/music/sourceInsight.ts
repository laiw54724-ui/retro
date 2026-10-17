import { PLATFORM_LABELS, detectPlatformFromUrl, resolveEmbedUrl, type EmbedResource, type KnownPlatform } from "@retrodesk/shared";

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
  if (resolved.status === "unsupported" && resolved.reason === "short-link") embedProblem = `請貼上 ${label} 的完整網址，短網址無法安全辨識。`;
  else if (platform === "spotify") embedProblem = "Spotify 內嵌目前支援單曲、專輯與播放清單的網址。";
  else if (platform === "youtube") embedProblem = "YouTube 內嵌目前支援單一影片與播放清單的網址。";
  else embedProblem = `目前尚未支援 ${label} 內嵌，請改用「外部連結」。`;
  return { platform, platformLabel: label, embed: null, embedProblem, looksLikeAudioFile, isPlatformPage: !looksLikeAudioFile };
}

/** Turns a raw playback error into a reason the author or visitor can act on. */
export function explainPlaybackFailure(url: string, rawMessage: string): string {
  const insight = insightForUrl(url);
  if (insight.isPlatformPage && insight.platformLabel) {
    return `這是 ${insight.platformLabel} 的網頁連結，不是音訊檔，瀏覽器無法直接播放。請把來源改成「外部連結」或「平台播放器」。`;
  }
  if (!isBlank(url) && !insight.looksLikeAudioFile) {
    return `${rawMessage} 這個網址看起來不是音訊檔（.mp3、.ogg、.wav…）。`;
  }
  return `${rawMessage} 可能是檔案已移除、網站不允許外站使用，或格式不受支援。`;
}
