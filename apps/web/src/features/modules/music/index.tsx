import { useEffect, useMemo, useRef, useState } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { PLATFORM_LABELS, type MusicTrack } from "@retrodesk/shared";
import { FilePick, MiniBtn, SafeImg } from "../ui";
import { moveById, type ModuleProps } from "../types";
import { musicPlayback, useMusicPlayback } from "./audioCoordinator";
import { embedSession, playNative, playResolvedNative, useStopMediaOnResize } from "./mediaSession";
import { VideoPlayer } from "./VideoPlayer";
import { isVideoFileUrl } from "./sourceClassifier";
import { ProviderPlayer } from "./ProviderPlayer";
import { TrackSourceField, type SourceDraftCache } from "./TrackSourceField";
import { explainPlaybackFailure, insightForUrl } from "./sourceInsight";
import { useAssetResolver, useAssetSource, useAssetSourceState } from "../../../lib/assetSource";

import { UploadTaskList, useMediaQueue } from "../../media/editorMedia";
import { didMediaHistoryChange, enqueueWindowUpload } from "../../media/windowMediaSession";
import { useEditorStore } from "../../editor/store";
import { musicUploadOptions, musicUploadScope, type MusicUploadField } from "./musicUploads";
import { MusicCoverUrlField, type CoverDraftCache } from "./MusicCoverUrlField";
import "./musicEditor.css";

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
const resourceLabel = (): Record<EmbedSource["resourceType"], string> => ({ track: i18n.t("music:music.track"), album: i18n.t("music:music.album"), playlist: i18n.t("music:music.playlist"), video: i18n.t("music:music.video") });

/** The link the author typed, whichever source type it is stored under. */
const urlOfSource = (source: TrackSource): string => source.kind === "audioUrl" || source.kind === "externalLink" ? source.url : source.kind === "providerEmbed" ? source.originalUrl || source.canonicalUrl : "";
const openableUrl = (source: TrackSource): string | null => {
  const url = source.kind === "uploadedAudio" ? "" : source.kind === "providerEmbed" ? source.canonicalUrl : source.url;
  return url && url !== "https://" ? url : null;
};
const kindBadge = (source: TrackSource) => {
  if (source.kind === "providerEmbed") return PLATFORM_LABELS[source.provider];
  if (source.kind === "externalLink") return i18n.t("music:music.opensExternally");
  if (source.kind === "audioUrl" && insightForUrl(source.url).isPlatformPage) return i18n.t("music:music.webLinkCantPlayHere");
  return i18n.t("music:music.playsHere");
};

function orderedTracks(window: ModuleProps<"music">["window"]): MusicTrack[] {
  const byId = new Map(window.content.tracks.map((track) => [track.id, track]));
  const ordered = window.content.playlist.trackIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  return [...ordered, ...window.content.tracks.filter((track) => !window.content.playlist.trackIds.includes(track.id))];
}

export function MusicView({ window, ctx }: ModuleProps<"music">) {
  const { t: tr } = useTranslation("music");
  useStopMediaOnResize(window.id);
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
  const selectedVideo = selected?.source.kind === "audioUrl" && isVideoFileUrl(selected.source.url);

  useEffect(() => {
    if (activeForWindow && !tracks.some((track) => track.id === playback.trackId)) musicPlayback.stopWindow(window.id);
  }, [activeForWindow, playback.trackId, tracks, window.id]);

  if (!tracks.length) return <div className="music-empty"><span aria-hidden="true">♫</span><strong>{tr("music.thePlaylistIsEmpty")}</strong><small>{tr("music.theAuthorHasntAddedAny")}</small></div>;
  if (!selected) return <div className="music-empty"><strong>{tr("music.noPlayableTracksFound")}</strong></div>;

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
    if (next.source.kind === "audioUrl" && !insightForUrl(next.source.url).isPlatformPage && !isVideoFileUrl(next.source.url) && playableUrl(next.source.url)) void playNative(window.id, next.id, next.source.url);
    else if (next.source.kind === "uploadedAudio") {
      const asset = next.source.asset;
      void playResolvedNative(window.id, next.id, async () => resolveAsset ? resolveAsset(asset) : asset);
    } else musicPlayback.stopWindow(window.id);
  };
  const previous = () => void selectAndPlay(tracks[(index - 1 + tracks.length) % tracks.length]);
  const next = () => void selectAndPlay(tracks[(index + 1) % tracks.length]);
  const openOriginal = () => ctx.onLink({ target: "url", url: sourceLink ?? undefined, label: selected.title });

  return (
    <div className="music-player">
      <header className="music-now">
        <div className="music-cover w98-sunken">{selected.cover ? <SafeImg src={selected.cover} alt={tr("music.coverAlt", { title: selected.title || tr("music.trackFallback") })} compact /> : <span aria-hidden="true">♫</span>}</div>
        <div className="music-meta">
          <small>{window.content.playlist.title || tr("music.playlist")}</small>
          <strong>{selected.title || tr("music.untitledTrack")}</strong>
          <span>{selected.artist || tr("music.noArtist")}</span>
          {character ? <button type="button" className="music-character" onClick={() => ctx.onProfileSelect?.(character.id)}>{tr("music.themeOf", { name: character.profile.name || character.profile.username })}</button> : null}
        </div>
      </header>

      {selected.source.kind === "providerEmbed" ? (
        <ProviderPlayer source={selected.source} title={selected.title} windowId={window.id} trackId={selected.id} onOpenOriginal={openOriginal} />
      ) : null}

      {selectedVideo && selected.source.kind === "audioUrl" ? <VideoPlayer key={`${selected.id}-${selected.source.url}`} url={selected.source.url} title={selected.title} windowId={window.id} trackId={selected.id} onOpenOriginal={openOriginal} /> : null}

      <div className="music-controls" role="group" aria-label={tr("music.playbackControls")}>
        <button type="button" className="w98-btn music-control" aria-label={tr("music.previous")} onClick={previous}>|◀</button>
        {selected.source.kind === "providerEmbed" || selectedVideo ? null : !canOpenSelected ? (
          <button
            type="button"
            className="w98-btn music-control music-play"
            disabled={!playableUrl(playbackUrl) || isLoading}
            aria-label={isPlaying ? tr("music.pause") : tr("music.play")}
            onClick={() => isPlaying ? musicPlayback.pause(window.id) : playbackUrl ? void playNative(window.id, selected.id, playbackUrl) : undefined}
          >{isLoading ? "…" : isPlaying ? "Ⅱ" : "▶"}</button>
        ) : (
          <button type="button" className="w98-btn music-open" onClick={openOriginal}>{tr("music.openOriginalLink")}</button>
        )}
        <button type="button" className="w98-btn music-control" aria-label={tr("music.next")} onClick={next}>▶|</button>
      </div>

      {nativeBlocked && selectedInsight?.platformLabel ? <div role="note" className="music-notice">{tr("music.webLinkNote", { platform: selectedInsight.platformLabel })}</div> : null}

      {selected.source.kind !== "providerEmbed" && !selectedVideo ? (
        <div className="music-runtime">
          {activeForWindow && playback.trackId === selected.id && playback.canSeek && playback.duration !== null ? (
            <label className="music-progress"><span className="sr-only">{tr("music.playbackProgress")}</span><input type="range" min={0} max={playback.duration} step={1} value={Math.min(playback.currentTime, playback.duration)} onChange={(event) => musicPlayback.seek(window.id, Number(event.target.value))} /><small>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</small></label>
          ) : <small className="music-time">{activeForWindow && playback.trackId === selected.id ? formatTime(playback.currentTime) : "0:00"} / --:--</small>}
          <label className="music-volume"><span aria-hidden="true">🔊</span><span className="sr-only">{tr("music.volume")}</span><input aria-label={tr("music.volume")} type="range" min={0} max={1} step={0.05} value={playback.volume} onChange={(event) => musicPlayback.setVolume(Number(event.target.value))} /></label>
        </div>
      ) : null}

      {failedTrack && !selectedVideo ? (
        <div role="alert" className="music-error">
          <strong>{tr("music.cannotPlay", { title: failedTrack.title || tr("music.untitledTrackLabel") })}</strong>
          <span>{explainPlaybackFailure(playback.url, playback.error)}</span>
          {openableUrl(failedTrack.source) ? <button type="button" className="w98-btn small" onClick={() => ctx.onLink({ target: "url", url: openableUrl(failedTrack.source) ?? undefined, label: failedTrack.title })}>{tr("music.openOriginalSite")}</button> : null}
        </div>
      ) : null}
      {sourceLink && selected.source.kind !== "providerEmbed" && !nativeBlocked ? <button type="button" className="music-source-link" onClick={openOriginal}>{tr("music.sourceOriginalLink")}</button> : null}

      <div className="music-track-list w98-sunken" role="list" aria-label={tr("music.trackList")}>
        {tracks.map((track, trackIndex) => {
          const current = selected.id === track.id;
          const playing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
          const failed = failedTrackId === track.id;
          return (
            <button key={track.id} type="button" className={`music-track${current ? " selected" : ""}${failed ? " failed" : ""}`} aria-label={tr("music.selectTrack", { title: track.title || tr("music.untitledTrackLabel") })} aria-current={current ? "true" : undefined} onClick={() => chooseTrack(track)}>
              <span>{playing ? "▶" : String(trackIndex + 1).padStart(2, "0")}</span>
              <span><strong>{track.title || tr("music.untitledTrack")}</strong><small>{track.artist || tr("music.noArtist")} · {failed ? tr("music.playbackFailed") : kindBadge(track.source)}</small></span>
              <span aria-hidden="true">{track.source.kind === "externalLink" ? "↗" : "♫"}</span>
            </button>
          );
        })}
      </div>

      {selected.lyrics ? <details className="music-lyrics"><summary>{tr("music.lyricsText")}</summary><pre>{selected.lyrics}</pre></details> : null}
      {selected.rightsNote ? <small className="music-rights">{tr("music.rightsPrefix")}{selected.rightsNote}</small> : null}
    </div>
  );
}

type UploadedPreviewProps = { windowId: string; trackId: string; source: string; previewing: boolean; loading: boolean };
function UploadedAudioPreview(props: UploadedPreviewProps) {
  const [attempt, setAttempt] = useState(0);
  return <UploadedAudioPreviewAttempt key={`${props.source}:${attempt}`} {...props} retry={() => setAttempt((value) => value + 1)} />;
}
function UploadedAudioPreviewAttempt({ windowId, trackId, source, previewing, loading, retry }: UploadedPreviewProps & { retry: () => void }) {
  const { t: tr } = useTranslation("music");
  const resolved = useAssetSourceState(source);
  if (resolved.status === "failed") return <div role="alert" className="music-error"><span>{tr("authoring.prepareFailed")}</span><button type="button" className="w98-btn" onClick={retry}>{tr("authoring.retryPrepare")}</button></div>;
  return <button type="button" className="w98-btn music-preview" disabled={!playableUrl(resolved.source) || loading} onClick={() => previewing ? musicPlayback.pause(windowId) : resolved.source ? void playNative(windowId, trackId, resolved.source) : undefined}>{previewing ? tr("music.stopPreview") : resolved.source ? tr("music.previewUploadedFile") : tr("music.preparingAudio")}</button>;
}

export function MusicInlineEditor({ window, ctx, update }: ModuleProps<"music">) {
  const { t: tr } = useTranslation("music");
  useStopMediaOnResize(window.id);
  const tracks = orderedTracks(window);
  const [selection, setSelection] = useState({ windowId: window.id, trackId: tracks[0]?.id });
  const selected = tracks.find((track) => selection.windowId === window.id && track.id === selection.trackId) ?? tracks[0];
  const sourceDrafts = useRef<SourceDraftCache>(new Map());
  const coverDrafts = useRef<CoverDraftCache>(new Map());
  const [draftEpoch, setDraftEpoch] = useState(0);
  useEffect(() => useEditorStore.subscribe((state, previous) => {
    if (state.siteId !== previous.siteId || didMediaHistoryChange(state, previous)) {
      sourceDrafts.current.clear();
      coverDrafts.current.clear();
      setDraftEpoch((epoch) => epoch + 1);
    }
  }), []);
  const { queue, tasks } = useMediaQueue();
  const trackTasks = (id: string) => tasks.filter((task) => task.scope === musicUploadScope(window.id, id));
  const orphanTasks = tasks.filter((task) => task.scope.startsWith(`window:${window.id}:music:`) && !tracks.some((track) => task.scope === musicUploadScope(window.id, track.id)));
  const cancelUpload = (id: string, field: MusicUploadField) => queue?.invalidate(tr("authoring.sourceChanged"), (entry) => entry.options.scope === musicUploadScope(window.id, id) && entry.options.slot === field);
  const taskList = (id: string) => <UploadTaskList tasks={trackTasks(id)} onRetry={(taskId) => queue?.retry(taskId)} onDismiss={(taskId) => queue?.dismiss(taskId)} />;
  const playback = useMusicPlayback();
  const setTracks = (recipe: (tracks: MusicTrack[]) => MusicTrack[], key?: string) => update((current) => {
    const next = recipe(orderedTracks(current));
    return { ...current, content: { ...current.content, tracks: next, playlist: { ...current.content.playlist, trackIds: next.map((track) => track.id) } } };
  }, key);
  const patchTrack = (id: string, patch: Partial<MusicTrack>, key?: string) => setTracks((list) => list.map((track) => track.id === id ? { ...track, ...patch } : track), key);
  const stopPreviewForTrack = (id: string) => {
    const currentPlayback = musicPlayback.getSnapshot();
    if (currentPlayback.windowId === window.id && currentPlayback.trackId === id) musicPlayback.stopWindow(window.id);
    embedSession.dispose(window.id, id);
  };
  const patchTrackSource = (id: string, source: TrackSource, key?: string) => {
    stopPreviewForTrack(id);
    patchTrack(id, { source }, key);
  };
  const chooseTrack = (id: string) => {
    if (selected && selected.id !== id) stopPreviewForTrack(selected.id);
    setSelection({ windowId: window.id, trackId: id });
  };
  const addTrack = () => {
    const track: MusicTrack = { id: newId(), title: tr("music.newTrack"), artist: "", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://" }, lyrics: "", rightsNote: "" };
    setTracks((list) => [...list, track]);
    chooseTrack(track.id);
  };
  const removeTrack = (id: string) => {
    stopPreviewForTrack(id);
    const index = tracks.findIndex((track) => track.id === id);
    const next = tracks[index + 1] ?? tracks[index - 1];
    setTracks((list) => list.filter((track) => track.id !== id));
    if (next) chooseTrack(next.id);
  };
  const upload = (track: MusicTrack, file: File, field: MusicUploadField) => {
    if (!queue || !ctx.siteId || !ctx.upload || !ctx.editing) return;
    if (field === "audio") stopPreviewForTrack(track.id);
    const options = musicUploadOptions(track, field);
    enqueueWindowUpload(queue, useEditorStore, {
      siteId: ctx.siteId, windowId: window.id, windowType: "music", scope: musicUploadScope(window.id, track.id),
    }, file, ctx.upload, { ...options, apply: (current, stored) => {
      if (field === "audio") stopPreviewForTrack(track.id);
      return options.apply(current, stored);
    } });
  };
  const openLink = (url: string | null, label: string) => { if (url) ctx.onLink({ target: "url", url, label }); };

  return (
    <div className="music-editor">
      <div className="music-editor-head">
        <label><span className="w98-hint">{tr("music.playlistName")}</span><input className="w98-input" value={window.content.playlist.title} onChange={(event) => update((current) => ({ ...current, content: { ...current.content, playlist: { ...current.content.playlist, title: event.target.value } } }), `music-playlist-${window.id}`)} /></label>
        <button type="button" className="w98-btn primary" onClick={addTrack}>{tr("music.addTrack")}</button>
      </div>
      <p className="w98-hint">{tr("music.uploadMp3OggWavFiles")}</p>
      {!tracks.length ? <div className="music-editor-empty"><strong>{tr("music.noTracksYet")}</strong><span>{tr("music.addOneFirstThenEnter")}</span><button type="button" className="w98-btn" onClick={addTrack}>{tr("music.addTheFirstTrack")}</button></div> : null}
      <div className="music-authoring-list" role="group" aria-label={tr("authoring.trackList")}>
        {tracks.map((track, index) => {
          const ownTasks = trackTasks(track.id);
          const count = (status: string) => ownTasks.filter((task) => task.status === status).length;
          return <button key={track.id} type="button" className="w98-btn music-authoring-track" aria-pressed={selected?.id === track.id} aria-label={tr("music.selectTrack", { title: track.title || tr("music.untitledTrackLabel") })} onClick={() => chooseTrack(track.id)}>
            <span>{index + 1}.</span><span><strong>{track.title || tr("music.untitledTrack")}</strong><small>{track.artist || tr("music.noArtist")} · {kindBadge(track.source)}</small>
              {ownTasks.length ? <small>{tr("authoring.uploadSummary", { queued: count("queued"), uploading: count("uploading"), completed: count("completed"), failed: count("failed") })}</small> : null}
            </span>
          </button>;
        })}
      </div>
      {orphanTasks.length ? <div className="music-orphan-tasks"><p>{tr("authoring.removedTrackUploads")}</p><UploadTaskList tasks={orphanTasks} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)} /></div> : null}
      {selected ? [selected].map((track) => {
        const index = tracks.findIndex((item) => item.id === track.id);

        const previewing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
        const failed = playback.windowId === window.id && playback.trackId === track.id && playback.status === "error";
        const sourceUrl = urlOfSource(track.source);
        const insight = insightForUrl(sourceUrl);
        const directUrl = track.source.kind === "audioUrl" ? track.source.url : null;
        const platformBlocked = track.source.kind === "audioUrl" && insight.isPlatformPage;
        const original = openableUrl(track.source);
        return (
          <fieldset key={`${window.id}:${track.id}:${draftEpoch}`} className="w98-fieldset music-track-editor">
            <legend>{index + 1}. {track.title || tr("music.untitledTrack")}</legend>
            {taskList(track.id)}
            <div className="music-editor-tools">
              <MiniBtn label={tr("music.moveUp")} disabled={index === 0} onClick={() => setTracks((list) => moveById(list, track.id, -1))}>▲</MiniBtn>
              <MiniBtn label={tr("music.moveDown")} disabled={index === tracks.length - 1} onClick={() => setTracks((list) => moveById(list, track.id, 1))}>▼</MiniBtn>
              <button type="button" className="mini-btn danger" onClick={() => removeTrack(track.id)}>{tr("music.delete")}</button>
            </div>
            <div className="music-editor-grid">
              <label><span>{tr("music.trackTitle")}</span><input className="w98-input" value={track.title} onChange={(event) => patchTrack(track.id, { title: event.target.value }, `music-title-${track.id}`)} /></label>
              <label><span>{tr("music.artist")}</span><input className="w98-input" value={track.artist} onChange={(event) => patchTrack(track.id, { artist: event.target.value }, `music-artist-${track.id}`)} /></label>
            </div>
            <div className="music-cover-editor">
              <div className="music-cover small w98-sunken">{track.cover ? <SafeImg src={track.cover} alt="" compact /> : <span aria-hidden="true">♫</span>}</div>
              <div><FilePick className="w98-btn small" onFiles={(files) => files[0] && upload(track, files[0], "cover")}>{tr("music.uploadCover")}</FilePick><MusicCoverUrlField draftKey={`${window.id}:${track.id}`} drafts={coverDrafts.current} onEdit={() => cancelUpload(track.id, "cover")} raw={track.coverUrl} label={tr("music.coverImageUrl")} placeholder="https://…" onCommit={(raw, cover) => patchTrack(track.id, { coverUrl: raw, cover })} /></div>
            </div>

            <TrackSourceField
              draftCache={sourceDrafts.current}
              onEdit={() => cancelUpload(track.id, "audio")}
              track={track}
              windowId={window.id}
              patchSource={(source, key) => patchTrackSource(track.id, source, key)}
              uploadAudio={(file) => upload(track, file, "audio")}
              onOpenOriginal={() => openLink(original, track.title)}
              resourceName={(type) => resourceLabel()[type]}
            />

            {track.source.kind === "audioUrl" && isVideoFileUrl(track.source.url) ? <VideoPlayer key={track.source.url} url={track.source.url} title={track.title} windowId={window.id} trackId={track.id} onOpenOriginal={() => openLink(original, track.title)} /> : track.source.kind === "audioUrl" ? <button type="button" className="w98-btn music-preview" disabled={!playableUrl(directUrl) || platformBlocked || playback.status === "loading" && playback.trackId === track.id} onClick={() => previewing ? musicPlayback.pause(window.id) : directUrl ? void playNative(window.id, track.id, directUrl) : undefined}>{previewing ? tr("music.stopPreview") : tr("music.preview")}</button> : track.source.kind === "uploadedAudio" ? <UploadedAudioPreview windowId={window.id} trackId={track.id} source={track.source.asset} previewing={previewing} loading={playback.status === "loading" && playback.trackId === track.id} /> : track.source.kind === "externalLink" ? <span className="w98-hint">{tr("music.visitorsWillSeeOpenOriginal")}</span> : null}
            {failed && !(track.source.kind === "audioUrl" && isVideoFileUrl(track.source.url)) ? (
              <div role="alert" className="music-error">
                <strong>{tr("music.thisTrackCantBePlayed")}</strong>
                <span>{explainPlaybackFailure(playback.url, playback.error)}</span>
                {original ? <button type="button" className="w98-btn small" onClick={() => openLink(original, track.title)}>{tr("music.openOriginalSite")}</button> : null}
              </div>
            ) : null}

            <label><span>{tr("music.characterThemeSongOptional")}</span><select className="w98-input" value={track.characterRef?.id ?? ""} onChange={(event) => patchTrack(track.id, { characterRef: event.target.value && ctx.siteId ? { kind: "profile", siteId: ctx.siteId, id: event.target.value } : undefined })}><option value="">{tr("music.noCharacter")}</option>{ctx.profiles?.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name ?? profile.handle ?? profile.username}</option>)}</select></label>
            <label><span>{tr("music.rightsLabel")}{track.source.kind === "uploadedAudio" ? tr("music.requiredToPublish") : ""}</span><input className="w98-input" value={track.rightsNote} placeholder={tr("music.eGMyOwnOriginal")} aria-required={track.source.kind === "uploadedAudio"} onChange={(event) => patchTrack(track.id, { rightsNote: event.target.value }, `music-rights-${track.id}`)} /></label>
            <label><span>{tr("music.lyricsTextOptional")}</span><textarea className="w98-textarea" rows={4} value={track.lyrics} onChange={(event) => patchTrack(track.id, { lyrics: event.target.value }, `music-lyrics-${track.id}`)} /></label>
          </fieldset>
        );
      }) : null}
    </div>
  );
}
