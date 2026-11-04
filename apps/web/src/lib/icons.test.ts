import { describe, expect, it } from "vitest";
import { fallbackIconKey, iconBackground, isImageIcon } from "./icons";

describe("uploaded icon references", () => {
  it("accepts only strict stable asset references", () => {
    const ref = "retro-asset:11111111-1111-4111-8111-111111111111";
    expect(isImageIcon(ref)).toBe(true);
    expect(isImageIcon("retro-asset:not-a-uuid")).toBe(false);
    expect(iconBackground(ref)).toContain(ref);
  });
});

describe("missing optional icon fallbacks", () => {
  it("maps old and optional paths to meaningful built-in icons", () => {
    expect(fallbackIconKey("/windows-icons/icons-w2k-camera.ico")).toBe("camera");
    expect(fallbackIconKey("/win98-icons/folder-open.png")).toBe("folder");
    expect(fallbackIconKey("/windows-icons/icons-wxp-network.ico")).toBe("link");
    expect(fallbackIconKey("/windows-icons/unknown.ico")).toBe("doc");
  });
});
