import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopWindow } from "@retrodesk/shared";
import { boundedPreviewScroll, boundedPreviewZoom, centeredPreviewScroll, createDesktopPreviewSession, desktopPreviewGeometry, desktopPreviewSize, MAX_PREVIEW_ZOOM, MIN_PREVIEW_ZOOM, type DesktopPreviewGeometry, type DesktopPreviewSession, type PreviewZoom } from "./desktopPreviewGeometry";
import styles from "./DesktopPreviewViewport.module.css";

type Props = { windows: DesktopWindow[]; session?: DesktopPreviewSession; children: (scale: number) => ReactNode };

/** One renderer in a measured, scrollable simulation. No editor/store/API dependency. */
export function DesktopPreviewViewport({ windows, session, children }: Props) {
  const { t } = useTranslation("editor");
  const local = useRef(createDesktopPreviewSession()).current;
  const saved = session ?? local;
  const [zoom, setZoom] = useState<PreviewZoom>(saved.zoom);
  const [pan, setPan] = useState(saved.pan);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement | null>(null);
  const previous = useRef<DesktopPreviewGeometry | null>(null);
  const lastScroll = useRef(saved.scroll);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const helpId = useId();
  const desktop = useMemo(() => desktopPreviewSize(windows), [windows]);
  const geometry = useMemo(() => desktopPreviewGeometry(desktop, size, zoom), [desktop, size, zoom]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setSize((value) => element.clientWidth === value.width && element.clientHeight === value.height ? value : { width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !size.width || !size.height) return;
    const position = previous.current ? centeredPreviewScroll(previous.current, geometry, lastScroll.current) : boundedPreviewScroll(geometry, saved.scroll);
    element.scrollLeft = position.left; element.scrollTop = position.top;
    saved.scroll = position; lastScroll.current = position;
    previous.current = geometry;
  }, [geometry, saved, size]);

  const chooseZoom = (next: PreviewZoom) => {
    if (viewport.current) lastScroll.current = { left: viewport.current.scrollLeft, top: viewport.current.scrollTop };
    saved.zoom = next; setZoom(next);
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section className={styles.root} data-desktop-preview-viewport data-preview-scale={geometry.scale}>
    <div className={styles.controls} role="group" aria-label={t("desktopPreviewViewport.controls")}>
      <button type="button" className="w98-btn" aria-pressed={zoom === "fit"} onClick={() => chooseZoom("fit")}>{t("desktopPreviewViewport.fit")}</button>
      <button type="button" className="w98-btn" aria-pressed={zoom === 1} onClick={() => chooseZoom(1)}>{t("desktopPreviewViewport.actualSize")}</button>
      <button type="button" className="w98-btn" aria-label={t("desktopPreviewViewport.zoomOut")} disabled={geometry.scale <= MIN_PREVIEW_ZOOM} onClick={() => chooseZoom(boundedPreviewZoom(Math.round((geometry.scale - 0.25) * 4) / 4))}>−</button>
      <output className={styles.level} aria-live="polite" aria-label={t("desktopPreviewViewport.zoom")}>{t("desktopPreviewViewport.zoomLevel", { percent: Math.round(geometry.scale * 100) })}</output>
      <button type="button" className="w98-btn" aria-label={t("desktopPreviewViewport.zoomIn")} disabled={geometry.scale >= MAX_PREVIEW_ZOOM} onClick={() => chooseZoom(boundedPreviewZoom(Math.round((geometry.scale + 0.25) * 4) / 4))}>+</button>
      <button type="button" className="w98-btn" aria-pressed={pan} onClick={() => { saved.pan = !pan; setPan(!pan); viewport.current?.focus(); }}>{t("desktopPreviewViewport.pan")}</button>
      <span id={helpId} className={styles.hint}>{t(pan ? "desktopPreviewViewport.panHelp" : "desktopPreviewViewport.interactHelp")}</span>
    </div>
    <div ref={viewport} className={`${styles.viewport}${pan ? ` ${styles.pan}` : ""}`} role="region" tabIndex={0} aria-label={t("desktopPreviewViewport.region")} aria-describedby={helpId}
      onScroll={(event) => { saved.scroll = { left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; lastScroll.current = saved.scroll; }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        event.currentTarget.scrollLeft += event.key === "ArrowLeft" ? -64 : event.key === "ArrowRight" ? 64 : 0;
        event.currentTarget.scrollTop += event.key === "ArrowUp" ? -64 : event.key === "ArrowDown" ? 64 : 0;
      }}
      onClickCapture={(event) => { if (pan) { event.preventDefault(); event.stopPropagation(); } }}
      onPointerDownCapture={(event) => {
        if (!pan || drag.current || event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); event.stopPropagation();
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
        event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
      }}
      onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}>
      <div className={styles.space} style={{ width: geometry.scrollWidth, height: geometry.scrollHeight }}>
        <div className={styles.canvas} data-desktop-preview-canvas style={{ width: desktop.width, height: desktop.height, left: geometry.left, top: geometry.top, transform: `scale(${geometry.scale})`, visibility: size.width && size.height ? "visible" : "hidden" }}>{children(geometry.scale)}</div>
      </div>
    </div>
  </section>;
}
