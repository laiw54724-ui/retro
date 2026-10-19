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
  importImage: "Import image",
  cancelImport: "Cancel import",
  importing: "Decoding local image…",
  imported: "Image added to this canvas as an undoable copy",
  importCancelled: "Image import cancelled",
  importDuringStroke: "Finish the active stroke before importing",
  importError: {
    type: "Choose a local PNG, JPEG, or WebP file",
    "file-size": "Image file must be between 1 byte and 8 MiB",
    dimensions: "Decoded image must be at most 2048 × 2048 pixels",
    decode: "This image could not be decoded",
    source: "Image pixels could not be read (source or CORS restriction)"
  },
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
  localOnly: "This drawing stays in this tab. Imported files remain unchanged; Export downloads a local PNG."
};

export type PaintLabels = typeof englishPaintLabels;
