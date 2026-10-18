import { useEffect, useId, useState } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { PLATFORM_LABELS, embedUrlFor, type MusicTrack } from "@retrodesk/shared";
import { embedSession, useActiveEmbed } from "./mediaSession";

type EmbedSource = Extract<MusicTrack["source"], { kind: "providerEmbed" }>;

const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";
const ALLOW: Record<EmbedSource["provider"], string> = {
  spotify: "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture",
  youtube: "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
};
const HOST: Record<EmbedSource["provider"], string> = { spotify: "open.spotify.com", youtube: "www.youtube-nocookie.com" };
const providerNote = (): Record<EmbedSource["provider"], string> => ({
  spotify: i18n.t("music:providerPlayer.whetherItPlaysInFull"),
  youtube: i18n.t("music:providerPlayer.someVideosDontAllowEmbedded")
});
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
  const { t: tr } = useTranslation("music");
  const label = PLATFORM_LABELS[source.provider];
  const active = useActiveEmbed();
  const instanceId = useId();
  const isActive = active.windowId === windowId && active.trackId === trackId && active.instanceId === instanceId;
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
  useEffect(() => () => embedSession.dispose(windowId, trackId, instanceId), [windowId, trackId, instanceId]);

  const tall = source.provider === "spotify" && source.resourceType !== "track";
  const frameStyle = source.provider === "spotify"
    ? { height: tall ? 352 : 152 }
    : { aspectRatio: "16 / 9", minHeight: 200 };

  return (
    <section className="music-embed" aria-label={tr("providerPlayer.player", { label })} data-provider={source.provider}>
      {isActive && src ? (
        <div className="music-embed-frame" style={{ minWidth: 200 }}>
          <iframe
            key={src}
            title={tr("music.playerTitle", { label, title: title || tr("music.untitledTrackLabel") })}
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
          <strong>{tr("music.playerHeading", { label })}</strong>
          <span>{src ? tr("providerPlayer.nothingConnectsToUntilYou", { v1: HOST[source.provider], label }) : tr("providerPlayer.thisSourcesIdIsNo")}</span>
        </div>
      )}
      <div className="music-embed-actions">
        {isActive
          ? <button type="button" className="w98-btn" onClick={() => embedSession.dispose(windowId, trackId, instanceId)}>{tr("providerPlayer.closePlayer")}</button>
          : <button type="button" className="w98-btn primary" disabled={!src} onClick={() => embedSession.activate(windowId, trackId, instanceId)}>{tr("music.loadPlayer", { label })}</button>}
        <button type="button" className="w98-btn music-open" onClick={onOpenOriginal}>{tr("music.openOn", { label })}</button>
      </div>
      <small className="music-embed-note">{providerNote()[source.provider]}</small>
      {isActive && slow && !loaded ? <div role="status" className="music-embed-slow">{tr("music.slowNotice", { label })}</div> : null}
    </section>
  );
}
