import type { MoodboardElement } from "@retrodesk/shared";
import { clamp } from "./editing";

export type Rect = { x: number; y: number; width: number; height: number };
export type BoardSize = { width: number; height: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export function selectionBounds(elements: Rect[]): Rect | null {
  if (!elements.length) return null;
  const x = Math.min(...elements.map((item) => item.x));
  const y = Math.min(...elements.map((item) => item.y));
  return { x, y, width: Math.max(...elements.map((item) => item.x + item.width)) - x, height: Math.max(...elements.map((item) => item.y + item.height)) - y };
}

/** A single bounded delta keeps the spacing of the entire movable selection intact. */
export function moveSelection(elements: MoodboardElement[], ids: ReadonlySet<string>, dx: number, dy: number, board: BoardSize) {
  const movable = elements.filter((item) => ids.has(item.id) && !item.locked);
  const bounds = selectionBounds(movable);
  if (!bounds) return elements;
  const x = clamp(dx, -bounds.x, Math.max(0, board.width - bounds.x - bounds.width));
  const y = clamp(dy, -bounds.y, Math.max(0, board.height - bounds.y - bounds.height));
  return elements.map((item) => ids.has(item.id) && !item.locked ? { ...item, x: item.x + x, y: item.y + y } : item);
}

const anchors = (start: number, length: number) => [start, start + length / 2, start + length];
export function snapMovement(bounds: Rect, dx: number, dy: number, others: Rect[], board: BoardSize, scale: number, disabled = false) {
  const limit = 6 / Math.max(scale, 0.001);
  const axis = (start: number, size: number, delta: number, extent: number, targets: number[]) => {
    const bounded = clamp(delta, -start, Math.max(0, extent - start - size));
    let best = limit + 0.00001;
    let result = bounded;
    let guide: number | null = null;
    if (!disabled) for (const target of targets) for (const anchor of anchors(start + bounded, size)) {
      const correction = target - anchor;
      const candidate = bounded + correction;
      if (Math.abs(correction) < best && start + candidate >= 0 && start + candidate + size <= extent) {
        best = Math.abs(correction); result = candidate; guide = target;
      }
    }
    return { delta: result, guide };
  };
  const horizontal = axis(bounds.x, bounds.width, dx, board.width, [0, board.width / 2, board.width, ...others.flatMap((item) => anchors(item.x, item.width))]);
  const vertical = axis(bounds.y, bounds.height, dy, board.height, [0, board.height / 2, board.height, ...others.flatMap((item) => anchors(item.y, item.height))]);
  return { dx: horizontal.delta, dy: vertical.delta, x: horizontal.guide, y: vertical.guide };
}

/** Anchor the opposite corner; clamp the common ratio, rather than distorting at an edge. */
export function resizeRect(rect: Rect, handle: Handle, dx: number, dy: number, board: BoardSize, proportional: boolean): Rect {
  const west = handle.includes("w"), east = handle.includes("e"), north = handle.includes("n"), south = handle.includes("s");
  const corner = (west || east) && (north || south);
  let width = rect.width + (west ? -dx : east ? dx : 0);
  let height = rect.height + (north ? -dy : south ? dy : 0);
  const maxWidth = west ? rect.x + rect.width : board.width - rect.x;
  const maxHeight = north ? rect.y + rect.height : board.height - rect.y;
  if (proportional && corner) {
    const candidate = Math.abs(dx / rect.width) > Math.abs(dy / rect.height) ? width / rect.width : height / rect.height;
    const ratio = clamp(candidate, Math.max(24 / rect.width, 24 / rect.height), Math.min(maxWidth / rect.width, maxHeight / rect.height));
    width = rect.width * ratio; height = rect.height * ratio;
  } else {
    width = clamp(width, 24, Math.max(24, maxWidth));
    height = clamp(height, 24, Math.max(24, maxHeight));
  }
  return { x: west ? rect.x + rect.width - width : rect.x, y: north ? rect.y + rect.height - height : rect.y, width, height };
}

export function imageRect(natural: BoardSize, board: BoardSize, point?: { x: number; y: number }): Rect {
  const ratio = Math.max(0.001, natural.width / Math.max(1, natural.height));
  const fit = Math.min(1, Math.min(320, board.width * 0.4) / Math.max(1, natural.width), board.height * 0.6 / Math.max(1, natural.height));
  // Extremely narrow sources cannot meet both minimum dimensions at their natural ratio.
  const width = clamp(Math.max(24, natural.width * fit), 24, board.width);
  const height = clamp(Math.max(24, width / ratio), 24, board.height);
  return { x: clamp(point?.x ?? (board.width - width) / 2, 0, board.width - width), y: clamp(point?.y ?? (board.height - height) / 2, 0, board.height - height), width, height };
}
