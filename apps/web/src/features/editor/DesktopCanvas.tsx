import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { CollectionEntityV2, DesktopWindow, PostEntityV2, ProfileEntityV2, SiteDocumentV2Input } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { RetroWindow } from "../../components/RetroWindow";
import { useThemeView } from "../../lib/themeView";
import { WindowRenderer } from "../site/WindowRenderer";
import { DesktopTaskbar } from "../site/DesktopTaskbar";
import { useEditorStore } from "./store";
import type { ProfileDirectoryEntry } from "../modules/types";
import { musicPlayback, useMusicPlayback } from "../modules/music/audioCoordinator";
import styles from "./DesktopCanvas.module.css";

const TASKBAR_H = 36;
const GRID = 8;
const KEEP_VISIBLE = 80;

type Gesture =
  | { kind: "move" | "resize"; id: string; startX: number; startY: number; x: number; y: number; w: number; h: number }
  | { kind: "icon"; id: string; startX: number; startY: number; x: number; y: number; moved: boolean };

function setGeo(el: HTMLElement, text: string) {
  const label = el.querySelector(".geo-text");
  if (label) label.textContent = text;
}

type Props = {
  siteId?: string;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  profiles?: ProfileEntityV2[];
  posts?: PostEntityV2[];
  collections?: CollectionEntityV2[];
  profileId?: string;
  profileIdsByWindow?: Record<string, string>;
  onProfileSelect?: (id: string, windowId?: string) => void;
  onProfileAdd?: (windowId?: string) => void;
  onProfileDuplicate?: (id: string, windowId?: string) => void;
  onProfileChange?: (profileId: string, patch: Record<string, unknown>, historyKey?: string) => void;
  onProfileDelete?: (profileId: string, retargetProfileId?: string) => void;
  profileDeleteBlocked?: boolean;
  profileDeleteGuardById?: Record<string, { windowTitles: string[]; postIds: string[] }>;
  profileDirectory?: ProfileDirectoryEntry[];
  updateContent?: (recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) => void;
  socialDocument?: SiteDocumentV2Input;
};

export function DesktopCanvas({ siteId, upload, profiles, posts, collections, profileId, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById, profileDirectory, updateContent, socialDocument }: Props) {
  const document = useEditorStore((s) => s.document)!;
  const selectedId = useEditorStore((s) => s.selectedId);
  const view = useEditorStore((s) => s.viewState);
  const layoutMode = useEditorStore((s) => s.layoutMode);
  const snap = useEditorStore((s) => s.snap);
  const store = useEditorStore.getState;
  const drag = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const tv = useThemeView(document.theme);
  const music = useMusicPlayback();
  const snapping = layoutMode && snap;

  const round = (value: number) => (snapping ? Math.round(value / GRID) * GRID : Math.round(value));
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, value), Math.max(min, max));

  function bounds() {
    const canvas = canvasRef.current;
    return { width: canvas?.clientWidth ?? 1200, height: Math.max(200, (canvas?.clientHeight ?? 800) - TASKBAR_H) };
  }

  const clampWindowPos = (x: number, y: number, w: number) => {
    const b = bounds();
    return { x: round(clamp(x, KEEP_VISIBLE - w, b.width - KEEP_VISIBLE)), y: round(clamp(y, 0, b.height - 32)) };
  };
  const clampIconPos = (x: number, y: number) => {
    const b = bounds();
    return { x: round(clamp(x, 0, b.width - 84)), y: round(clamp(y, 0, b.height - 92)) };
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (store().layoutMode) store().setLayoutMode(false);
      }
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [store]);

  useEffect(() => () => musicPlayback.stopAll(), []);

  // ----- window gestures -----
  function windowPointerDown(event: PointerEvent<HTMLDivElement>, win: DesktopWindow) {
    const target = event.target as HTMLElement;
    if (target.closest(".titlebar-controls")) return;
    store().focusWindow(win.id);
    if (view[win.id] === "max") return;
    const layout = win.layout.desktop;
    const onGrip = !!target.closest(".window-resize-handle");
    const onTitle = !!target.closest(".retro-titlebar");
    if (!(onGrip || onTitle || layoutMode)) return;
    drag.current = { kind: onGrip ? "resize" : "move", id: win.id, startX: event.clientX, startY: event.clientY, x: layout.x, y: layout.y, w: layout.w, h: layout.h };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function windowPointerMove(event: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.kind === "icon") return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    const el = event.currentTarget;
    if (g.kind === "move") {
      const pos = clampWindowPos(g.x + dx, g.y + dy, g.w);
      el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      setGeo(el, `${pos.x}, ${pos.y} · ${g.w}×${g.h}`);
    } else {
      const b = bounds();
      const w = round(clamp(g.w + dx, 220, Math.min(1400, b.width - g.x)));
      const h = round(clamp(g.h + dy, 140, Math.min(1200, b.height - g.y)));
      el.style.width = w + "px";
      el.style.height = h + "px";
      setGeo(el, `${g.x}, ${g.y} · ${w}×${h}`);
    }
  }

  function windowPointerUp(event: PointerEvent<HTMLDivElement>) {
    const g = drag.current;
    if (!g || g.kind === "icon") return;
    drag.current = null;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (g.kind === "move") {
      const pos = clampWindowPos(g.x + dx, g.y + dy, g.w);
      if (pos.x !== g.x || pos.y !== g.y) store().updateWindow(g.id, (w) => ({ ...w, layout: { ...w.layout, desktop: { ...w.layout.desktop, ...pos } } }));
    } else {
      const b = bounds();
      const w = round(clamp(g.w + dx, 220, Math.min(1400, b.width - g.x)));
      const h = round(clamp(g.h + dy, 140, Math.min(1200, b.height - g.y)));
      if (w !== g.w || h !== g.h) store().updateWindow(g.id, (win) => ({ ...win, layout: { ...win.layout, desktop: { ...win.layout.desktop, w, h } } }));
    }
  }

  // ----- icon gestures (moves > 3px count as a drag, otherwise it is a click) -----
  function iconPointerDown(event: PointerEvent<HTMLButtonElement>, win: DesktopWindow) {
    const layout = win.layout.desktop;
    drag.current = { kind: "icon", id: win.id, startX: event.clientX, startY: event.clientY, x: layout.iconX, y: layout.iconY, moved: false };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function iconPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const g = drag.current;
    if (!g || g.kind !== "icon") return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) <= 3) return;
    g.moved = true;
    const pos = clampIconPos(g.x + dx, g.y + dy);
    event.currentTarget.style.left = pos.x + "px";
    event.currentTarget.style.top = pos.y + "px";
  }
  function iconPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const g = drag.current;
    if (!g || g.kind !== "icon") return;
    drag.current = null;
    if (!g.moved) return;
    suppressClick.current = true;
    const pos = clampIconPos(g.x + event.clientX - g.startX, g.y + event.clientY - g.startY);
    store().moveIcon(g.id, pos.x, pos.y);
  }
  function openWindow(id: string) {
    store().setViewState(id, null);
    store().focusWindow(id);
  }
  function iconClick(id: string) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    openWindow(id);
  }

  function toggleTask(win: DesktopWindow) {
    const state = view[win.id];
    if (state === "min") openWindow(win.id);
    else if (selectedId === win.id) store().setViewState(win.id, "min");
    else store().focusWindow(win.id);
  }

  const rows = () => Math.max(1, Math.floor((bounds().height - 20) / 94));
  const topZ = Math.max(0, ...document.windows.map((w) => w.layout.desktop.z));
  const selected = document.windows.find((w) => w.id === selectedId);
  return (
    <div
      ref={canvasRef}
      className={"desktop-canvas" + (layoutMode ? " layout" : "")}
      onPointerDown={(event) => { if ((event.target as HTMLElement).dataset.bg) store().select(null); }}
      style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}
    >
      {layoutMode && snap ? <div aria-hidden="true" className="grid-overlay" /> : null}

      <div data-bg="1" className="icon-layer">
        {document.windows.map((win, index) => {
          const layout = win.layout.desktop;
          const isSel = selectedId === win.id;
          return (
            <button
              key={"icon-" + win.id}
              type="button"
              className="deskicon"
              aria-label={`開啟 ${win.title}`}
              style={{ left: layout.iconX, top: layout.iconY, zIndex: isSel ? 2 : 1, outline: isSel ? `1px dotted ${tv.text}` : "none", cursor: layoutMode ? "grab" : "pointer" }}
              onClick={() => iconClick(win.id)}
              onPointerDown={(event) => iconPointerDown(event, win)}
              onPointerMove={iconPointerMove}
              onPointerUp={iconPointerUp}
              onPointerCancel={() => { drag.current = null; }}
              data-index={index}
            >
              <span className="deskicon-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}><Icon name={win.icon} size={32} /></span>
              <span className="deskicon-label" style={{ background: tv.labelBg, color: tv.labelColor, border: tv.labelBorder, borderRadius: tv.labelRadius, textShadow: tv.labelShadow }}>{win.title}</span>
            </button>
          );
        })}
      </div>

      {document.windows.length === 0 ? (
        <div className="empty-desktop w98-window" role="status">
          <div className="w98-titlebar" style={{ height: 26 }}>開始吧！</div>
          <div className="empty-body">
            <Icon name="folder" size={48} />
            <strong>你的桌面還空空的</strong>
            <span>新增第一個視窗，放上自我介紹、作品或連結。從左側面板點「新增」。</span>
          </div>
        </div>
      ) : null}

      {document.windows.map((win) => {
        const layout = win.layout.desktop;
        const state = view[win.id];
        if (state === "min" || state === "closed") return null;
        const maximized = state === "max";
        const isSel = selectedId === win.id;
        return (
          <div
            key={win.id}
            className={`canvas-window ${isSel ? "selected" : ""}`}
            style={maximized
              ? { width: "calc(100% - 8px)", height: `calc(100% - ${TASKBAR_H + 8}px)`, transform: "translate(4px, 4px)", zIndex: layout.z }
              : { width: layout.w, height: layout.h, transform: `translate(${layout.x}px, ${layout.y}px)`, zIndex: layout.z }}
            onPointerDown={(event) => windowPointerDown(event, win)}
            onPointerMove={windowPointerMove}
            onPointerUp={windowPointerUp}
            onPointerCancel={() => { drag.current = null; }}
            onFocusCapture={() => { if (store().selectedId !== win.id) store().focusWindow(win.id); }}
          >
            <RetroWindow
              title={win.title}
              icon={win.icon}
              theme={document.theme}
              appearance={win.appearance}
              chrome={win.chrome}
              active={isSel || layout.z === topZ}
              interactiveControls
              maximized={maximized}
              onMinimize={() => store().setViewState(win.id, "min")}
              onMaximize={() => store().setViewState(win.id, maximized ? null : "max")}
              onClose={() => { musicPlayback.stopWindow(win.id); store().setViewState(win.id, "closed"); }}
              titleBarProps={{ onDoubleClick: () => store().setViewState(win.id, maximized ? null : "max"), style: { cursor: layoutMode ? "move" : "default", touchAction: "none" } }}
              style={{ height: "100%" }}
              bodyStyle={{ padding: 0 }}
            >
              <WindowRenderer window={win} theme={document.theme} editing={!layoutMode} allWindows={document.windows} siteId={siteId} upload={upload} onUpdate={store().updateWindow} profiles={profiles} posts={posts} collections={collections} profileId={profileId} profileIdsByWindow={profileIdsByWindow} onProfileSelect={onProfileSelect} onProfileAdd={onProfileAdd} onProfileDuplicate={onProfileDuplicate} onProfileChange={onProfileChange} onProfileDelete={onProfileDelete} profileDeleteBlocked={profileDeleteBlocked} profileDeleteGuardById={profileDeleteGuardById} profileDirectory={profileDirectory} updateContent={updateContent} socialDocument={socialDocument} />
            </RetroWindow>
            {layoutMode ? <div className={`layout-veil ${styles.layoutVeil}`}><span className="geo-text">{layout.x}, {layout.y} · {layout.w}×{layout.h}</span></div> : null}
            {!maximized ? <span className="window-resize-handle" aria-label="調整大小" /> : null}
          </div>
        );
      })}

      {selected && !layoutMode && !view[selected.id] ? (
        <div className="sel-tag" style={{ left: selected.layout.desktop.x, top: Math.max(0, selected.layout.desktop.y - 22), zIndex: 99990 }}>已選取 · 拖曳標題列移動、右下角縮放</div>
      ) : null}

      {layoutMode ? (
        <div className="layout-toolbar w98-window" role="toolbar" aria-label="排版模式">
          <strong>▦ 排版模式</strong>
          <span>拖曳視窗或桌面圖示 · 右下角縮放</span>
          <button type="button" className="w98-btn small" onClick={() => store().autoArrangeIcons(rows())}>圖示自動排列</button>
          <button type="button" className={"w98-btn small" + (snap ? " on" : "")} aria-pressed={snap} onClick={() => store().toggleSnap()}>對齊格線 {GRID}px：{snap ? "開" : "關"}</button>
          <button type="button" className="w98-btn small primary" onClick={() => store().setLayoutMode(false)}>完成</button>
        </div>
      ) : (
        <div className="edit-tag" aria-hidden="true">編輯模式 · 直接點視窗內容編輯</div>
      )}

      <DesktopTaskbar
        document={document}
        tasks={document.windows.map((win) => ({
          window: win,
          visible: view[win.id] !== "closed",
          active: selectedId === win.id && view[win.id] !== "min",
          statusLabel: music.windowId === win.id && music.status === "playing" ? "播放中" : undefined
        }))}
        onOpen={openWindow}
        onToggle={(id) => {
          const win = document.windows.find((candidate) => candidate.id === id);
          if (win) toggleTask(win);
        }}
      />
    </div>
  );
}
