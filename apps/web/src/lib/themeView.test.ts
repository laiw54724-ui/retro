import { describe, expect, it } from "vitest";
import { resolvedThemeView, themeView } from "./themeView";
import { THEME_PRESETS } from "@retrodesk/shared";

describe("private wallpaper resolution", () => {
  it("does not emit a retro-asset CSS URL before the blob is ready", () => {
    const theme = { ...THEME_PRESETS.classic98, pattern: "image" as const, wallImage: "retro-asset:11111111-1111-4111-8111-111111111111" };
    const view = resolvedThemeView(theme, themeView(theme), null);
    expect(view.wallImageCss).toBe("none");
    expect(view.wallImageCss).not.toContain("retro-asset:");
  });
});
