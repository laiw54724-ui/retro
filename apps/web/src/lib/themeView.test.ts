import { describe, expect, it } from "vitest";
import { contrastRatio, resolvedThemeView, themeView } from "./themeView";
import { THEME_PRESETS } from "@retrodesk/shared";

describe("private wallpaper resolution", () => {
  it("does not emit a retro-asset CSS URL before the blob is ready", () => {
    const theme = { ...THEME_PRESETS.classic98, pattern: "image" as const, wallImage: "retro-asset:11111111-1111-4111-8111-111111111111" };
    const view = resolvedThemeView(theme, themeView(theme), null);
    expect(view.wallImageCss).toBe("none");
    expect(view.wallImageCss).not.toContain("retro-asset:");
  });
});

describe("theme token contract", () => {
  it.each(["classic98", "y2k", "pixel"])("derives complete active and inactive tokens for %s", (id) => {
    const view = themeView(THEME_PRESETS[id]);
    expect({
      font: view.fontFamily,
      title: view.titleBg,
      titleText: view.titleText,
      accentText: view.accentText,
      inactive: view.inactiveTitle,
      bevel: view.bevel,
      sunken: view.sunken,
      taskbarText: view.taskbarText,
      tile: view.tileBg,
      labelRadius: view.labelRadius
    }).toMatchSnapshot();
    expect(Math.min(contrastRatio(view.titleText, view.titleFrom), contrastRatio(view.titleText, view.titleTo))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(view.accentText, view.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
