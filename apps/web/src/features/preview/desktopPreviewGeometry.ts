import type { DesktopWindow } from "@retrodesk/shared";

export type Size = { width: number; height: number };
export type ScrollPosition = { left: number; top: number };
export type PreviewZoom = "fit" | number;
export type DesktopPreviewSession = { zoom: PreviewZoom; scroll: ScrollPosition; pan: boolean };
export const createDesktopPreviewSession = (): DesktopPreviewSession => ({ zoom: "fit", scroll: { left: 0, top: 0 }, pan: false });
export const MIN_PREVIEW_ZOOM = 0.25;
export const MAX_PREVIEW_ZOOM = 2;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
export const boundedPreviewZoom = (value: number) => clamp(Number.isFinite(value) ? value : 1, MIN_PREVIEW_ZOOM, MAX_PREVIEW_ZOOM);

/** Stable source geometry: resizing the browser never rewrites authored positions. */
export function desktopPreviewSize(windows: DesktopWindow[]): Size {
  return windows.reduce((size, window, index) => {
    const layout = window.layout.desktop;
    return {
      width: Math.max(size.width, layout.x + layout.w + 4, (layout.iconX ?? 16 + Math.floor(index / 7) * 88) + 88),
      height: Math.max(size.height, layout.y + layout.h + 42, (layout.iconY ?? 18 + (index % 7) * 78) + 116)
    };
  }, { width: 1024, height: 768 });
}
export function desktopPreviewGeometry(desktop: Size, viewport: Size, zoom: PreviewZoom) {
  const scale = zoom === "fit"
    ? viewport.width > 0 && viewport.height > 0 ? Math.min(1, viewport.width / desktop.width, viewport.height / desktop.height) : 1
    : boundedPreviewZoom(zoom);
  const width = desktop.width * scale, height = desktop.height * scale;
  return {
    viewport, scale, width, height,
    left: Math.max(0, (viewport.width - width) / 2), top: Math.max(0, (viewport.height - height) / 2),
    scrollWidth: Math.max(viewport.width, width), scrollHeight: Math.max(viewport.height, height)
  };
}
export type DesktopPreviewGeometry = ReturnType<typeof desktopPreviewGeometry>;
export function boundedPreviewScroll(geometry: DesktopPreviewGeometry, scroll: ScrollPosition): ScrollPosition {
  return { left: clamp(scroll.left, 0, Math.max(0, geometry.width - geometry.viewport.width)), top: clamp(scroll.top, 0, Math.max(0, geometry.height - geometry.viewport.height)) };
}
export function centeredPreviewScroll(previous: DesktopPreviewGeometry, next: DesktopPreviewGeometry, scroll: ScrollPosition): ScrollPosition {
  return boundedPreviewScroll(next, {
    left: ((scroll.left + previous.viewport.width / 2 - previous.left) / previous.scale) * next.scale + next.left - next.viewport.width / 2,
    top: ((scroll.top + previous.viewport.height / 2 - previous.top) / previous.scale) * next.scale + next.top - next.viewport.height / 2
  });
}
/** Pointer coordinates are screen pixels; visitor runtime positions are desktop pixels. */
export function desktopPointerDelta(dx: number, dy: number, scale = 1) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { dx: dx / safeScale, dy: dy / safeScale };
}
