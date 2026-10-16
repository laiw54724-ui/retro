import { describe, expect, it } from "vitest";
import { iconBackground, isImageIcon } from "./icons";

describe("uploaded icon references", () => {
  it("accepts only strict stable asset references", () => {
    const ref = "retro-asset:11111111-1111-4111-8111-111111111111";
    expect(isImageIcon(ref)).toBe(true);
    expect(isImageIcon("retro-asset:not-a-uuid")).toBe(false);
    expect(iconBackground(ref)).toContain(ref);
  });
});
