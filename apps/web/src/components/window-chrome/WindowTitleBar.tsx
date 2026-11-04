import type { MouseEvent, PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { WindowControlAction } from "@retrodesk/shared";
import type { WindowTitleBarProps } from "./types";
import styles from "./WindowChrome.module.css";

const order: readonly WindowControlAction[] = ["minimize", "maximize", "close"];

/** The class hooks are part of the existing window managers' gesture contract. */
export function WindowTitleBar({ title, icon, controls, interactive = false, maximized = false, leading, trailing, titleBarProps, controlLabels, onMinimize, onMaximize, onClose }: WindowTitleBarProps) {
  const { t: tr } = useTranslation("editor");
  const stopPointer = (event: PointerEvent) => event.stopPropagation();
  const stopDoubleClick = (event: MouseEvent) => event.stopPropagation();
  const handlers = { minimize: onMinimize, maximize: onMaximize, close: onClose };
  const labels = { minimize: tr("windowTitleBar.minimize"), maximize: maximized ? tr("windowTitleBar.restore") : tr("windowTitleBar.maximize"), close: tr("editor.close"), ...controlLabels };
  // Canonical order and a bounded allowlist even for callers outside the schema boundary.
  const visibleControls = order.filter((action) => controls.includes(action));
  return (
    <div
      {...titleBarProps}
      className={`${styles.titleBar} retro-titlebar ${titleBarProps?.className ?? ""}`}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [data-window-no-drag]")) return;
        if (interactive && controls.includes("maximize") && onMaximize) titleBarProps?.onDoubleClick?.(event);
      }}
    >
      {leading ? <span className={styles.titleAccessory} data-window-no-drag onPointerDown={stopPointer} onDoubleClick={stopDoubleClick}>{leading}</span> : null}
      {icon ? <span className={styles.titleIcon} aria-hidden="true">{icon}</span> : null}
      <strong className={`${styles.titleText} retro-title-text`} title={title}>{title}</strong>
      {trailing ? <span className={styles.titleAccessory} data-window-no-drag onPointerDown={stopPointer} onDoubleClick={stopDoubleClick}>{trailing}</span> : null}
      {visibleControls.length > 0 ? (
        <span className={`${styles.controls} titlebar-controls`} aria-hidden={interactive ? undefined : true} onPointerDown={stopPointer} onDoubleClick={stopDoubleClick}>
          {visibleControls.map((action) => {
            const glyph = <span className={styles.controlFace} aria-hidden="true"><i className={`${styles.glyph} ${styles[action === "maximize" && maximized ? "restore" : action]}`} /></span>;
            return interactive ? (
              <button
                key={action}
                type="button"
                className={`${styles.control} tb-${action === "minimize" ? "min" : action === "maximize" ? "max" : "close"}${action === "maximize" && maximized ? " restored" : ""}`}
                aria-label={labels[action]}
                title={labels[action]}
                disabled={!handlers[action]}
                onClick={(event) => { event.stopPropagation(); handlers[action]?.(); }}
              >{glyph}</button>
            ) : <span key={action} className={`${styles.control} ${styles.decorativeControl}`}>{glyph}</span>;
          })}
        </span>
      ) : null}
    </div>
  );
}
