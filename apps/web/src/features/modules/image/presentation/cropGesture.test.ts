import { describe, expect, it } from "vitest";
import { cropAfterDrag } from "./cropGesture";

describe("cropAfterDrag", () => {
  const start = { x: 50, y: 50, zoom: 2 };

  it("moves the visible image with the pointer when it overflows the stage", () => {
    expect(cropAfterDrag(start, { x: 20, y: -10 }, { width: 100, height: 100 }, { width: 200, height: 150 }))
      .toEqual({ x: 30, y: 70, zoom: 2 });
  });

  it("handles contained images, an axis without travel, and bounds", () => {
    expect(cropAfterDrag(start, { x: 100, y: -100 }, { width: 200, height: 100 }, { width: 100, height: 100 }))
      .toEqual({ x: 100, y: 50, zoom: 2 });
  });
});
