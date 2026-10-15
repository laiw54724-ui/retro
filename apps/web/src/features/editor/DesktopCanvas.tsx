import { useRef, type PointerEvent } from "react";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { RetroWindow } from "../../components/RetroWindow";
import { WindowRenderer } from "../site/WindowRenderer";

export function DesktopCanvas({ document, selectedId, onSelect, onMove }: {
  document: SiteDocument;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);

  function pointerDown(event: PointerEvent<HTMLDivElement>, window: DesktopWindow) {
    if (!(event.target as HTMLElement).closest(".retro-titlebar")) return;
    drag.current = { id: window.id, startX: event.clientX, startY: event.clientY, x: window.layout.desktop.x, y: window.layout.desktop.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const nextX = Math.max(0, drag.current.x + event.clientX - drag.current.startX);
    const nextY = Math.max(0, drag.current.y + event.clientY - drag.current.startY);
    event.currentTarget.style.transform = `translate(${nextX}px, ${nextY}px)`;
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const nextX = Math.max(0, drag.current.x + event.clientX - drag.current.startX);
    const nextY = Math.max(0, drag.current.y + event.clientY - drag.current.startY);
    onMove(drag.current.id, Math.round(nextX), Math.round(nextY));
    drag.current = null;
  }

  const theme = document.theme;
  const pattern = theme.pattern === "dots"
    ? `radial-gradient(${theme.patternColor} 1.5px, transparent 1.7px)`
    : theme.pattern === "checker"
      ? `conic-gradient(${theme.patternColor} 25%, transparent 0 50%, ${theme.patternColor} 0 75%, transparent 0)`
      : "none";

  return (
    <div
      className="desktop-canvas"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }}
      style={{
        backgroundColor: theme.wall,
        backgroundImage: theme.wallImage ? `url(${theme.wallImage})` : pattern,
        backgroundSize: theme.wallImage ? "cover" : theme.pattern === "checker" ? "28px 28px" : "16px 16px"
      }}
    >
      {document.windows.map((window) => {
        const layout = window.layout.desktop;
        return (
          <div
            key={window.id}
            className={`canvas-window ${selectedId === window.id ? "selected" : ""}`}
            style={{ width: layout.w, height: layout.h, transform: `translate(${layout.x}px, ${layout.y}px)`, zIndex: layout.z }}
            onClick={() => onSelect(window.id)}
            onPointerDown={(event) => pointerDown(event, window)}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
          >
            <RetroWindow title={window.title} theme={theme} active={selectedId === window.id} style={{ height: "100%" }}>
              <WindowRenderer window={window} theme={theme} />
            </RetroWindow>
          </div>
        );
      })}
      <div className="taskbar" style={{ background: theme.taskbar }}><button type="button">開始</button><span>{document.siteName}</span></div>
    </div>
  );
}
