import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { useThemeView } from "../../lib/themeView";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useLocaleFormatting } from "../../i18n/format";

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

const readClock = () => new Date();

function useLocalClock() {
  const [clock, setClock] = useState(readClock);

  useEffect(() => {
    let timeout = 0;
    const schedule = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timeout = window.setTimeout(() => {
        setClock(readClock());
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeout);
  }, []);

  return clock;
}

export function DesktopTaskbar({ document, tasks, onOpen, onToggle, visitor = false }: Props) {
  const { t } = useTranslation("common");
  const { formatDate, formatTime, fontFamily } = useLocaleFormatting();
  const [startOpen, setStartOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = `desktop-start-${useId().replaceAll(":", "")}`;
  const now = useLocalClock();
  const clock = formatTime(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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
    <div ref={rootRef} className="desktop-chrome" style={{ fontFamily }}>
      {startOpen ? (
        <div id={menuId} className="start-menu" style={{ background: tv.face, boxShadow: tv.bevel, width: "min(320px, calc(100vw - 12px))", maxHeight: "70vh", overflowY: "auto" }}>
          <div className="start-brand" aria-hidden="true" style={{ background: tv.titleBgV, color: tv.titleText }}>{document.siteName}</div>
          <div className="start-items">
            {document.windows.length ? (
              <div role="menu" aria-label={t("desktop.startMenu")}>
                {document.windows.map((desktopWindow) => (
                  <button
                    key={desktopWindow.id}
                    type="button"
                    role="menuitem"
                    className="start-item"
                    style={{ color: tv.text, width: "100%" }}
                    onClick={() => chooseWindow(desktopWindow.id)}
                  >
                    <Icon name={desktopWindow.icon} size={22} />
                    <span>{desktopWindow.title}</span>
                  </button>
                ))}
              </div>
            ) : <span className="start-empty">{t("desktop.empty")}</span>}
            <div className="w98-sep" />
            <div style={{ padding: "4px 8px" }}><LanguageSwitcher /></div>
            <small className="start-credit">{t("desktop.credit")}</small>
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
          <Icon name="computer" size={18} />{t("desktop.start")}
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
        <time className="clock taskbar-clock visitor-clock" dateTime={now.toISOString()} title={formatDate(now, { dateStyle: "full" })} aria-label={t("desktop.clockLabel", { time: clock })} style={{ color: tv.taskbarText, boxShadow: `inset -1px -1px #ffffff, inset 1px 1px ${tv.shadow}` }}>{clock}</time>
      </div>
    </div>
  );
}
