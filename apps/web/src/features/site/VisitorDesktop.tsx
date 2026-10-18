import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopWindow, ProfileEntityV2, SiteDocument } from "@retrodesk/shared";
import type { PreviewNavigation } from "./previewNavigation";
import type { ProfileDirectoryEntry } from "../modules/types";
import { Icon } from "../../components/Icon";
import { RetroWindow } from "../../components/RetroWindow";
import { useThemeView } from "../../lib/themeView";
import { DesktopTaskbar } from "./DesktopTaskbar";
import { WindowRenderer } from "./WindowRenderer";
import { useMusicPlayback } from "../modules/music/audioCoordinator";
import { stopAllMedia, stopWindowMedia } from "../modules/music/mediaSession";

type WindowStatus = "open" | "minimized" | "closed";

type RuntimeWindow = {
  status: WindowStatus;
  maximized: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

type RuntimeMap = Record<string, RuntimeWindow>;

type Gesture =
  | { kind: "move"; id: string; startX: number; startY: number; x: number; y: number; w: number; h: number }
  | { kind: "resize"; id: string; startX: number; startY: number; x: number; y: number; w: number; h: number };

function initialRuntime(document: SiteDocument, initialOpenId?: string): RuntimeMap {
  return Object.fromEntries(document.windows.map((window) => [
    window.id,
    {
      status: window.id === initialOpenId || (!initialOpenId && (window.defaultOpen || (window.type === "character-dialog" && window.content.autoShow))) ? "open" : "closed",
      maximized: false,
      x: window.layout.desktop.x,
      y: window.layout.desktop.y,
      w: window.layout.desktop.w,
      h: window.layout.desktop.h,
      z: window.layout.desktop.z
    }
  ]));
}

export function VisitorDesktop({ document, profiles, profileIdsByWindow, profileDirectory, initialOpenId, initialPostId, navigation, publicShareBaseUrl, siteHandle }: { navigation?: PreviewNavigation; document: SiteDocument; profiles?: ProfileEntityV2[]; profileIdsByWindow?: Record<string, string>; profileDirectory?: ProfileDirectoryEntry[]; initialOpenId?: string; initialPostId?: string; publicShareBaseUrl?: string; siteHandle?: string }) {
  const { t: tr } = useTranslation("editor");
  const [runtime, setRuntime] = useState<RuntimeMap>(() => initialRuntime(document, initialOpenId ?? (navigation?.openId && document.windows.some((window) => window.id === navigation.openId) ? navigation.openId : undefined)));
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const tv = useThemeView(document.theme);
  const music = useMusicPlayback();

  useEffect(() => () => stopAllMedia(), []);

  const topZ = useMemo(
    () => Math.max(0, ...Object.values(runtime).filter((item) => item.status === "open").map((item) => item.z)),
    [runtime]
  );

  function bounds() {
    return {
      width: desktopRef.current?.clientWidth ?? window.innerWidth,
      height: Math.max(200, (desktopRef.current?.clientHeight ?? window.innerHeight) - 38)
    };
  }

  function focus(id: string) {
    if (navigation) navigation.openId = id;
    setRuntime((current) => {
      const target = current[id];
      if (!target) return current;
      const max = Math.max(0, ...Object.values(current).map((item) => item.z));
      if (target.z === max && target.status === "open") return current;
      return { ...current, [id]: { ...target, status: "open", z: max + 1 } };
    });
  }

  function openWindow(id: string) {
    focus(id);
  }

  function minimize(id: string) {
    if (navigation?.openId === id) navigation.openId = null;
    stopWindowMedia(id);
    setRuntime((current) => current[id] ? { ...current, [id]: { ...current[id], status: "minimized" } } : current);
  }

  function close(id: string) {
    if (navigation?.openId === id) navigation.openId = null;
    stopWindowMedia(id);
    setRuntime((current) => current[id] ? { ...current, [id]: { ...current[id], status: "closed", maximized: false } } : current);
  }

  function toggleMaximize(id: string) {
    setRuntime((current) => {
      const target = current[id];
      if (!target) return current;
      const max = Math.max(0, ...Object.values(current).map((item) => item.z));
      return {
        ...current,
        [id]: { ...target, status: "open", maximized: !target.maximized, z: max + 1 }
      };
    });
  }

  function taskbarToggle(id: string) {
    const target = runtime[id];
    if (!target) return;
    if (target.status === "open") minimize(id);
    else openWindow(id);
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>, window: DesktopWindow) {
    const target = event.target as HTMLElement;
    if (target.closest(".titlebar-controls")) return;
    const state = runtime[window.id];
    if (!state || state.maximized || state.status !== "open") return;

    if (target.closest(".window-resize-handle")) {
      gesture.current = {
        kind: "resize",
        id: window.id,
        startX: event.clientX,
        startY: event.clientY,
        x: state.x,
        y: state.y,
        w: state.w,
        h: state.h
      };
    } else if (target.closest(".retro-titlebar")) {
      gesture.current = {
        kind: "move",
        id: window.id,
        startX: event.clientX,
        startY: event.clientY,
        x: state.x,
        y: state.y,
        w: state.w,
        h: state.h
      };
    } else {
      focus(window.id);
      return;
    }

    focus(window.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    const area = bounds();
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    if (active.kind === "move") {
      const x = Math.min(Math.max(0, active.x + dx), Math.max(0, area.width - active.w));
      const y = Math.min(Math.max(0, active.y + dy), Math.max(0, area.height - 30));
      event.currentTarget.style.left = x + "px";
      event.currentTarget.style.top = y + "px";
      return;
    }

    const w = Math.min(Math.max(220, active.w + dx), Math.max(220, area.width - active.x));
    const h = Math.min(Math.max(140, active.h + dy), Math.max(140, area.height - active.y));
    event.currentTarget.style.width = w + "px";
    event.currentTarget.style.height = h + "px";
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    const area = bounds();
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    setRuntime((current) => {
      const target = current[active.id];
      if (!target) return current;
      if (active.kind === "move") {
        const x = Math.round(Math.min(Math.max(0, active.x + dx), Math.max(0, area.width - active.w)));
        const y = Math.round(Math.min(Math.max(0, active.y + dy), Math.max(0, area.height - 30)));
        return { ...current, [active.id]: { ...target, x, y } };
      }
      const w = Math.round(Math.min(Math.max(220, active.w + dx), Math.max(220, area.width - active.x)));
      const h = Math.round(Math.min(Math.max(140, active.h + dy), Math.max(140, area.height - active.y)));
      return { ...current, [active.id]: { ...target, w, h } };
    });

    gesture.current = null;
  }

  return (
    <div ref={desktopRef} className="visitor-desktop" style={{ fontFamily: tv.fontFamily, color: tv.text }}>
      {document.windows.map((window, index) => {
        const layout = window.layout.desktop;
        const iconX = layout.iconX ?? 16 + Math.floor(index / 7) * 88;
        const iconY = layout.iconY ?? 18 + (index % 7) * 78;
        return (
          <button
            key={"desktop-icon-" + window.id}
            type="button"
            className="deskicon visitor-icon"
            style={{ left: iconX, top: iconY }}
            onClick={() => openWindow(window.id)}
          >
            <span className="deskicon-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}><Icon name={window.icon} size={32} /></span>
            <small className="deskicon-label" style={{ background: tv.labelBg, color: tv.labelColor, border: tv.labelBorder, borderRadius: tv.labelRadius, textShadow: tv.labelShadow }}>{window.title}</small>
          </button>
        );
      })}

      {document.windows.map((window) => {
        const state = runtime[window.id];
        if (!state || state.status !== "open") return null;

        const style = state.maximized
          ? { left: 4, top: 4, width: "calc(100% - 8px)", height: "calc(100% - 46px)", zIndex: state.z }
          : { left: state.x, top: state.y, width: state.w, height: state.h, zIndex: state.z };

        return (
          <div
            key={window.id}
            className={"visitor-window " + (state.maximized ? "maximized" : "")}
            style={style}
            onPointerDown={(event) => pointerDown(event, window)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={() => { gesture.current = null; }}
            onFocusCapture={() => focus(window.id)}
          >
            <RetroWindow
              title={window.title}
              icon={window.icon}
              theme={document.theme}
              appearance={window.appearance}
              chrome={window.chrome}
              active={state.z === topZ}
              maximized={state.maximized}
              interactiveControls
              onMinimize={() => minimize(window.id)}
              onMaximize={() => toggleMaximize(window.id)}
              onClose={() => close(window.id)}
              titleBarProps={{ onDoubleClick: () => toggleMaximize(window.id), style: { touchAction: "none" } }}
              style={{ height: "100%" }}
            >
              <WindowRenderer window={window} theme={document.theme} allWindows={document.windows} onOpenWindow={openWindow} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialPostId={window.id === initialOpenId ? initialPostId : undefined} navigation={navigation} publicShareBaseUrl={publicShareBaseUrl} siteHandle={siteHandle} />
            </RetroWindow>
            {!state.maximized ? <span className="window-resize-handle" aria-hidden="true" /> : null}
          </div>
        );
      })}

      <DesktopTaskbar
        document={document}
        visitor
        tasks={document.windows.map((desktopWindow) => ({
          window: desktopWindow,
          visible: runtime[desktopWindow.id]?.status !== "closed",
          active: runtime[desktopWindow.id]?.status === "open" && runtime[desktopWindow.id]?.z === topZ,
          statusLabel: music.windowId === desktopWindow.id && music.status === "playing" ? tr("desktopCanvas.playing") : undefined
        }))}
        onOpen={openWindow}
        onToggle={taskbarToggle}
      />
    </div>
  );
}
