import type { PaintTool } from "./engine";

/** Proposed Paint-only copy. Product locale catalogs are wired in W5b integration. */
export const englishPaintLabels = {
  title: "Paint canvas",
  tools: "Drawing tools",
  tool: {
    pencil: "Pencil", eraser: "Eraser", line: "Line", rectangle: "Rectangle",
    ellipse: "Ellipse", picker: "Color picker"
  } satisfies Record<PaintTool, string>,
  brushSize: "Brush size",
  color: "Current color",
  palette: "Colors",
  swatch: (color: string) => `Use ${color}`,
  filled: "Filled shape",
  zoom: "Zoom",
  newCanvas: "New canvas",
  canvasSize: "Canvas size",
  undo: "Undo",
  redo: "Redo",
  clear: "Clear",
  exportPng: "Export PNG",
  clearConfirm: "Clear this unsaved drawing? You can undo Clear.",
  newConfirm: "Discard this unsaved drawing and start a new canvas?",
  ready: "Ready",
  changed: "Unsaved changes",
  clean: "No unsaved changes",
  cleared: "Canvas cleared",
  newReady: "New canvas ready",
  picked: (color: string) => `Picked ${color}`,
  exported: "PNG downloaded to this device",
  exportFailed: "PNG export failed",
  keyboardHelp: "Canvas keyboard: arrows move the cursor, Shift moves ten pixels, Space starts or finishes a stroke or shape, Escape cancels. Ctrl or Command plus Z undoes; Shift plus Z redoes.",
  cursor: (x: number, y: number) => `Cursor ${x}, ${y}`,
  drawing: "Drawing",
  localOnly: "This drawing stays in this tab. Export downloads a local PNG."
};

export type PaintLabels = typeof englishPaintLabels;
