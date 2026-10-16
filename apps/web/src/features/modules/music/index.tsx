import { useEffect, useMemo, useState } from "react";
import type { MusicTrack } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, type ModuleProps } from "../types";
import { musicPlayback, useMusicPlayback } from "./audioCoordinator";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const playable = (track: MusicTrack) => {
  if (track.source.kind !== "audioUrl") return false;
  try { return new URL(track.source.url).protocol === "https:"; } catch { return false; }
};
const formatTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--";
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
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

  useEffect(() => {
    if (activeForWindow && !tracks.some((track) => track.id === playback.trackId)) musicPlayback.stopWindow(window.id);
  }, [activeForWindow, playback.trackId, tracks, window.id]);

  if (!tracks.length) return <div className="music-empty"><span aria-hidden="true">♫</span><strong>播放清單是空的</strong><small>作者還沒有加入曲目。</small></div>;
  if (!selected) return null;

  const index = tracks.findIndex((track) => track.id === selected.id);
  const isPlaying = activeForWindow && playback.trackId === selected.id && playback.status === "playing";
  const isLoading = activeForWindow && playback.trackId === selected.id && playback.status === "loading";
  const character = ctx.profileDirectory?.find((entry) => entry.id === selected.characterRef?.id);
  const selectAndPlay = (next: MusicTrack) => { setSelectedId(next.id); if (playable(next)) void musicPlayback.play(window.id, next.id, next.source.url); };
  const previous = () => selectAndPlay(tracks[(index - 1 + tracks.length) % tracks.length]);
  const next = () => selectAndPlay(tracks[(index + 1) % tracks.length]);

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

      <div className="music-controls" role="group" aria-label="播放控制">
        <button type="button" className="w98-btn music-control" aria-label="上一首" onClick={previous}>|◀</button>
        {selected.source.kind === "audioUrl" ? (
          <button
            type="button"
            className="w98-btn music-control music-play"
            disabled={!playable(selected) || isLoading}
            aria-label={isPlaying ? "暫停" : "播放"}
            onClick={() => isPlaying ? musicPlayback.pause(window.id) : void musicPlayback.play(window.id, selected.id, selected.source.url)}
          >{isLoading ? "…" : isPlaying ? "Ⅱ" : "▶"}</button>
        ) : (
          <button type="button" className="w98-btn music-open" onClick={() => ctx.onLink({ target: "url", url: selected.source.url, label: selected.title })}>開啟原連結 ↗</button>
        )}
        <button type="button" className="w98-btn music-control" aria-label="下一首" onClick={next}>▶|</button>
      </div>

      <div className="music-runtime">
        {activeForWindow && playback.trackId === selected.id && playback.canSeek && playback.duration !== null ? (
          <label className="music-progress"><span className="sr-only">播放進度</span><input type="range" min={0} max={playback.duration} step={1} value={Math.min(playback.currentTime, playback.duration)} onChange={(event) => musicPlayback.seek(window.id, Number(event.target.value))} /><small>{formatTime(playback.currentTime)} / {formatTime(playback.duration)}</small></label>
        ) : <small className="music-time">{activeForWindow && playback.trackId === selected.id ? formatTime(playback.currentTime) : "0:00"} / --:--</small>}
        <label className="music-volume"><span aria-hidden="true">🔊</span><span className="sr-only">音量</span><input aria-label="音量" type="range" min={0} max={1} step={0.05} value={playback.volume} onChange={(event) => musicPlayback.setVolume(Number(event.target.value))} /></label>
      </div>

      {activeForWindow && playback.trackId === selected.id && playback.error ? <div role="alert" className="music-error">{playback.error}</div> : null}
      {selected.source.url && selected.source.url !== "https://" ? <button type="button" className="music-source-link" onClick={() => ctx.onLink({ target: "url", url: selected.source.url, label: selected.title })}>來源／原連結 ↗</button> : null}

      <div className="music-track-list w98-sunken" role="list" aria-label="曲目清單">
        {tracks.map((track, trackIndex) => {
          const current = selected.id === track.id;
          const playing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
          return (
            <button key={track.id} type="button" role="listitem" className={`music-track${current ? " selected" : ""}`} aria-current={current ? "true" : undefined} onClick={() => setSelectedId(track.id)}>
              <span>{playing ? "▶" : String(trackIndex + 1).padStart(2, "0")}</span><span><strong>{track.title || "未命名曲目"}</strong><small>{track.artist || (track.source.kind === "externalLink" ? "外部平台" : "未填演出者")}</small></span><span>{track.source.kind === "externalLink" ? "↗" : "♫"}</span>
            </button>
          );
        })}
      </div>

      {selected.lyrics ? <details className="music-lyrics"><summary>歌詞／文字</summary><pre>{selected.lyrics}</pre></details> : null}
      {selected.rightsNote ? <small className="music-rights">權利說明：{selected.rightsNote}</small> : null}
    </div>
  );
}

export function MusicInlineEditor({ window, ctx, update }: ModuleProps<"music">) {
  const tracks = orderedTracks(window);
  const playback = useMusicPlayback();
  const setTracks = (recipe: (tracks: MusicTrack[]) => MusicTrack[], key?: string) => update((current) => {
    const next = recipe(orderedTracks(current));
    return { ...current, content: { ...current.content, tracks: next, playlist: { ...current.content.playlist, trackIds: next.map((track) => track.id) } } };
  }, key);
  const patchTrack = (id: string, patch: Partial<MusicTrack>, key?: string) => setTracks((list) => list.map((track) => track.id === id ? { ...track, ...patch } : track), key);
  const addTrack = () => setTracks((list) => {
    const track: MusicTrack = { id: newId(), title: "新曲目", artist: "", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://" }, lyrics: "", rightsNote: "" };
    return [...list, track];
  });
  const removeTrack = (id: string) => {
    musicPlayback.stopWindow(window.id);
    setTracks((list) => list.filter((track) => track.id !== id));
  };
  const uploadCover = async (trackId: string, file: File) => {
    const stored = await ctx.upload?.(file, "image");
    if (stored) patchTrack(trackId, { cover: stored, coverUrl: "" });
  };

  return (
    <div className="music-editor">
      <div className="music-editor-head">
        <label><span className="w98-hint">播放清單名稱</span><input className="w98-input" value={window.content.playlist.title} onChange={(event) => update((current) => ({ ...current, content: { ...current.content, playlist: { ...current.content.playlist, title: event.target.value } } }), `music-playlist-${window.id}`)} /></label>
        <button type="button" className="w98-btn primary" onClick={addTrack}>＋ 新增曲目</button>
      </div>
      <p className="w98-hint">HTTPS 音訊可在訪客操作後播放；YouTube、Spotify 等平台頁面請選「外部連結」。本版不會抓取或上傳音訊。</p>
      {!tracks.length ? <div className="music-editor-empty"><strong>還沒有曲目</strong><span>先新增一首，再填入你有權使用的音訊或作品連結。</span><button type="button" className="w98-btn" onClick={addTrack}>新增第一首</button></div> : null}
      {tracks.map((track, index) => {
        const previewing = playback.windowId === window.id && playback.trackId === track.id && playback.status === "playing";
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
              <button type="button" className={`w98-btn grow${track.source.kind === "audioUrl" ? " on" : ""}`} aria-pressed={track.source.kind === "audioUrl"} onClick={() => patchTrack(track.id, { source: { kind: "audioUrl", url: "https://" } })}>HTTPS 音訊</button>
              <button type="button" className={`w98-btn grow${track.source.kind === "externalLink" ? " on" : ""}`} aria-pressed={track.source.kind === "externalLink"} onClick={() => patchTrack(track.id, { source: { kind: "externalLink", url: "https://" } })}>外部連結</button>
            </div>
            <label><span>{track.source.kind === "audioUrl" ? "音訊直連（HTTPS）" : "平台／作品頁連結"}</span><input className="w98-input" value={track.source.url} onChange={(event) => patchTrack(track.id, { source: { ...track.source, url: event.target.value } }, `music-source-${track.id}`)} /></label>
            {track.source.kind === "audioUrl" ? <button type="button" className="w98-btn music-preview" disabled={!playable(track) || playback.status === "loading" && playback.trackId === track.id} onClick={() => previewing ? musicPlayback.pause(window.id) : void musicPlayback.play(window.id, track.id, track.source.url)}>{previewing ? "Ⅱ 停止試聽" : "▶ 試聽"}</button> : <span className="w98-hint">訪客會看到「開啟原連結」，不會假裝能在站內播放。</span>}
            <label><span>角色主題曲（選填）</span><select className="w98-input" value={track.characterRef?.id ?? ""} onChange={(event) => patchTrack(track.id, { characterRef: event.target.value && ctx.siteId ? { kind: "profile", siteId: ctx.siteId, id: event.target.value } : undefined })}><option value="">不指定角色</option>{ctx.profiles?.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name ?? profile.handle ?? profile.username}</option>)}</select></label>
            <label><span>權利說明</span><input className="w98-input" value={track.rightsNote} placeholder="例：原創曲／已獲授權" onChange={(event) => patchTrack(track.id, { rightsNote: event.target.value }, `music-rights-${track.id}`)} /></label>
            <label><span>歌詞／文字（選填）</span><textarea className="w98-textarea" rows={4} value={track.lyrics} onChange={(event) => patchTrack(track.id, { lyrics: event.target.value }, `music-lyrics-${track.id}`)} /></label>
          </fieldset>
        );
      })}
    </div>
  );
}

