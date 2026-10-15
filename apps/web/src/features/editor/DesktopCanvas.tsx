import { useRef, useState, type PointerEvent } from "react";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { RetroWindow } from "../../components/RetroWindow";
import { WindowRenderer } from "../site/WindowRenderer";

type Gesture =
  | { kind: "move"; id: string; startX: number; startY: number; x: number; y: number; w: number; h: number }
  | { kind: "resize"; id: string; startX: number; startY: number; x: number; y: number; w: number; h: number }
  | { kind: "icon"; id: string; startX: number; startY: number; x: number; y: number };

type Props = {
  document: SiteDocument;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
  onIconMove: (id: string, x: number, y: number) => void;
  siteId?: string;
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
  onUpdateWindow?: (id: string, recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
};

export function DesktopCanvas({ document, selectedId, onSelect, onFocus, onMove, onResize, onIconMove, siteId, upload, onUpdateWindow }: Props) {
  const drag = useRef<Gesture | null>(null);
  // View-only state: never written to the document or saved.
  const [view, setView] = useState<Record<string, "min" | "closed" | "max">>({});
  const setViewState = (id: string, next: "min" | "closed" | "max" | null) =>
    setView((current) => {
      const copy = { ...current };
      if (next) copy[id] = next; else delete copy[id];
      return copy;
    });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  function canvasBounds() {
    const canvas = canvasRef.current;
    return {
      width: canvas?.clientWidth ?? 1200,
      height: Math.max(200, (canvas?.clientHeight ?? 800) - 36)
    };
  }

  function windowPointerDown(event: PointerEvent<HTMLDivElement>, window: DesktopWindow) {
    const target = event.target as HTMLElement;
    if (target.closest(".titlebar-controls")) return;

    if (view[window.id] === "max") { onFocus(window.id); return; }
    const layout = window.layout.desktop;
    if (target.closest(".window-resize-handle")) {
      drag.current = {
        kind: "resize",
        id: window.id,
        startX: event.clientX,
        startY: event.clientY,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h
      };
    } else if (target.closest(".retro-titlebar")) {
      drag.current = {
        kind: "move",
        id: window.id,
        startX: event.clientX,
        startY: event.clientY,
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h
      };
    } else {
      return;
    }

    onFocus(window.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function windowPointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.kind === "icon") return;
    const bounds = canvasBounds();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (gesture.kind === "move") {
      const x = Math.min(Math.max(0, gesture.x + dx), Math.max(0, bounds.width - gesture.w));
      const y = Math.min(Math.max(0, gesture.y + dy), Math.max(0, bounds.height - 32));
      event.currentTarget.style.transform = `translate(${x}px, ${y}px)`;
      return;
    }

    const w = Math.min(Math.max(220, gesture.w + dx), Math.max(220, bounds.width - gesture.x));
    const h = Math.min(Math.max(140, gesture.h + dy), Math.max(140, bounds.height - gesture.y));
    event.currentTarget.style.width = w + "px";
    event.currentTarget.style.height = h + "px";
  }

  function windowPointerUp(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.kind === "icon") return;
    const bounds = canvasBounds();
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;

    if (gesture.kind === "move") {
      const x = Math.round(Math.min(Math.max(0, gesture.x + dx), Math.max(0, bounds.width - gesture.w)));
      const y = Math.round(Math.min(Math.max(0, gesture.y + dy), Math.max(0, bounds.height - 32)));
      onMove(gesture.id, x, y);
    } else {
      const w = Math.round(Math.min(Math.max(220, gesture.w + dx), Math.max(220, bounds.width - gesture.x)));
      const h = Math.round(Math.min(Math.max(140, gesture.h + dy), Math.max(140, bounds.height - gesture.y)));
      onResize(gesture.id, w, h);
    }

    drag.current = null;
  }

  function iconPointerDown(event: PointerEvent<HTMLButtonElement>, window: DesktopWindow, index: number) {
    const layout = window.layout.desktop;
    drag.current = {
      kind: "icon",
      id: window.id,
      startX: event.clientX,
      startY: event.clientY,
      x: layout.iconX ?? 16 + Math.floor(index / 7) * 88,
      y: layout.iconY ?? 18 + (index % 7) * 78
    };
    onFocus(window.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  function iconPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.kind !== "icon") return;
    const bounds = canvasBounds();
    const x = Math.min(Math.max(0, gesture.x + event.clientX - gesture.startX), Math.max(0, bounds.width - 82));
    const y = Math.min(Math.max(0, gesture.y + event.clientY - gesture.startY), Math.max(0, bounds.height - 70));
    event.currentTarget.style.left = x + "px";
    event.currentTarget.style.top = y + "px";
  }

  function iconPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.kind !== "icon") return;
    const bounds = canvasBounds();
    const x = Math.round(Math.min(Math.max(0, gesture.x + event.clientX - gesture.startX), Math.max(0, bounds.width - 82)));
    const y = Math.round(Math.min(Math.max(0, gesture.y + event.clientY - gesture.startY), Math.max(0, bounds.height - 70)));
    onIconMove(gesture.id, x, y);
    drag.current = null;
    event.stopPropagation();
  }

  const theme = document.theme;
  const pattern = theme.pattern === "dots"
    ? `radial-gradient(${theme.patternColor} 1.5px, transparent 1.7px)`
    : theme.pattern === "checker"
      ? `conic-gradient(${theme.patternColor} 25%, transparent 0 50%, ${theme.patternColor} 0 75%, transparent 0)`
      : "none";

  return (
    <div
      ref={canvasRef}
      className="desktop-canvas"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }}
      style={{
        backgroundColor: theme.wall,
        backgroundImage: theme.wallImage ? `url(${theme.wallImage})` : pattern,
        backgroundSize: theme.wallImage ? "cover" : theme.pattern === "checker" ? "28px 28px" : "16px 16px"
      }}
    >
      {document.windows.map((window, index) => {
        const layout = window.layout.desktop;
        const iconX = layout.iconX ?? 16 + Math.floor(index / 7) * 88;
        const iconY = layout.iconY ?? 18 + (index % 7) * 78;
        return (
          <button
            key={"icon-" + window.id}
            type="button"
            className={"editor-desktop-icon " + (selectedId === window.id ? "selected" : "")}
            style={{ left: iconX, top: iconY }}
            onClick={() => { setViewState(window.id, null); onFocus(window.id); }}
            onPointerDown={(event) => iconPointerDown(event, window, index)}
            onPointerMove={iconPointerMove}
            onPointerUp={iconPointerUp}
          >
            <span className="file-icon" />
            <small>{window.title}</small>
          </button>
        );
      })}

      {document.windows.map((window) => {
        const layout = window.layout.desktop;
        const state = view[window.id];
        if (state === "min" || state === "closed") return null;
        const maximized = state === "max";
        return (
          <div
            key={window.id}
            className={`canvas-window ${selectedId === window.id ? "selected" : ""}`}
            style={maximized
              ? { width: "calc(100% - 8px)", height: "calc(100% - 44px)", transform: "translate(4px, 4px)", zIndex: layout.z }
              : { width: layout.w, height: layout.h, transform: `translate(${layout.x}px, ${layout.y}px)`, zIndex: layout.z }}
            onClick={() => onFocus(window.id)}
            onPointerDown={(event) => windowPointerDown(event, window)}
            onPointerMove={windowPointerMove}
            onPointerUp={windowPointerUp}
            onPointerCancel={() => { drag.current = null; }}
          >
            <RetroWindow
              title={window.title}
              theme={theme}
              active={selectedId === window.id}
              interactiveControls
              maximized={maximized}
              onMinimize={() => setViewState(window.id, "min")}
              onMaximize={() => setViewState(window.id, maximized ? null : "max")}
              onClose={() => setViewState(window.id, "closed")}
              style={{ height: "100%" }}
            >
              <WindowRenderer window={window} theme={theme} editing allWindows={document.windows} siteId={siteId} upload={upload} onUpdate={onUpdateWindow} />
            </RetroWindow>
            {!maximized ? <span className="window-resize-handle" aria-hidden="true" /> : null}
          </div>
        );
      })}

      <div className="taskbar" style={{ background: theme.taskbar }}>
        <button type="button">開始</button>
        <span>{document.siteName}</span>
        {document.windows.filter((window) => view[window.id] === "min").map((window) => (
          <button key={window.id} type="button" onClick={() => { setViewState(window.id, null); onFocus(window.id); }}>{window.title}</button>
        ))}
      </div>
    </div>
  );
}
