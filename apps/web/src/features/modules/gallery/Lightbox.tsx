import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { GalleryImage } from "@retrodesk/shared";
import { lockBackground } from "../../../lib/backgroundLock";
import { SafeImg } from "../ui";
import type { ModuleCtx } from "../types";

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex='-1'])";

type Props = {
  images: GalleryImage[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  ctx: Pick<ModuleCtx, "tv" | "onLink">;
};

/**
 * Full-viewport image viewer. It renders into document.body so the desktop window's transform,
 * clipping and stacking order cannot shrink or cover it, and it makes the page behind inert.
 */
export function Lightbox({ images, index, onIndex, onClose, ctx }: Props) {
  const root = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ index, count: images.length, onIndex, onClose });
  latest.current = { index, count: images.length, onIndex, onClose };
  const image = images[index];
  const { tv } = ctx;
  const n = images.length;
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel };

  useEffect(() => lockBackground(), []);

  // One capture-phase listener so Escape, arrows and Tab work wherever focus ended up
  // (for example after clicking the dark backdrop) and never reach the editor behind.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const { index: current, count, onIndex: setIndex, onClose: close } = latest.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        if (count > 1) setIndex((current + (event.key === "ArrowLeft" ? -1 : 1) + count) % count);
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

  // React events bubble through portals to the window that owns the gallery (and would start a drag there).
  const contain = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return createPortal(
    <div
      ref={root}
      className="lb-root"
      role="dialog"
      aria-modal="true"
      aria-label="圖片檢視"
      onPointerDown={contain}
      onMouseDown={contain}
      onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
      onDoubleClick={contain}
      onWheel={contain}
      onTouchStart={contain}
      onContextMenu={contain}
    >
      <div className="lb-bar">
        <span className="lb-count">{index + 1} / {n}</span>
        <button type="button" className="lb-btn sq32" style={btn} aria-label="關閉" onClick={onClose} autoFocus>×</button>
      </div>
      <div className="lb-stage" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        {image.src
          ? <SafeImg key={image.src} src={image.src} alt={image.caption || image.title} className="lb-img" />
          : <div className="ph lb-placeholder" />}
      </div>
      <div className="lb-foot">
        <button type="button" className="lb-btn sq36" style={btn} aria-label="上一張" disabled={n < 2} onClick={() => onIndex((index - 1 + n) % n)}>‹</button>
        <div className="lb-cap">
          <strong>{image.title}</strong>
          <span>{image.caption}</span>
          {image.href ? <button type="button" className="lb-btn" style={btn} onClick={() => ctx.onLink({ target: "url", url: image.href, label: image.title })}>開啟連結 ↗</button> : null}
        </div>
        <button type="button" className="lb-btn sq36" style={btn} aria-label="下一張" disabled={n < 2} onClick={() => onIndex((index + 1) % n)}>›</button>
      </div>
    </div>,
    globalThis.document.body
  );
}
