import { useEffect, useId, useRef, useState } from "react";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { useThemeView } from "../../lib/themeView";

export type DesktopTask = {
  window: DesktopWindow;
  visible: boolean;
  active: boolean;
  statusLabel?: string;
};

type Props = {
  document: SiteDocument;
  tasks: DesktopTask[];
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  visitor?: boolean;
};

const formatClock = () => new Date().toTimeString().slice(0, 5);

function useLocalClock() {
  const [clock, setClock] = useState(formatClock);

  useEffect(() => {
    let timeout = 0;
    const schedule = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timeout = window.setTimeout(() => {
        setClock(formatClock());
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeout);
  }, []);

  return clock;
}

export function DesktopTaskbar({ document, tasks, onOpen, onToggle, visitor = false }: Props) {
  const [startOpen, setStartOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `desktop-start-${useId().replaceAll(":", "")}`;
  const clock = useLocalClock();
  const tv = useThemeView(document.theme);

  useEffect(() => {
    if (!startOpen) return;

    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setStartOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setStartOpen(false);
      window.requestAnimationFrame(() => startButtonRef.current?.focus());
    };

    globalThis.document.addEventListener("pointerdown", closeOutside);
    globalThis.document.addEventListener("keydown", closeOnEscape);
    return () => {
      globalThis.document.removeEventListener("pointerdown", closeOutside);
      globalThis.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [startOpen]);

  function chooseWindow(id: string) {
    onOpen(id);
    setStartOpen(false);
  }

  return (
    <div ref={rootRef} className="desktop-chrome">
      {startOpen ? (
        <div id={menuId} className="start-menu" role="menu" aria-label="開始功能表" style={{ background: tv.face, boxShadow: tv.bevel }}>
          <div className="start-brand" aria-hidden="true" style={{ background: tv.titleBgV }}>{document.siteName}</div>
          <div className="start-items">
            {document.windows.length ? document.windows.map((desktopWindow) => (
              <button
                key={desktopWindow.id}
                type="button"
                role="menuitem"
                className="start-item"
                style={{ color: tv.text }}
                onClick={() => chooseWindow(desktopWindow.id)}
              >
                <Icon name={desktopWindow.icon} size={22} />
                <span>{desktopWindow.title}</span>
              </button>
            )) : <span className="start-empty">目前沒有桌面項目</span>}
            <div className="w98-sep" />
            <small className="start-credit">Made with Retro Desktop</small>
          </div>
        </div>
      ) : null}

      <div className={`taskbar2${visitor ? " visitor-taskbar" : ""}`} style={{ background: tv.taskbar, boxShadow: `inset 0 1px ${tv.light}, inset 0 2px #ffffff` }}>
        <button
          ref={startButtonRef}
          type="button"
          className="start-btn"
          style={{ background: tv.face, color: tv.text, boxShadow: startOpen ? tv.pressed : tv.bevel }}
          aria-expanded={startOpen}
          aria-controls={menuId}
          onClick={() => setStartOpen((open) => !open)}
        >
          <Icon name="computer" size={18} />開始
        </button>
        <span className="tb-sep" aria-hidden="true" style={{ borderLeft: `1px solid ${tv.shadow}` }} />
        <div className={`task-items${visitor ? " visitor-task-buttons" : ""}`}>
          {tasks.filter((task) => task.visible).map((task) => (
            <button
              key={task.window.id}
              type="button"
              className={`task-item${task.active ? " active" : ""}`}
              style={{ background: task.active ? tv.light : tv.face, color: tv.text, fontWeight: task.active ? 700 : 400, boxShadow: task.active ? tv.pressed : tv.bevel }}
              onClick={() => onToggle(task.window.id)}
            >
              <Icon name={task.window.icon} size={16} />
              <span>{task.window.title}{task.statusLabel ? ` · ${task.statusLabel}` : ""}</span>
            </button>
          ))}
        </div>
        <time className="clock taskbar-clock visitor-clock" dateTime={clock} aria-label={`目前時間 ${clock}`} style={{ color: tv.taskbarText, boxShadow: `inset -1px -1px #ffffff, inset 1px 1px ${tv.shadow}` }}>{clock}</time>
      </div>
    </div>
  );
}
