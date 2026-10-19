import { describe, expect, it } from "vitest";
import { makeWindow } from "@retrodesk/shared";
import { boundedPreviewScroll, boundedPreviewZoom, centeredPreviewScroll, createDesktopPreviewSession, desktopPointerDelta, desktopPreviewGeometry, desktopPreviewSize } from "./desktopPreviewGeometry";

const desktop = { width: 1024, height: 768 };
describe("desktop preview geometry", () => {
  it.each([{ width: 320, height: 560 }, { width: 390, height: 620 }, { width: 430, height: 660 }, { width: 667, height: 180 }, { width: 767, height: 650 }, { width: 768, height: 650 }])("fits the full source into %j without horizontal/vertical clipping", (viewport) => {
    const result = desktopPreviewGeometry(desktop, viewport, "fit");
    expect(result.width).toBeLessThanOrEqual(viewport.width);
    expect(result.height).toBeLessThanOrEqual(viewport.height);
    expect(result.scale).toBeGreaterThan(0);
    expect(boundedPreviewScroll(result, { left: 1000, top: 1000 })).toEqual({ left: 0, top: 0 });
  });
  it("keeps one source-sized desktop across browser sizes and includes authored window/icon extents", () => {
    const window = makeWindow("document");
    window.layout.desktop = { ...window.layout.desktop, x: 1000, y: 900, w: 400, h: 300, iconX: 1500, iconY: 1000 };
    const before = structuredClone(window);
    expect(desktopPreviewSize([window])).toEqual({ width: 1588, height: 1242 });
    expect(window).toEqual(before);
    expect(desktopPreviewSize([])).toEqual(desktop);
  });
  it("bounds manual zoom and never enlarges fit beyond actual size", () => {
    expect(boundedPreviewZoom(0)).toBe(0.25);
    expect(boundedPreviewZoom(100)).toBe(2);
    expect(boundedPreviewZoom(Number.NaN)).toBe(1);
    expect(desktopPreviewGeometry(desktop, { width: 2000, height: 2000 }, "fit").scale).toBe(1);
  });
  it("retains the logical center on zoom and clamps pan within the canvas", () => {
    const viewport = { width: 320, height: 400 };
    const previous = desktopPreviewGeometry(desktop, viewport, 1);
    const next = desktopPreviewGeometry(desktop, viewport, 1.5);
    expect(centeredPreviewScroll(previous, next, { left: 300, top: 100 })).toEqual({ left: 530, top: 250 });
    expect(boundedPreviewScroll(previous, { left: -200, top: 5000 })).toEqual({ left: 0, top: 368 });
  });
  it("converts actual screen pointer movement for zoomed move/resize without touching public scale 1", () => {
    expect(desktopPointerDelta(30, 15, 0.3)).toEqual({ dx: 100, dy: 50 });
    expect(desktopPointerDelta(150, 75, 1.5)).toEqual({ dx: 100, dy: 50 });
    expect(desktopPointerDelta(30, 15)).toEqual({ dx: 30, dy: 15 });
    expect(desktopPointerDelta(30, 15, 0)).toEqual({ dx: 30, dy: 15 });
  });
  it("creates independent session state, with fit/pan reset for reopen", () => {
    const first = createDesktopPreviewSession(); first.zoom = 2; first.scroll.left = 200; first.pan = true;
    expect(createDesktopPreviewSession()).toEqual({ zoom: "fit", scroll: { left: 0, top: 0 }, pan: false });
  });
});
