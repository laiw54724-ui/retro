import { describe, expect, it } from "vitest";
import type { MoodboardElement } from "@retrodesk/shared";
import { MoodboardContentSchema } from "@retrodesk/shared";
import { boundedGeometry, geometryRange, orderedElements, reorderElement } from "./editing";

const board = { width: 800, height: 600 };
const element: MoodboardElement = { id: "a", kind: "color", x: 80, y: 70, width: 240, height: 150, zOrder: 2, locked: false, color: "#f5b7d2" };

describe("Moodboard bounded geometry", () => {
  it("independently edits each axis in stored pixels without changing other properties", () => {
    expect(boundedGeometry(element, "x", 112.8, board)).toEqual({ ...element, x: 113 });
    expect(boundedGeometry(element, "height", 212, board)).toEqual({ ...element, height: 212 });
    expect(element.x).toBe(80);
  });
  it("bounds coordinates and dimensions to the canvas with the existing schema minimum", () => {
    for (const [field, value, expected] of [["x", -40, 0], ["y", 9999, 450], ["width", 9999, 720], ["height", -10, 24]] as const) {
      const next = boundedGeometry(element, field, value, board);
      expect(next[field]).toBe(expected);
      expect(MoodboardContentSchema.safeParse({ ...board, background: "#ffffff", elements: [next] }).success).toBe(true);
    }
    expect(geometryRange({ ...element, x: 776, y: 576, width: 24, height: 24 }, "width", board)).toEqual({ min: 24, max: 24 });
  });
  it("ignores non-finite values, unchanged values and locked edits", () => {
    for (const value of [NaN, Infinity, -Infinity, element.x]) expect(boundedGeometry(element, "x", value, board)).toBe(element);
    const locked = { ...element, locked: true };
    expect(boundedGeometry(locked, "width", 300, board)).toBe(locked);
  });
});

describe("Moodboard layer order", () => {
  const elements = [element, { ...element, id: "b" }, { ...element, id: "c", zOrder: 9999, locked: true }];
  it("moves exactly one visual layer even with equal ranks, retaining object identity and original array order", () => {
    const moved = reorderElement(elements, "b", "backward");
    expect(orderedElements(moved).map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(moved.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(moved.find((item) => item.id === "c")).toEqual({ ...elements[2], zOrder: 2 });
    expect(elements[1].zOrder).toBe(2);
  });
  it("brings an obscured object to front without exceeding the schema rank maximum", () => {
    const moved = reorderElement(elements, "a", "front");
    expect(orderedElements(moved).map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(MoodboardContentSchema.safeParse({ ...board, background: "#ffffff", elements: moved }).success).toBe(true);
  });
  it("returns the original list at boundaries or for a missing object", () => {
    expect(reorderElement(elements, "a", "backward")).toBe(elements);
    expect(reorderElement(elements, "c", "front")).toBe(elements);
    expect(reorderElement(elements, "missing", "front")).toBe(elements);
    expect(reorderElement([], "a", "backward")).toEqual([]);
  });
});
