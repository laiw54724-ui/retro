import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { musicPlayback, useMusicPlayback } from "./audioCoordinator";
import { playVideo } from "./mediaSession";
import { isVideoFileUrl } from "./sourceClassifier";
import "./musicPlayback.css";

type Props = { url: string; title: string; windowId: string; trackId: string; onOpenOriginal: () => void };

/** No src/poster before a click: preload=none alone is only a browser hint. */
export function VideoPlayer({ url, title, windowId, trackId, onOpenOriginal }: Props) {
  const { t } = useTranslation("music");
  const ref = useRef<HTMLVideoElement>(null);
  const playback = useMusicPlayback();
  const active = playback.windowId === windowId && playback.trackId === trackId;
  const failed = active && playback.status === "error";
  useEffect(() => {
    const video = ref.current;
    return () => { if (video) musicPlayback.stopElement(video); };
  }, []);
  return (
    <section className="music-video" aria-label={t("m3.player", { title })}>
      <video ref={ref} controls playsInline preload="none" disablePictureInPicture disableRemotePlayback aria-label={t("m3.player", { title })} />
      <div className="music-embed-actions">
        <button type="button" className="w98-btn primary" disabled={!isVideoFileUrl(url) || active && playback.status === "loading"} onClick={() => { if (ref.current) void playVideo(windowId, trackId, url, ref.current); }}>{t(failed ? "m2.retry" : "m3.playVideo")}</button>
        <button type="button" className="w98-btn" onClick={onOpenOriginal}>{t("music.openOriginalLink")}</button>
      </div>
      {failed ? <div role="alert" className="music-error"><strong>{t("m3.cannotPlay")}</strong><span>{t("m3.failure")}</span></div> : null}
      <small className="music-embed-note">{t("m3.formatNote")}</small>
    </section>
  );
}
