import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { lockBackground } from "../lib/backgroundLock";
import { currentOpener } from "../lib/openerFocus";

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

type Props = {
  role?: "dialog" | "alertdialog";
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons rendered in the footer, right-aligned. */
  actions?: ReactNode;
  /** Close when the dark backdrop is clicked. Defaults to true. */
  dismissOnBackdrop?: boolean;
  width?: number;
  /** Keep a local tool’s command shortcuts out of document history. */
  containShortcuts?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Keep a pending operation visible without allowing dismissal. */
  closeDisabled?: boolean;
};

/**
 * Modal dialog rendered into document.body so a draggable window cannot clip or cover it.
 * Escape closes, Tab stays inside, the page behind is inert, and focus returns to where it was.
 */
export function ModalDialog({ role = "dialog", title, onClose, children, actions, dismissOnBackdrop = true, width = 460, containShortcuts = false, className = "", bodyClassName = "", closeDisabled = false }: Props) {
  const { t: tr } = useTranslation("editor");
  const root = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const latestClose = useRef(onClose);
  latestClose.current = () => { if (!closeDisabled) onClose(); };

  useEffect(() => {
    const doc = globalThis.document;
    // Capture the opener before making its app root inert; unlock before returning focus.
    // Keep the original opener when StrictMode replays the effect with focus already inside.
    opener.current ??= currentOpener();
    const unlock = lockBackground();
    const first = root.current?.querySelector<HTMLElement>("[data-autofocus]") ?? root.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      unlock();
      // Give focus back only if nothing else claimed it (a field the dialog's action just created keeps it).
      const current = doc.activeElement;
      // WebKit moves focus to the nearest programmatic-focus container (tabindex=-1, e.g. the phone screen) when the focused
      // dialog control is removed, where Chromium leaves <body>: neither is something the person chose, so both count as unclaimed.
      const unclaimed = !current || current === doc.body || (current.getAttribute("tabindex") === "-1" && !current.matches("input, textarea, select, button, a[href], [contenteditable]"));
      if (opener.current?.isConnected && unclaimed) opener.current.focus();
    };
  }, []);

  useEffect(() => {
    const doc = globalThis.document;
    function onKey(event: KeyboardEvent) {
      const top = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')).filter((element) => element.getClientRects().length).at(-1);
      if (top !== root.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        latestClose.current();
        return;
      }
      if (event.key !== "Tab" || !root.current) return;
      event.stopPropagation();
      const controls = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); root.current.focus(); return; }
      const active = globalThis.document.activeElement;
      if (!root.current.contains(active)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, []);

  // React events bubble through portals to the draggable window that owns the dialog.
  const contain = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return createPortal(
    <div
      className="modal-root"
      onKeyDown={(event) => { if (containShortcuts && (event.ctrlKey || event.metaKey)) event.stopPropagation(); }}
      onPointerDown={contain}
      onMouseDown={contain}
      onDoubleClick={contain}
      onWheel={contain}
      onContextMenu={contain}
      onClick={(event) => { event.stopPropagation(); if (dismissOnBackdrop && event.target === event.currentTarget) latestClose.current(); }}
    >
      <div ref={root} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={titleId} className={`modal-card w98-window ${className}`} style={{ width: `min(${width}px, 100%)`, maxWidth: "calc(100vw - 32px)", minWidth: 0 }}>
        <div className="w98-titlebar"><strong id={titleId} className="grow">{title}</strong><button type="button" className="w98-titlebtn" aria-label={tr("editor.close")} disabled={closeDisabled} onClick={onClose}>×</button></div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    globalThis.document.body
  );
}
