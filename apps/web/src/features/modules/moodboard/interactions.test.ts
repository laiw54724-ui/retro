import { describe, expect, it } from "vitest";
import type { MoodboardElement } from "@retrodesk/shared";
import { imageRect, moveSelection, resizeRect, selectionBounds, snapMovement } from "./interactions";

const board = { width: 800, height: 600 };
const item = (id: string, x: number, locked = false): MoodboardElement => ({ id, kind: "color", x, y: 100, width: 100, height: 100, color: "#ffffff", locked, zOrder: 0 });
describe("freeform board interactions", () => {
  it("clamps the whole movable group and ignores locked members", () => {
    const elements = [item("a", 100), item("b", 300), item("locked", 0, true)];
    const result = moveSelection(elements, new Set(elements.map(({ id }) => id)), -500, 600, board);
    expect(result.map(({ x, y }) => [x, y])).toEqual([[0, 500], [200, 500], [0, 100]]);
    expect(result[2]).toBe(elements[2]);
    expect(selectionBounds(result.slice(0, 2))).toEqual({ x: 0, y: 500, width: 300, height: 100 });
  });
  it("snaps within six screen pixels at the current scale and Alt disables it", () => {
    const bounds = { x: 100, y: 100, width: 100, height: 100 };
    expect(snapMovement(bounds, 189, 0, [], board, 0.5)).toMatchObject({ dx: 200, x: 400 });
    expect(snapMovement(bounds, 187, 0, [], board, 0.5)).toMatchObject({ dx: 187, x: null });
    expect(snapMovement(bounds, 189, 0, [], board, 0.5, true)).toMatchObject({ dx: 189, x: null });
    expect(snapMovement(bounds, 34, 0, [{ x: 240, y: 300, width: 80, height: 80 }], board, 1)).toMatchObject({ dx: 40, x: 240 });
  });
  it("keeps image aspect ratio at canvas boundaries and anchors opposite corner", () => {
    const rect = { x: 500, y: 400, width: 200, height: 100 };
    expect(resizeRect(rect, "se", 500, 500, board, true)).toEqual({ x: 500, y: 400, width: 300, height: 150 });
    expect(resizeRect(rect, "nw", -1000, -1000, board, true)).toEqual({ x: 0, y: 150, width: 700, height: 350 });
  });
  it("enforces minimum size for every edge and allows independent corner geometry", () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeRect(rect, "nw", 300, 300, board, false)).toEqual({ x: 276, y: 176, width: 24, height: 24 });
    expect(resizeRect(rect, "e", 1000, 1000, board, false)).toEqual({ x: 100, y: 100, width: 700, height: 100 });
    expect(resizeRect(rect, "se", -1000, -1000, board, true)).toEqual({ x: 100, y: 100, width: 48, height: 24 });
  });
  it("fits natural image dimensions and clamps drop position", () => {
    expect(imageRect({ width: 1600, height: 900 }, board, { x: 790, y: 590 })).toEqual({ x: 480, y: 420, width: 320, height: 180 });
    expect(imageRect({ width: 400, height: 1200 }, board)).toEqual({ x: 340, y: 120, width: 120, height: 360 });
  });
});
