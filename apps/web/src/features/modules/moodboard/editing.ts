import type { MoodboardElement } from "@retrodesk/shared";

export type GeometryField = "x" | "y" | "width" | "height";
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Stable ties follow the same array order used by the canvas and PNG renderer. */
export function orderedElements(elements: MoodboardElement[]) {
  return [...elements].sort((a, b) => a.zOrder - b.zOrder);
}

export function geometryRange(element: MoodboardElement, field: GeometryField, board: { width: number; height: number }) {
  const horizontal = field === "x" || field === "width";
  const extent = horizontal ? board.width : board.height;
  if (field === "x" || field === "y") return { min: 0, max: Math.max(0, extent - element[horizontal ? "width" : "height"]) };
  return { min: 24, max: Math.max(24, extent - element[horizontal ? "x" : "y"]) };
}

export function boundedGeometry(element: MoodboardElement, field: GeometryField, value: number, board: { width: number; height: number }): MoodboardElement {
  if (element.locked || !Number.isFinite(value)) return element;
  const range = geometryRange(element, field, board);
  const next = clamp(Math.round(value), range.min, range.max);
  return next === element[field] ? element : { ...element, [field]: next };
}

/** Compact ranks only when an actual move happens, avoiding ties, gaps and rank overflow. */
export function reorderElement(elements: MoodboardElement[], id: string, action: "backward" | "front") {
  const ordered = orderedElements(elements);
  const index = ordered.findIndex((element) => element.id === id);
  if (index < 0 || (action === "backward" ? index === 0 : index === ordered.length - 1)) return elements;
  const [element] = ordered.splice(index, 1);
  ordered.splice(action === "backward" ? index - 1 : ordered.length, 0, element);
  const ranks = new Map(ordered.map((item, rank) => [item.id, rank]));
  return elements.map((item) => ({ ...item, zOrder: ranks.get(item.id)! }));
}
