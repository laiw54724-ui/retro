import { describe, expect, it } from "vitest";
// resolveTarget needs a real DOM and is covered by the browser spec (help-tour.spec.ts).
import { placeCard } from "./tourTargets";

const viewport = { width: 390, height: 844 };
const card = { width: 340, height: 160 };

describe("placeCard keeps other controls usable", () => {
  it("never covers a top bar control that is not the target", () => {
    const bar = [{ left: 8, top: 50, width: 60, height: 44 }, { left: 80, top: 50, width: 60, height: 44 }];
    const target = { left: 200, top: 8, width: 100, height: 36 };
    const placed = placeCard(target, card, viewport, 8, 12, bar);
    for (const obstacle of bar) {
      const overlap = placed.left < obstacle.left + obstacle.width && placed.left + placed.width > obstacle.left && placed.top < obstacle.top + obstacle.height && placed.top + placed.height > obstacle.top;
      expect(overlap).toBe(false);
    }
  });
});

describe("placeCard", () => {
  it("goes below a target near the top and never overlaps it", () => {
    const placed = placeCard({ left: 20, top: 40, width: 100, height: 44 }, card, viewport);
    expect(placed.placement).toBe("below");
    expect(placed.top).toBeGreaterThanOrEqual(40 + 44);
  });
  it("goes above a target near the bottom", () => {
    const placed = placeCard({ left: 20, top: 760, width: 100, height: 44 }, card, viewport);
    expect(placed.placement).toBe("above");
    expect(placed.top + placed.height).toBeLessThanOrEqual(760);
  });
  it("stays inside the viewport horizontally", () => {
    const placed = placeCard({ left: 350, top: 40, width: 30, height: 30 }, card, viewport);
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.left + placed.width).toBeLessThanOrEqual(viewport.width - 8);
  });
  it("docks away from a target that fills the screen", () => {
    const placed = placeCard({ left: 0, top: 0, width: 390, height: 800 }, card, viewport);
    expect(["dock-bottom", "dock-top"]).toContain(placed.placement);
  });
  it("shrinks the card on a narrow screen instead of overflowing", () => {
    const placed = placeCard({ left: 10, top: 40, width: 40, height: 40 }, { width: 340, height: 160 }, { width: 320, height: 568 });
    expect(placed.width).toBeLessThanOrEqual(320 - 16);
  });
});
