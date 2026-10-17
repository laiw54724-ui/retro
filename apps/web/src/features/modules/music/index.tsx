import { useEffect, useMemo, useState } from "react";
import { PLATFORM_LABELS, type MusicTrack } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, type ModuleProps } from "../types";
import { musicPlayback, useMusicPlayback } from "./audioCoordinator";
import { embedSession, playNative } from "./mediaSession";
import { ProviderPlayer } from "./ProviderPlayer";
import { explainPlaybackFailure, insightForUrl } from "./sourceInsight";
import { useAssetResolver, useAssetSource } from "../../../lib/assetSource";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const playableUrl = (url: string | null | undefined) => {
  if (!url) return false;
  if (url.startsWith("blob:")) return true;
  try { return new URL(url).protocol === "https:"; } catch { return false; }
};
const formatTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--";
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

type TrackSource = MusicTrack["source"];
type EmbedSource = Extract<TrackSource, { kind: "providerEmbed" }>;
const RESOURCE_LABEL: Record<EmbedSource["resourceType"], string> = { track: "單曲", album: "專輯", playlist: "播放清單", video: "影片" };

/** The link the author typed, whichever source type it is stored under. */
const urlOfSource = (source: TrackSource): string => source.kind === "audioUrl" || source.kind === "externalLink" ? source.url : source.kind === "providerEmbed" ? source.originalUrl || source.canonicalUrl : "";
const openableUrl = (source: TrackSource): string | null => {
  const url = source.kind === "uploadedAudio" ? "" : source.kind === "providerEmbed" ? source.canonicalUrl : source.url;
  return url && url !== "https://" ? url : null;
};
const embedSourceFrom = (raw: string): EmbedSource | null => {
  const embed = insightForUrl(raw).embed;
  return embed ? { kind: "providerEmbed", provider: embed.provider, resourceType: embed.resourceType, resourceId: embed.resourceId, canonicalUrl: embed.canonicalUrl, originalUrl: raw.trim() } : null;
};
const kindBadge = (source: TrackSource) => {
  if (source.kind === "providerEmbed") return PLATFORM_LABELS[source.provider];
  if (source.kind === "externalLink") return "外部開啟";
  if (source.kind === "audioUrl" && insightForUrl(source.url).isPlatformPage) return "網頁連結（不能站內播放）";
  return "站內播放";
};

function orderedTracks(window: ModuleProps<"music">["window"]): MusicTrack[] {
  const byId = new Map(window.content.tracks.map((track) => [track.id, track]));
  const ordered = window.content.playlist.trackIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  return [...ordered, ...window.content.tracks.filter((track) => !window.content.playlist.trackIds.includes(track.id))];
}

export function MusicView({ window, ctx }: ModuleProps<"music">) {
  const tracks = useMemo(() => orderedTracks(window), [window]);
  const playback = useMusicPlayback();
  const activeForWindow = playback.windowId === window.id;
  const [selectedId, setSelectedId] = useState(() => tracks[0]?.id ?? "");
  const selected = tracks.find((track) => track.id === (activeForWindow ? playback.trackId : selectedId)) ?? tracks[0];
  const uploadedSource = selected?.source.kind === "uploadedAudio" ? selected.source.asset : null;
  const resolvedUploadedSource = useAssetSource(uploadedSource);
  const resolveAsset = useAssetResolver();
  const selectedInsight = selected?.source.kind === "audioUrl" ? insightForUrl(selected.source.url) : null;
  // A platform web page is never a playable audio file; offer the original link instead of a play button that cannot work.
  const nativeBlocked = !!selectedInsight?.isPlatformPage;
  const playbackUrl = selected?.source.kind === "audioUrl" && !nativeBlocked ? selected.source.url : selected?.source.kind === "uploadedAudio" ? resolvedUploadedSource : null;
  const sourceLink = selected ? openableUrl(selected.source) : null;

  useEffect(() => {
    if (activeForWindow && !tracks.some((track) => track.id === playback.trackId)) musicPlayback.stopWindow(window.id);
  }, [activeForWindow, playback.trackId, tracks, window.id]);

  if (!tracks.length) return <div className="music-empty"><span aria-hidden="true">♫</span><strong>播放清單是空的</strong><small>作者還沒有加入曲目。</small></div>;
  if (!selected) return <div className="music-empty"><strong>找不到可播放曲目</strong></div>;

  const index = tracks.findIndex((track) => track.id === selected.id);
  const isPlaying = activeForWindow && playback.trackId === selected.id && playback.status === "playing";
  const isLoading = activeForWindow && playback.trackId === selected.id && playback.status === "loading";
  const character = ctx.profileDirectory?.find((entry) => entry.id === selected.characterRef?.id);
  const failedTrackId = activeForWindow && playback.status === "error" ? playback.trackId : null;
  const failedTrack = tracks.find((track) => track.id === failedTrackId);
  const canOpenSelected = selected.source.kind === "externalLink" || nativeBlocked;

  // Choosing another track always silences the previous one; it never leaves a hidden player running.
  const stopCurrentFor = (next: MusicTrack) => {
    if (activeForWindow && playback.trackId !== next.id) musicPlayback.stopWindow(window.id);
    embedSession.dispose(window.id);
  };
  const chooseTrack = (next: MusicTrack) => {
    stopCurrentFor(next);
    setSelectedId(next.id);
  };
  const selectAndPlay = async (next: MusicTrack) => {
    stopCurrentFor(next);
    setSelectedId(next.id);
    if (next.source.kind === "audioUrl" && !insightForUrl(next.source.url).isPlatformPage && playableUrl(next.source.url)) void playNative(window.id, next.id, next.source.url);
    else if (next.source.kind === "uploadedAudio") {
      const source = resolveAsset ? await resolveAsset(next.source.asset) : next.source.asset;
      if (playableUrl(source)) void playNative(window.id, next.id, source!);
      else musicPlayback.stopWindow(window.id);
    } else musicPlayback.stopWindow(window.id);
  };
  const previous = () => void selectAndPlay(tracks[(index - 1 + tracks.length) % tracks.length]);
  const next = () => void selectAndPlay(tracks[(index + 1) % tracks.length]);
  const openOriginal = () => ctx.onLink({ target: "url", url: sourceLink ?? undefined, label: selected.title });

  return (
    <div className="music-player">
      <header className="music-now">
        <div className="music-cover w98-sunken">{selected.cover ? <SafeImg src={selected.cover} alt={`${selected.title || "曲目"}封面`} compact /> : <span aria-hidden="true">♫</span>}</div>
        <div className="music-meta">
          <small>{window.content.playlist.title || "播放清單"}</small>
          <strong>{selected.title || "未命名曲目"}</strong>
          <span>{selected.artist || "未填演出者"}</span>
          {character ? <button type="button" className="music-character" onClick={() => ctx.onProfileSelect?.(character.id)}>{character.profile.name || character.profile.username} 的主題曲</button> : null}
        </div>
      </header>

      {selected.source.kind === "providerEmbed" ? (
        <ProviderPlayer source={selected.source} title={selected.title} windowId={window.id} trackId={selected.id} onOpenOriginal={openOriginal} />
      ) : null}

      <div className="music-controls" role="group" aria-label="播放控制">
        <button type="button" className="w98-btn music-control" aria-label="上一首" onClick={previous}>|◀</button>
        {selected.source.kind === "providerEmbed" ? null : !canOpenSelected ? (
          <button
            type="button"
            className="w98-btn music-control music-play"
            disabled={!playableUrl(playbackUrl) || isLoading}
            aria-label={isPlaying ? "暫停" : "播放"}
            onClick={() => isPlaying ? musicPlayback.pause(window.id) : playbackUrl ? void playNative(window.id, selected.id, playbackUrl) : undefined}
          >{isLoading ? "…" : isPlaying ? "Ⅱ" : "▶"}</button>
        ) : (
          <button type="button" className="w98-btn music-open" onClick={openOriginal}>開啟原連結 ↗</button>
        )}
        <button type="button" className="w98-btn music-control" aria-label="下一首" onClick={next}>▶|</button>
      </div>

      {nativeBlocked && selectedInsight?.platformLabel ? <div role="note" className="music-notice">這首曲目的來源是 {selectedInsight.platformLabel} 的網頁連結，不是音訊檔，無法在站內直接播放。請用「開啟原連結」。</div> : null}

      {selected.source.kind !== "providerEmbed" ? (
        <div className="music-runtime">
          {activeForWindow && playback.trackId === selected.id && playback.canSeek && playback.duration !== null ? (
            <label className="music-progress"><span className="sr-only">播放進度</span><input type="range" min={0} max={playback.duration} step={1} value={Math.min(playback.currentTime, playback.duration)} onChange={(event) => musicPlayback.seek(window.id, Number(event.target.value))} /><small>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</small></label>
          ) : <small className="music-time">{activeForWindow && playback.trackId === selected.id ? formatTime(playback.currentTime) : "0:00"} / --:--</small>}
          <label className="music-volume"><span aria-hidden="true">🔊</span><span className="sr-only">音量</span><input aria-label="音量" type="range" min={0} max={1} step={0.05} value={playback.volume} onChange={(event) => musicPlayback.setVolume(Number(event.target.value))} /></label>
        </div>
      ) : null}

      {failedTrack ? (
        <div role="alert" className="music-error">
          <strong>「{failedTrack.title || "未命名曲目"}」無法播放</strong>
          <span>{explainPlaybackFailure(playback.url, playback.error)}</span>
          {openableUrl(failedTrack.source) ? <button type="button" className="w98-btn small" onClick={() => ctx.onLink({ target: "url", url: openableUrl(failedTrack.source) ?? undefined, label: failedTrack.title })}>開啟原網站 ↗</button> : null}
        </div>
      ) : null}
      {sourceLink && selected.source.kind !== "providerEmbed" && !nativeBlocked ? <button type="button" className="music-source-link" onClick={openOriginal}>來源／原連結 ↗</button> : null}

      <div className="music-track-list w98-sunken" role="list" aria-label="曲目清單">
        {tracks.map((track, trackIndex) => {
          const current = selected.id === track.id;
          const playing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
          const failed = failedTrackId === track.id;
          return (
            <button key={track.id} type="button" className={`music-track${current ? " selected" : ""}${failed ? " failed" : ""}`} aria-label={`選擇 ${track.title || "未命名曲目"}`} aria-current={current ? "true" : undefined} onClick={() => chooseTrack(track)}>
              <span>{playing ? "▶" : String(trackIndex + 1).padStart(2, "0")}</span>
              <span><strong>{track.title || "未命名曲目"}</strong><small>{track.artist || "未填演出者"} · {failed ? "⚠ 播放失敗" : kindBadge(track.source)}</small></span>
              <span aria-hidden="true">{track.source.kind === "externalLink" ? "↗" : "♫"}</span>
            </button>
          );
        })}
      </div>

      {selected.lyrics ? <details className="music-lyrics"><summary>歌詞／文字</summary><pre>{selected.lyrics}</pre></details> : null}
      {selected.rightsNote ? <small className="music-rights">權利說明：{selected.rightsNote}</small> : null}
    </div>
  );
}

function UploadedAudioPreview({ windowId, trackId, source, previewing, loading }: { windowId: string; trackId: string; source: string; previewing: boolean; loading: boolean }) {
  const resolved = useAssetSource(source);
  return <button type="button" className="w98-btn music-preview" disabled={!playableUrl(resolved) || loading} onClick={() => previewing ? musicPlayback.pause(windowId) : resolved ? void playNative(windowId, trackId, resolved) : undefined}>{previewing ? "Ⅱ 停止試聽" : resolved ? "▶ 試聽上傳檔" : "正在準備音訊…"}</button>;
}

type SourceTab = "upload" | "audioUrl" | "externalLink" | "embed";
const tabOf = (source: TrackSource): SourceTab => source.kind === "uploadedAudio" ? "upload" : source.kind === "providerEmbed" ? "embed" : source.kind;

export function MusicInlineEditor({ window, ctx, update }: ModuleProps<"music">) {
  const tracks = orderedTracks(window);
  const playback = useMusicPlayback();
  // The author's last typed link per track, so flipping source types never throws it away.
  const [lastUrls, setLastUrls] = useState<Record<string, string>>({});
  // Which source tab the author picked; the stored kind can lag behind while a link is not embeddable yet.
  const [tabs, setTabs] = useState<Record<string, SourceTab>>({});
  const [embedDrafts, setEmbedDrafts] = useState<Record<string, string>>({});
  const setTracks = (recipe: (tracks: MusicTrack[]) => MusicTrack[], key?: string) => update((current) => {
    const next = recipe(orderedTracks(current));
    return { ...current, content: { ...current.content, tracks: next, playlist: { ...current.content.playlist, trackIds: next.map((track) => track.id) } } };
  }, key);
  const patchTrack = (id: string, patch: Partial<MusicTrack>, key?: string) => setTracks((list) => list.map((track) => track.id === id ? { ...track, ...patch } : track), key);
  const stopPreviewForTrack = (id: string) => {
    if (playback.windowId === window.id && playback.trackId === id) musicPlayback.stopWindow(window.id);
    embedSession.dispose(window.id, id);
  };
  const patchTrackSource = (id: string, source: TrackSource, key?: string) => {
    stopPreviewForTrack(id);
    patchTrack(id, { source }, key);
  };
  const rememberUrl = (id: string, url: string) => { if (url.trim() && url.trim() !== "https://") setLastUrls((current) => ({ ...current, [id]: url })); };
  const carriedUrl = (track: MusicTrack) => {
    const own = urlOfSource(track.source);
    return own.trim() && own.trim() !== "https://" ? own : lastUrls[track.id] ?? "";
  };
  const chooseTab = (track: MusicTrack, tab: Exclude<SourceTab, "upload">) => {
    const carried = carriedUrl(track);
    rememberUrl(track.id, carried);
    setTabs((current) => ({ ...current, [track.id]: tab }));
    if (tab === "audioUrl") patchTrackSource(track.id, { kind: "audioUrl", url: carried || "https://" });
    else if (tab === "externalLink") patchTrackSource(track.id, { kind: "externalLink", url: carried || "https://" });
    else {
      // Embeddable: switch immediately. Otherwise keep the link as an external link and explain what to paste.
      const embed = embedSourceFrom(carried);
      setEmbedDrafts((current) => ({ ...current, [track.id]: carried }));
      patchTrackSource(track.id, embed ?? { kind: "externalLink", url: carried || "https://" });
    }
  };
  const addTrack = () => setTracks((list) => {
    const track: MusicTrack = { id: newId(), title: "新曲目", artist: "", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://" }, lyrics: "", rightsNote: "" };
    return [...list, track];
  });
  const removeTrack = (id: string) => {
    stopPreviewForTrack(id);
    setTracks((list) => list.filter((track) => track.id !== id));
  };
  const uploadCover = async (trackId: string, file: File) => {
    const stored = await ctx.upload?.(file, "image");
    if (stored) patchTrack(trackId, { cover: stored, coverUrl: "" });
  };
  const uploadAudio = async (trackId: string, file: File) => {
    stopPreviewForTrack(trackId);
    const stored = await ctx.upload?.(file, "audio");
    if (stored) {
      setTabs((current) => ({ ...current, [trackId]: "upload" }));
      patchTrackSource(trackId, { kind: "uploadedAudio", asset: stored });
    }
  };
  const openLink = (url: string | null, label: string) => { if (url) ctx.onLink({ target: "url", url, label }); };

  return (
    <div className="music-editor">
      <div className="music-editor-head">
        <label><span className="w98-hint">播放清單名稱</span><input className="w98-input" value={window.content.playlist.title} onChange={(event) => update((current) => ({ ...current, content: { ...current.content, playlist: { ...current.content.playlist, title: event.target.value } } }), `music-playlist-${window.id}`)} /></label>
        <button type="button" className="w98-btn primary" onClick={addTrack}>＋ 新增曲目</button>
      </div>
      <p className="w98-hint">可上傳你原創或已獲授權的 MP3／Ogg／WAV（單首 16 MB、每站 100 MB）。Spotify 單曲／專輯／播放清單與 YouTube 影片可選「平台播放器」，訪客按下載入後使用平台官方播放器；其他平台請選「外部連結」。系統不會下載或轉存平台音訊。</p>
      {!tracks.length ? <div className="music-editor-empty"><strong>還沒有曲目</strong><span>先新增一首，再填入你有權使用的音訊或作品連結。</span><button type="button" className="w98-btn" onClick={addTrack}>新增第一首</button></div> : null}
      {tracks.map((track, index) => {
        const tab = tabs[track.id] ?? tabOf(track.source);
        const previewing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
        const failed = playback.windowId === window.id && playback.trackId === track.id && playback.status === "error";
        const sourceUrl = urlOfSource(track.source);
        const insight = insightForUrl(tab === "embed" ? embedDrafts[track.id] ?? sourceUrl : sourceUrl);
        const directUrl = track.source.kind === "audioUrl" ? track.source.url : null;
        const platformBlocked = track.source.kind === "audioUrl" && insight.isPlatformPage;
        const embedSource = track.source.kind === "providerEmbed" ? track.source : null;
        const original = openableUrl(track.source);
        return (
          <fieldset key={track.id} className="w98-fieldset music-track-editor">
            <legend>{index + 1}. {track.title || "未命名曲目"}</legend>
            <div className="music-editor-tools">
              <MiniBtn label="往前" disabled={index === 0} onClick={() => setTracks((list) => moveById(list, track.id, -1))}>▲</MiniBtn>
              <MiniBtn label="往後" disabled={index === tracks.length - 1} onClick={() => setTracks((list) => moveById(list, track.id, 1))}>▼</MiniBtn>
              <button type="button" className="mini-btn danger" onClick={() => removeTrack(track.id)}>刪除</button>
            </div>
            <div className="music-editor-grid">
              <label><span>曲名</span><input className="w98-input" value={track.title} onChange={(event) => patchTrack(track.id, { title: event.target.value }, `music-title-${track.id}`)} /></label>
              <label><span>演出者</span><input className="w98-input" value={track.artist} onChange={(event) => patchTrack(track.id, { artist: event.target.value }, `music-artist-${track.id}`)} /></label>
            </div>
            <div className="music-cover-editor">
              <div className="music-cover small w98-sunken">{track.cover ? <SafeImg src={track.cover} alt="" compact /> : <span aria-hidden="true">♫</span>}</div>
              <div><FilePick className="w98-btn small" onFiles={(files) => void uploadCover(track.id, files[0])}>上傳封面…</FilePick><ImageUrlField raw={track.coverUrl} label="封面圖片網址" placeholder="https://…" onCommit={(raw, cover) => patchTrack(track.id, { coverUrl: raw, cover })} /></div>
            </div>

            <div className="seg music-source-tabs" role="group" aria-label="來源類型">
              <FilePick className={`w98-btn grow${tab === "upload" ? " on" : ""}`} accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" onFiles={(files) => void uploadAudio(track.id, files[0])}>上傳音訊</FilePick>
              <button type="button" className={`w98-btn grow${tab === "audioUrl" ? " on" : ""}`} aria-pressed={tab === "audioUrl"} onClick={() => chooseTab(track, "audioUrl")}>HTTPS 音訊</button>
              <button type="button" className={`w98-btn grow${tab === "externalLink" ? " on" : ""}`} aria-pressed={tab === "externalLink"} onClick={() => chooseTab(track, "externalLink")}>外部連結</button>
              <button type="button" className={`w98-btn grow${tab === "embed" ? " on" : ""}`} aria-pressed={tab === "embed"} onClick={() => chooseTab(track, "embed")}>平台播放器</button>
            </div>
            <p className="w98-hint music-source-explain">
              {tab === "upload" ? "站內播放：上傳你有權使用的音訊檔。" : tab === "audioUrl" ? "站內播放：貼上音訊檔本身的 HTTPS 網址（.mp3／.ogg／.wav），不是 YouTube、Spotify 等網頁。" : tab === "externalLink" ? "外部開啟：訪客點「開啟原連結」到原網站，不會在站內播放。" : "平台播放器：訪客按下載入後，在 Retro 內使用 Spotify／YouTube 官方播放器。"}
            </p>

            {tab === "upload"
              ? track.source.kind === "uploadedAudio"
                ? <div className="music-upload-source"><FilePick className="w98-btn" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" onFiles={(files) => void uploadAudio(track.id, files[0])}>更換音訊檔…</FilePick><span className="w98-hint">檔案會保存在私有草稿；發布時才建立公開版本。</span></div>
                : <span className="w98-hint">選擇檔案後會在這裡顯示上傳結果。</span>
              : null}

            {tab === "audioUrl" || tab === "externalLink" ? (
              <label>
                <span>{tab === "audioUrl" ? "音訊直連（HTTPS）" : "平台／作品頁連結"}</span>
                <input
                  className="w98-input"
                  value={track.source.kind === "audioUrl" || track.source.kind === "externalLink" ? track.source.url : ""}
                  onChange={(event) => { rememberUrl(track.id, event.target.value); patchTrackSource(track.id, tab === "audioUrl" ? { kind: "audioUrl", url: event.target.value } : { kind: "externalLink", url: event.target.value }, `music-source-${track.id}`); }}
                />
              </label>
            ) : null}

            {tab === "embed" ? (
              <label>
                <span>Spotify / YouTube 網址</span>
                <input
                  className="w98-input"
                  value={embedDrafts[track.id] ?? sourceUrl}
                  placeholder="https://open.spotify.com/track/… 或 https://www.youtube.com/watch?v=…"
                  onChange={(event) => {
                    const raw = event.target.value;
                    setEmbedDrafts((current) => ({ ...current, [track.id]: raw }));
                    rememberUrl(track.id, raw);
                    const embed = embedSourceFrom(raw);
                    if (embed) patchTrackSource(track.id, embed, `music-source-${track.id}`);
                    else if (/^https?:\/\/\S*$/i.test(raw.trim()) || !raw.trim()) patchTrackSource(track.id, { kind: "externalLink", url: raw.trim() || "https://" }, `music-source-${track.id}`);
                  }}
                />
              </label>
            ) : null}

            {platformBlocked && insight.platformLabel ? (
              <div role="note" className="music-notice">
                <strong>這是 {insight.platformLabel} 的網頁連結，不是音訊檔，無法在站內直接播放。</strong>
                <span>{insight.embed ? `可以改成 ${insight.platformLabel} 平台播放器，或保留為外部連結。你貼的網址會原樣保留。` : insight.embedProblem}</span>
                <div className="music-notice-actions">
                  {insight.embed ? <button type="button" className="w98-btn small primary" onClick={() => chooseTab(track, "embed")}>改成 {insight.platformLabel} 平台播放器</button> : null}
                  <button type="button" className="w98-btn small" onClick={() => chooseTab(track, "externalLink")}>改成外部連結</button>
                </div>
              </div>
            ) : null}
            {tab === "audioUrl" && !platformBlocked && track.source.kind === "audioUrl" && insight.looksLikeAudioFile === false && sourceUrl.trim() && sourceUrl.trim() !== "https://" ? <p className="w98-hint">這個網址看起來不是音訊檔（.mp3／.ogg／.wav）。如果是網頁或平台連結，請改用「外部連結」。</p> : null}
            {tab === "externalLink" && insight.embed ? (
              <div role="note" className="music-notice soft">
                <span>這是 {insight.platformLabel} 的{RESOURCE_LABEL[insight.embed.resourceType]}，可以讓訪客在 Retro 內載入官方播放器（需要訪客按下載入）。</span>
                <div className="music-notice-actions"><button type="button" className="w98-btn small" onClick={() => chooseTab(track, "embed")}>改為平台播放器</button></div>
              </div>
            ) : null}
            {tab === "externalLink" && insight.platform && !insight.embed && insight.embedProblem ? <p className="w98-hint">{insight.embedProblem}</p> : null}
            {tab === "embed" && !embedSource && insight.platform ? <p role="status" className="w98-hint">{insight.embedProblem ?? "請貼上 Spotify 單曲／專輯／播放清單或 YouTube 影片網址。"}目前先以外部連結儲存。</p> : null}
            {tab === "embed" && !embedSource && !insight.platform && (embedDrafts[track.id] ?? sourceUrl).trim() && (embedDrafts[track.id] ?? sourceUrl).trim() !== "https://" ? <p role="status" className="w98-hint">目前支援 Spotify 與 YouTube 的網址；其他網站請改用「外部連結」。目前先以外部連結儲存。</p> : null}

            {embedSource ? (
              <>
                <p className="w98-hint music-embed-summary">已辨識：{PLATFORM_LABELS[embedSource.provider]} {RESOURCE_LABEL[embedSource.resourceType]}（{embedSource.resourceId}）。原網址已保留。</p>
                <ProviderPlayer source={embedSource} title={track.title} windowId={window.id} trackId={track.id} onOpenOriginal={() => openLink(original, track.title)} />
                <button type="button" className="w98-btn small" style={{ alignSelf: "flex-start" }} onClick={() => chooseTab(track, "externalLink")}>改為外部連結（保留網址）</button>
              </>
            ) : null}

            {track.source.kind === "audioUrl" ? <button type="button" className="w98-btn music-preview" disabled={!playableUrl(directUrl) || platformBlocked || playback.status === "loading" && playback.trackId === track.id} onClick={() => previewing ? musicPlayback.pause(window.id) : directUrl ? void playNative(window.id, track.id, directUrl) : undefined}>{previewing ? "Ⅱ 停止試聽" : "▶ 試聽"}</button> : track.source.kind === "uploadedAudio" ? <UploadedAudioPreview windowId={window.id} trackId={track.id} source={track.source.asset} previewing={previewing} loading={playback.status === "loading" && playback.trackId === track.id} /> : track.source.kind === "externalLink" ? <span className="w98-hint">訪客會看到「開啟原連結」，不會假裝能在站內播放。</span> : null}
            {failed ? (
              <div role="alert" className="music-error">
                <strong>這首曲目無法播放</strong>
                <span>{explainPlaybackFailure(playback.url, playback.error)}</span>
                {original ? <button type="button" className="w98-btn small" onClick={() => openLink(original, track.title)}>開啟原網站 ↗</button> : null}
              </div>
            ) : null}

            <label><span>角色主題曲（選填）</span><select className="w98-input" value={track.characterRef?.id ?? ""} onChange={(event) => patchTrack(track.id, { characterRef: event.target.value && ctx.siteId ? { kind: "profile", siteId: ctx.siteId, id: event.target.value } : undefined })}><option value="">不指定角色</option>{ctx.profiles?.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name ?? profile.handle ?? profile.username}</option>)}</select></label>
            <label><span>權利說明{track.source.kind === "uploadedAudio" ? "（發布必填）" : ""}</span><input className="w98-input" value={track.rightsNote} placeholder="例：本人原創／已獲作者授權" aria-required={track.source.kind === "uploadedAudio"} onChange={(event) => patchTrack(track.id, { rightsNote: event.target.value }, `music-rights-${track.id}`)} /></label>
            <label><span>歌詞／文字（選填）</span><textarea className="w98-textarea" rows={4} value={track.lyrics} onChange={(event) => patchTrack(track.id, { lyrics: event.target.value }, `music-lyrics-${track.id}`)} /></label>
          </fieldset>
        );
      })}
    </div>
  );
}
