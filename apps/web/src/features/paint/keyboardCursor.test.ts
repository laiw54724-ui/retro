import { describe, expect, it } from "vitest";
import { nextKeyboardCursor } from "./keyboardCursor";

describe("paint keyboard cursor", () => {
  it("uses logical pixels regardless of display zoom", () => {
    const at = { x: 17, y: 23 };
    expect(nextKeyboardCursor(at, "ArrowRight", false, 640, 480)).toEqual({ x: 18, y: 23 });
    expect(nextKeyboardCursor(at, "ArrowUp", true, 640, 480)).toEqual({ x: 17, y: 13 });
    expect(nextKeyboardCursor(at, "ArrowDown", true, 640, 480)).toEqual({ x: 17, y: 33 });
  });

  it("clamps to each canvas edge, including a one-pixel canvas", () => {
    expect(nextKeyboardCursor({ x: 0, y: 0 }, "ArrowLeft", true, 640, 480)).toEqual({ x: 0, y: 0 });
    expect(nextKeyboardCursor({ x: 639, y: 479 }, "ArrowDown", true, 640, 480)).toEqual({ x: 639, y: 479 });
    expect(nextKeyboardCursor({ x: 0, y: 0 }, "End", false, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(nextKeyboardCursor({ x: 1, y: 1 }, "Home", false, 320, 240)).toEqual({ x: 0, y: 0 });
    expect(nextKeyboardCursor({ x: 1, y: 1 }, "Space", false, 320, 240)).toBeNull();
  });
});
