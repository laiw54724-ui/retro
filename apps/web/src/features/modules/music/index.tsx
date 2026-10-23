import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { PLATFORM_LABELS, type MusicTrack } from "@retrodesk/shared";
import { FileUploadButton, FallbackImage } from "../ui";
import { type ModuleProps } from "../types";
import { musicPlayback, useMusicPlayback } from "./audioCoordinator";
import { embedSession, playNative, playResolvedNative, useStopMediaOnResize } from "./mediaSession";
import { VideoPlayer } from "./VideoPlayer";
import { classifyPastedUrl, isVideoFileUrl } from "./sourceClassifier";
import { ProviderPlayer } from "./ProviderPlayer";
import { TrackSourceInput, type SourceDraftCache } from "./TrackSourceField";
import { explainPlaybackFailure, insightForUrl } from "./sourceInsight";
import { useAssetResolver, useAssetSource, useAssetSourceState } from "../../../lib/assetSource";

import { UploadProgressList, useMediaQueue } from "../../media/editorMedia";
import { didMediaHistoryChange, enqueueWindowUpload } from "../../media/windowMediaSession";
import { useEditorStore } from "../../editor/store";
import { musicUploadOptions, musicUploadScope, type MusicUploadField } from "./musicUploads";
import { MusicCoverUrlField, type CoverDraftCache } from "./MusicCoverUrlField";
import { DestinationChip, EditorStatusBar, FileDropZone, InlineErrorBanner, InlineTextArea, InlineTextField, PopoverPanel, SortableList, UrlPasteBar, validateDropFiles } from "../../../components/editing";
import { AUDIO_MAX_BYTES, COVER_MAX_BYTES, MAX_TRACKS, availableTrackSlots, classifyNewTrack, sourceForNewTrack, titleFromAudioFilename } from "./trackEditorModel";
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
        <div className="music-cover w98-sunken">{selected.cover ? <FallbackImage src={selected.cover} alt={tr("music.coverAlt", { title: selected.title || tr("music.trackFallback") })} compact /> : <span aria-hidden="true">♫</span>}</div>
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

export function TrackListEditor({ window, ctx, update }: ModuleProps<"music">) {
  const { t: tr } = useTranslation("music");
  useStopMediaOnResize(window.id);
  const tracks = orderedTracks(window);
  const [selection, setSelection] = useState({ windowId: window.id, trackId: tracks[0]?.id });
  const selected = tracks.find((track) => selection.windowId === window.id && track.id === selection.trackId) ?? tracks[0];
  const root = useRef<HTMLDivElement>(null);
  const sourceTrigger = useRef<HTMLButtonElement>(null);
  const coverTrigger = useRef<HTMLButtonElement>(null);
  const sourceDrafts = useRef<SourceDraftCache>(new Map());
  const coverDrafts = useRef<CoverDraftCache>(new Map());
  const [draftEpoch, setDraftEpoch] = useState(0);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [panel, setPanel] = useState<{ trackId: string; kind: "source" | "cover" } | null>(null);
  const [optional, setOptional] = useState<Record<string, { lyrics?: boolean; character?: boolean; rights?: boolean }>>({});
  useEffect(() => useEditorStore.subscribe((state, previous) => {
    if (state.siteId !== previous.siteId || didMediaHistoryChange(state, previous)) {
      sourceDrafts.current.clear(); coverDrafts.current.clear();
      setDraftEpoch((epoch) => epoch + 1);
      setPanel(null);
    }
  }), []);
  useEffect(() => { setPaste(""); setError(""); setPanel(null); }, [window.id]);
  const { queue, tasks } = useMediaQueue();
  const trackTasks = (id: string) => tasks.filter((task) => task.scope === musicUploadScope(window.id, id));
  const orphanTasks = tasks.filter((task) => task.scope.startsWith(`window:${window.id}:music:`) && !tracks.some((track) => task.scope === musicUploadScope(window.id, track.id)));
  const cancelUpload = (id: string, field: MusicUploadField) => queue?.invalidate(tr("authoring.sourceChanged"), (entry) => entry.options.scope === musicUploadScope(window.id, id) && entry.options.slot === field);
  const taskList = (id: string) => <UploadProgressList tasks={trackTasks(id)} onRetry={(taskId) => queue?.retry(taskId)} onDismiss={(taskId) => queue?.dismiss(taskId)} />;
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
  const patchTrackSource = (id: string, source: TrackSource, key?: string) => { stopPreviewForTrack(id); patchTrack(id, { source }, key); };
  const chooseTrack = (id: string) => {
    if (selected && selected.id !== id) { stopPreviewForTrack(selected.id); setPanel(null); }
    setSelection({ windowId: window.id, trackId: id });
  };
  const blankTrack = (title = tr("music.newTrack"), source: TrackSource = { kind: "audioUrl", url: "https://" }): MusicTrack => ({ id: newId(), title, artist: "", cover: null, coverUrl: "", source, lyrics: "", rightsNote: "" });
  const addTrack = () => {
    if (tracks.length >= MAX_TRACKS) { setError(tr("music.inline.limit")); return; }
    const track = blankTrack();
    setTracks((list) => [...list, track]); chooseTrack(track.id); setPanel({ trackId: track.id, kind: "source" });
  };
  const focusTrack = (id: string) => requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-track-id="${CSS.escape(id)}"]`)?.focus());
  const removeTrack = (id: string) => {
    stopPreviewForTrack(id);
    const index = tracks.findIndex((track) => track.id === id), next = tracks[index + 1] ?? tracks[index - 1];
    setTracks((list) => list.filter((track) => track.id !== id));
    if (selected?.id === id && next) { chooseTrack(next.id); focusTrack(next.id); }
    setPanel(null);
  };
  const upload = (track: MusicTrack, file: File, field: MusicUploadField) => {
    if (!queue || !ctx.siteId || !ctx.upload || !ctx.editing) return;
    const valid = validateDropFiles([file], field === "audio" ? "audio" : "image", field === "audio" ? AUDIO_MAX_BYTES : COVER_MAX_BYTES);
    if (valid.rejected.length) { setError(tr(field === "audio" ? "music.inline.invalidAudio" : "music.inline.invalidCover")); return; }
    if (field === "audio") stopPreviewForTrack(track.id);
    const options = musicUploadOptions(track, field);
    enqueueWindowUpload(queue, useEditorStore, { siteId: ctx.siteId, windowId: window.id, windowType: "music", scope: musicUploadScope(window.id, track.id) }, file, ctx.upload, { ...options, apply: (current, stored) => {
      if (field === "audio") stopPreviewForTrack(track.id);
      return options.apply(current, stored);
    } });
  };
  const addAudioFiles = (files: File[]) => {
    if (!ctx.editing || !ctx.upload || !queue) return;
    const valid = validateDropFiles(files, "audio", AUDIO_MAX_BYTES);
    if (valid.rejected.length) setError(tr("music.inline.invalidAudio"));
    const capacity = availableTrackSlots(tracks.length, valid.accepted.length);
    if (capacity < valid.accepted.length) setError(tr("music.inline.limit"));
    const additions = valid.accepted.slice(0, capacity).map((file) => ({ file, track: blankTrack(titleFromAudioFilename(file.name) || tr("music.newTrack")) }));
    if (!additions.length) return;
    setTracks((list) => [...list, ...additions.map(({ track }) => track)]);
    chooseTrack(additions[0].track.id);
    additions.forEach(({ track, file }) => upload(track, file, "audio"));
  };
  const classifyPaste = (raw: string) => {
    const decision = classifyNewTrack(raw);
    const hint = decision.type === "embed" ? tr("music.source.recognizedEmbed", { platform: decision.platformLabel, resource: resourceLabel()[decision.source.resourceType] }) : decision.type === "audio-file" ? tr("music.source.recognizedAudio") : decision.type === "video-file" ? tr("m3.recognizedVideo") : decision.type === "web-page" ? tr("music.source.recognizedPage") : tr("music.source.invalid");
    return { decision, ok: !!sourceForNewTrack(decision), icon: decision.type === "embed" ? "▶" : "♫", title: decision.type === "embed" ? decision.platformLabel : "", hint };
  };
  const missingSource = (track: MusicTrack) => track.source.kind !== "uploadedAudio" && classifyPastedUrl(urlOfSource(track.source)).type === "empty";
  const missingSources = tracks.filter(missingSource).length;
  const missingRights = tracks.filter((track) => track.source.kind === "uploadedAudio" && !track.rightsNote.trim()).length;
  const openLink = (url: string | null, label: string) => { if (url) ctx.onLink({ target: "url", url, label }); };
  const previewTrack = (id: string) => {
    flushSync(() => chooseTrack(id));
    root.current?.querySelector<HTMLButtonElement>(".music-track-preview .music-preview, .music-track-preview .music-embed-actions button, .music-track-preview .music-video button")?.click();
  };
  const appearance = { tv: ctx.tv, mobile: ctx.mobile };
  return <FileDropZone {...appearance} ref={root} className="music-editor track-list-editor" accept="audio" maxBytes={AUDIO_MAX_BYTES} multiple disabled={!ctx.editing || !ctx.upload} onFiles={addAudioFiles} onError={setError} overlayText={tr("music.inline.dropAudio")}>
    <UrlPasteBar {...appearance} value={paste} onChange={setPaste} classify={classifyPaste} label={tr("music.inline.pasteLabel")} placeholder={tr("music.inline.pastePlaceholder")} onAdd={(guess) => {
      const source = sourceForNewTrack(guess.decision);
      if (!source) { setError(tr("music.source.invalid")); return; }
      if (tracks.length >= MAX_TRACKS) { setError(tr("music.inline.limit")); return; }
      const track = blankTrack(guess.decision.type === "embed" ? `${guess.decision.platformLabel} ${resourceLabel()[guess.decision.source.resourceType]}` : tr("music.newTrack"), source);
      setTracks((list) => [...list, track]); chooseTrack(track.id); setPaste(""); setError("");
    }} extra={<FileUploadButton className="w98-btn music-upload-batch" multiple accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.opus" disabled={!ctx.upload || tracks.length >= MAX_TRACKS} onFiles={addAudioFiles}>{tr("music.inline.uploadFiles")}</FileUploadButton>} />
    <InlineErrorBanner {...appearance} message={error} onClose={() => setError("")} />
    <InlineTextField className="music-playlist-title" aria-label={tr("music.playlistName")} value={window.content.playlist.title} maxLength={200} historyKey={`music-playlist-${window.id}`} onValueChange={(title, key) => update((current) => ({ ...current, content: { ...current.content, playlist: { ...current.content.playlist, title } } }), key)} />
    <div className="music-editor-columns">
      <div className="music-list-pane">
        <SortableList {...appearance} className="music-authoring-list" role="listbox" label={tr("authoring.trackList")} items={tracks} rowClassName="music-authoring-track" onDraggingChange={(id) => setDragging(!!id)} onMove={(id, to) => setTracks((list) => { const from = list.findIndex((track) => track.id === id); if (from < 0) return list; const next = [...list], [track] = next.splice(from, 1); next.splice(to, 0, track); return next; })} getRowProps={(track) => ({ role: "option", tabIndex: selected?.id === track.id ? 0 : -1, "aria-selected": selected?.id === track.id, "aria-label": tr("music.inline.selectAndPreview", { title: track.title || tr("music.untitledTrackLabel") }), "data-track-id": track.id,
          onClick: () => chooseTrack(track.id), onFocus: (event) => { if (event.target === event.currentTarget) chooseTrack(track.id); },
          onKeyDown: (event) => { if (event.target !== event.currentTarget || event.altKey || event.nativeEvent.isComposing) return; const index = tracks.findIndex((item) => item.id === track.id);
            if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); const next = tracks[Math.max(0, Math.min(tracks.length - 1, index + (event.key === "ArrowUp" ? -1 : 1)))]; chooseTrack(next.id); focusTrack(next.id); }
            else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); previewTrack(track.id); }
            else if (event.key === "Delete") { event.preventDefault(); removeTrack(track.id); }
          }
        })} renderItem={(track, handle) => {
          const ownTasks = trackTasks(track.id), count = (status: string) => ownTasks.filter((task) => task.status === status).length;
          const index = tracks.findIndex((item) => item.id === track.id);
          return <>{handle}<span className="music-track-index" aria-hidden="true">{playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing" ? "▶" : index + 1}</span><span className="music-track-summary"><strong>{track.title || tr("music.untitledTrack")}</strong><small className={missingSource(track) || track.source.kind === "uploadedAudio" && !track.rightsNote.trim() ? "music-track-warning" : ""}>{track.artist || tr("music.noArtist")} · {kindBadge(track.source)}</small>{ownTasks.length ? <small>{tr("authoring.uploadSummary", { queued: count("queued"), uploading: count("uploading"), completed: count("completed"), failed: count("failed") })}</small> : null}</span><button type="button" className="music-remove-track" aria-label={tr("music.inline.deleteTrack", { title: track.title || tr("music.untitledTrackLabel") })} onClick={(event) => { event.stopPropagation(); removeTrack(track.id); }}>×</button></>;
        }} />
        <button type="button" className="music-blank-track" disabled={tracks.length >= MAX_TRACKS} onClick={addTrack}>＋ {tr("music.inline.blankTrack")}</button>
        {orphanTasks.length ? <div className="music-orphan-tasks"><p>{tr("authoring.removedTrackUploads")}</p><UploadProgressList tasks={orphanTasks} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)} /></div> : null}
      </div>
      <div className="music-detail-pane">
      {selected ? [selected].map((track) => {
        const previewing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
        const failed = playback.windowId === window.id && playback.trackId === track.id && playback.status === "error";
        const directUrl = track.source.kind === "audioUrl" ? track.source.url : null;
        const platformBlocked = track.source.kind === "audioUrl" && insightForUrl(urlOfSource(track.source)).isPlatformPage;
        const original = openableUrl(track.source), key = `${window.id}:${track.id}`, expanded = optional[key] ?? {};
        const showOptional = (field: "lyrics" | "character" | "rights") => setOptional((value) => ({ ...value, [key]: { ...value[key], [field]: true } }));
        const hasRights = expanded.rights || !!track.rightsNote || track.source.kind === "uploadedAudio";
        const hasCharacter = expanded.character || !!track.characterRef;
        const hasLyrics = expanded.lyrics || !!track.lyrics;
        const sourceOpen = panel?.trackId === track.id && panel.kind === "source";
        const coverOpen = panel?.trackId === track.id && panel.kind === "cover";
        return <div key={`${key}:${draftEpoch}`} className="music-track-editor" aria-label={track.title || tr("music.untitledTrack")}>
          {taskList(track.id)}
          <div className="music-track-heading">
            <FileDropZone {...appearance} className="music-cover-drop" accept="image" maxBytes={COVER_MAX_BYTES} onFiles={(files) => upload(track, files[0], "cover")} onError={setError} overlayText={tr("music.inline.dropCover")} onDragEnter={(event) => event.stopPropagation()} onDragOver={(event) => event.stopPropagation()}>
              <FileUploadButton className="music-cover-pick" title={tr("music.uploadCover")} onFiles={(files) => files[0] && upload(track, files[0], "cover")}><span className="music-cover-image">{track.cover ? <FallbackImage src={track.cover} alt="" compact /> : <span aria-hidden="true">♫</span>}</span><span className="editing-sr-only">{tr("music.uploadCover")}</span></FileUploadButton>
            </FileDropZone>
            <div className="music-track-heading-fields"><InlineTextField aria-label={tr("music.trackTitle")} className="music-track-title" value={track.title} placeholder={tr("music.untitledTrack")} maxLength={200} historyKey={`music-title-${track.id}`} onValueChange={(title, historyKey) => patchTrack(track.id, { title }, historyKey)} /><InlineTextField aria-label={tr("music.artist")} value={track.artist} placeholder={tr("music.noArtist")} maxLength={200} historyKey={`music-artist-${track.id}`} onValueChange={(artist, historyKey) => patchTrack(track.id, { artist }, historyKey)} /><button type="button" ref={coverTrigger} className="music-cover-url-toggle" aria-expanded={coverOpen} onClick={() => setPanel(coverOpen ? null : { trackId: track.id, kind: "cover" })}>{tr("music.inline.coverUrl")}</button></div>
          </div>
          <PopoverPanel {...appearance} keepMounted label={tr("music.coverImageUrl")} open={coverOpen} triggerRef={coverTrigger} scopeRef={root} onClose={() => setPanel(null)}><MusicCoverUrlField draftKey={key} drafts={coverDrafts.current} onEdit={() => cancelUpload(track.id, "cover")} raw={track.coverUrl} label={tr("music.coverImageUrl")} placeholder="https://…" onCommit={(raw, cover) => patchTrack(track.id, { coverUrl: raw, cover })} /></PopoverPanel>
          <DestinationChip {...appearance} ref={sourceTrigger} className="music-source-chip" text={track.source.kind === "uploadedAudio" ? tr("music.source.uploaded") : missingSource(track) ? tr("music.inline.source") : `${kindBadge(track.source)} · ${urlOfSource(track.source)}`} title={track.source.kind === "uploadedAudio" ? tr("music.source.uploaded") : urlOfSource(track.source)} aria-label={tr("music.inline.changeSource")} icon="♫" missing={missingSource(track)} expanded={sourceOpen} onClick={() => setPanel(sourceOpen ? null : { trackId: track.id, kind: "source" })} />
          <PopoverPanel {...appearance} keepMounted label={tr("music.inline.source")} open={sourceOpen} triggerRef={sourceTrigger} scopeRef={root} onClose={() => setPanel(null)}><TrackSourceInput showPlayer={false} draftCache={sourceDrafts.current} onEdit={() => cancelUpload(track.id, "audio")} track={track} windowId={window.id} patchSource={(source, historyKey) => patchTrackSource(track.id, source, historyKey)} uploadAudio={(file) => upload(track, file, "audio")} onOpenOriginal={() => openLink(original, track.title)} resourceName={(type) => resourceLabel()[type]} /></PopoverPanel>
          <div className="music-track-preview">
            {track.source.kind === "providerEmbed" ? <ProviderPlayer source={track.source} title={track.title} windowId={window.id} trackId={track.id} onOpenOriginal={() => openLink(original, track.title)} /> : track.source.kind === "audioUrl" && isVideoFileUrl(track.source.url) ? <VideoPlayer key={track.source.url} url={track.source.url} title={track.title} windowId={window.id} trackId={track.id} onOpenOriginal={() => openLink(original, track.title)} /> : track.source.kind === "audioUrl" ? <button type="button" className="w98-btn music-preview" disabled={!playableUrl(directUrl) || platformBlocked || playback.status === "loading" && playback.trackId === track.id} onClick={() => previewing ? musicPlayback.pause(window.id) : directUrl ? void playNative(window.id, track.id, directUrl) : undefined}>{previewing ? tr("music.stopPreview") : tr("music.preview")}</button> : track.source.kind === "uploadedAudio" ? <UploadedAudioPreview windowId={window.id} trackId={track.id} source={track.source.asset} previewing={previewing} loading={playback.status === "loading" && playback.trackId === track.id} /> : <span className="w98-hint">{tr("music.visitorsWillSeeOpenOriginal")}</span>}
            {failed && !(track.source.kind === "audioUrl" && isVideoFileUrl(track.source.url)) ? <div role="alert" className="music-error"><strong>{tr("music.thisTrackCantBePlayed")}</strong><span>{explainPlaybackFailure(playback.url, playback.error)}</span>{original ? <button type="button" className="w98-btn small" onClick={() => openLink(original, track.title)}>{tr("music.openOriginalSite")}</button> : null}</div> : null}
          </div>
          <div className="music-optional-chips">{!hasLyrics ? <button type="button" onClick={() => showOptional("lyrics")}>{tr("music.inline.lyrics")}</button> : null}{!hasCharacter ? <button type="button" onClick={() => showOptional("character")}>{tr("music.inline.character")}</button> : null}{!hasRights ? <button type="button" onClick={() => showOptional("rights")}>{tr("music.inline.rights")}</button> : null}</div>
          {hasCharacter ? <label><span>{tr("music.characterThemeSongOptional")}</span><select className="w98-input" value={track.characterRef?.id ?? ""} onChange={(event) => patchTrack(track.id, { characterRef: event.target.value && ctx.siteId ? { kind: "profile", siteId: ctx.siteId, id: event.target.value } : undefined })}><option value="">{tr("music.noCharacter")}</option>{ctx.profiles?.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name ?? profile.handle ?? profile.username}</option>)}</select></label> : null}
          {hasRights ? <label className={track.source.kind === "uploadedAudio" && !track.rightsNote.trim() ? "music-rights-required" : ""}><span>{tr("music.rightsLabel")}{track.source.kind === "uploadedAudio" ? tr("music.requiredToPublish") : ""}</span><InlineTextField value={track.rightsNote} placeholder={tr("music.eGMyOwnOriginal")} aria-required={track.source.kind === "uploadedAudio"} aria-invalid={track.source.kind === "uploadedAudio" && !track.rightsNote.trim()} maxLength={1000} historyKey={`music-rights-${track.id}`} onValueChange={(rightsNote, historyKey) => patchTrack(track.id, { rightsNote }, historyKey)} /></label> : null}
          {hasLyrics ? <label><span>{tr("music.lyricsTextOptional")}</span><InlineTextArea value={track.lyrics} maxLength={20000} historyKey={`music-lyrics-${track.id}`} onValueChange={(lyrics, historyKey) => patchTrack(track.id, { lyrics }, historyKey)} /></label> : null}
        </div>;
      }) : <p className="music-editor-empty">{tr("music.inline.noSelection")}</p>}
      </div>
    </div>
    <EditorStatusBar {...appearance} message={dragging ? tr("music.inline.dragging") : missingSources ? tr("music.inline.missingSource", { count: missingSources }) : missingRights ? tr("music.inline.missingRights", { count: missingRights }) : tr("music.inline.instructions")} count={tr("music.inline.count", { count: tracks.length })} />
  </FileDropZone>;
}

/** Existing registry callers remain compatible while the editor adopts the purpose-based name. */
export { TrackListEditor as MusicInlineEditor };
