import { useEffect, useState } from "react";
import { PLATFORM_LABELS, embedUrlFor, type MusicTrack } from "@retrodesk/shared";
import { embedSession, useActiveEmbed } from "./mediaSession";

type EmbedSource = Extract<MusicTrack["source"], { kind: "providerEmbed" }>;

const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
const ALLOW: Record<EmbedSource["provider"], string> = {
  spotify: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
  youtube: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
};
const HOST: Record<EmbedSource["provider"], string> = { spotify: "open.spotify.com", youtube: "www.youtube-nocookie.com" };
const NOTE: Record<EmbedSource["provider"], string> = {
  spotify: "能否完整播放取決於你的 Spotify 帳號、地區與瀏覽器 Cookie 設定；未登入時可能只有預覽片段。",
  youtube: "部分影片不允許嵌入播放；遇到這種情況請改用「在 YouTube 開啟」。"
};
const SLOW_MS = 8000;

type Props = {
  source: EmbedSource;
  title: string;
  windowId: string;
  trackId: string;
  onOpenOriginal: () => void;
};

/**
 * Official platform player. Nothing is loaded (no iframe, script or cookie) until the visitor
 * clicks; the iframe URL is rebuilt from validated ids, never taken from stored text.
 */
export function ProviderPlayer({ source, title, windowId, trackId, onOpenOriginal }: Props) {
  const label = PLATFORM_LABELS[source.provider];
  const active = useActiveEmbed();
  const isActive = active.windowId === windowId && active.trackId === trackId;
  const src = embedUrlFor(source.provider, source.resourceType, source.resourceId);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    if (!isActive) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [isActive, src]);

  // Unmounting the frame is the only reliable way to stop a platform player, so tie it to this view's lifetime.
  useEffect(() => () => embedSession.dispose(windowId, trackId), [windowId, trackId]);

  const tall = source.provider === "spotify" && source.resourceType !== "track";
  const frameStyle = source.provider === "spotify"
    ? { height: tall ? 352 : 152 }
    : { aspectRatio: "16 / 9", minHeight: 200 };

  return (
    <section className="music-embed" aria-label={`${label} 播放器`} data-provider={source.provider}>
      {isActive && src ? (
        <div className="music-embed-frame" style={{ minWidth: 200 }}>
          <iframe
            key={src}
            title={`${label} 播放器：${title || "未命名曲目"}`}
            src={src}
            sandbox={SANDBOX}
            allow={ALLOW[source.provider]}
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="eager"
            style={{ width: "100%", border: 0, display: "block", ...frameStyle }}
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div className="music-embed-card">
          <strong>{label} 播放器</strong>
          <span>{src ? `按下「載入」才會連線到 ${HOST[source.provider]}；載入前不會向 ${label} 傳送任何資料。` : "這個來源的識別碼已失效，無法建立播放器。"}</span>
        </div>
      )}
      <div className="music-embed-actions">
        {isActive
          ? <button type="button" className="w98-btn" onClick={() => embedSession.dispose(windowId, trackId)}>關閉播放器</button>
          : <button type="button" className="w98-btn primary" disabled={!src} onClick={() => embedSession.activate(windowId, trackId)}>載入 {label} 播放器</button>}
        <button type="button" className="w98-btn music-open" onClick={onOpenOriginal}>在 {label} 開啟 ↗</button>
      </div>
      <small className="music-embed-note">{NOTE[source.provider]}</small>
      {isActive && slow && !loaded ? <div role="status" className="music-embed-slow">{label} 播放器還沒有回應。若一直沒有顯示，請使用「在 {label} 開啟」。</div> : null}
    </section>
  );
}
