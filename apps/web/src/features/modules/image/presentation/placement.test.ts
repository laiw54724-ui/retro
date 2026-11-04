import { describe, expect, it } from "vitest";
import { imagePlacement, MAX_DISPLAY_EDGE } from "./placement";

const natural = { width: 200, height: 100 };
const viewport = { width: 100, height: 100 };

describe("imagePlacement", () => {
  it("places contain, cover, and original pixels without changing the source", () => {
    expect(imagePlacement(natural, viewport, "contain")).toEqual({ left: 0, top: 25, width: 100, height: 50 });
    expect(imagePlacement(natural, viewport, "cover")).toEqual({ left: -50, top: 0, width: 200, height: 100 });
    expect(imagePlacement(natural, viewport, "original")).toEqual({ left: -50, top: 0, width: 200, height: 100 });
  });

  it("applies crop zoom and position to both axes", () => {
    expect(imagePlacement(natural, viewport, "cover", { x: 100, y: 0, zoom: 2 }))
      .toEqual({ left: -300, top: 0, width: 400, height: 200 });
    expect(imagePlacement(natural, viewport, "contain", { x: 0, y: 100, zoom: 2 }))
      .toEqual({ left: 0, top: 0, width: 200, height: 100 });
  });

  it("bounds malformed inputs and extreme layouts", () => {
    expect(imagePlacement({ width: 0, height: 100 }, viewport, "cover")).toBeNull();
    expect(imagePlacement({ width: Infinity, height: 100 }, viewport, "cover")).toBeNull();
    expect(imagePlacement(natural, { width: 0, height: 100 }, "cover")).toBeNull();
    const extreme = imagePlacement({ width: 10_000, height: 1 }, viewport, "cover", { x: -20, y: 200, zoom: 99 });
    expect(extreme).not.toBeNull();
    expect(extreme!.width).toBeLessThanOrEqual(MAX_DISPLAY_EDGE);
    expect(Object.values(extreme!).every(Number.isFinite)).toBe(true);
  });
});
