import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { lockBackground } from "../lib/backgroundLock";

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons rendered in the footer, right-aligned. */
  actions?: ReactNode;
  /** Close when the dark backdrop is clicked. Defaults to true. */
  dismissOnBackdrop?: boolean;
  width?: number;
};

/**
 * Modal dialog rendered into document.body so a draggable window cannot clip or cover it.
 * Escape closes, Tab stays inside, the page behind is inert, and focus returns to where it was.
 */
export function ModalDialog({ title, onClose, children, actions, dismissOnBackdrop = true, width = 460 }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => lockBackground(), []);

  useEffect(() => {
    const doc = globalThis.document;
    const previous = doc.activeElement as HTMLElement | null;
    const first = root.current?.querySelector<HTMLElement>("[data-autofocus]") ?? root.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      // Give focus back only if nothing else claimed it (a field the dialog's action just created keeps it).
      const current = doc.activeElement;
      if (previous?.isConnected && (!current || current === doc.body)) previous.focus();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
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
      if (!first || !last) { event.preventDefault(); return; }
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
      onPointerDown={contain}
      onMouseDown={contain}
      onDoubleClick={contain}
      onWheel={contain}
      onContextMenu={contain}
      onClick={(event) => { event.stopPropagation(); if (dismissOnBackdrop && event.target === event.currentTarget) onClose(); }}
    >
      <div ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-card w98-window" style={{ width: `min(${width}px, 100%)` }}>
        <div className="w98-titlebar"><strong id={titleId} className="grow">{title}</strong><button type="button" className="w98-titlebtn" aria-label="關閉" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-actions">{actions}</div> : null}
      </div>
    </div>,
    globalThis.document.body
  );
}
