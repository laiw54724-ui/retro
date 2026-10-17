import { describe, expect, it } from "vitest";
import { THEME_PRESETS } from "@retrodesk/shared";
import { themeView } from "./themeView";
import { resolveWindowAppearance } from "./windowAppearance";

describe("window title appearance", () => {
  const theme = THEME_PRESETS.classic98;
  it("inherits the theme when there is no window override", () => {
    const view = themeView(theme);
    expect(resolveWindowAppearance(theme)).toEqual({ titleBackground: view.titleBg, titleColor: view.titleText });
  });
  it("chooses text for the actual solid background, ignoring an unused gradient end", () => {
    expect(resolveWindowAppearance(theme, { titleFrom: "#ffffff", titleTo: "#000000", titleGradient: false }))
      .toEqual({ titleBackground: "#ffffff", titleColor: "#000000" });
  });
  it("uses both gradient endpoints and does not mutate saved values", () => {
    const appearance = Object.freeze({ titleFrom: "#001144", titleTo: "#004444", titleGradient: true });
    const result = resolveWindowAppearance(Object.freeze({ ...theme }), appearance);
    expect(result).toEqual({ titleBackground: "linear-gradient(90deg, #001144, #004444)", titleColor: "#ffffff" });
    expect(appearance).toEqual({ titleFrom: "#001144", titleTo: "#004444", titleGradient: true });
  });
  it("preserves the existing inactive theme rule even for custom windows", () => {
    expect(resolveWindowAppearance(theme, { titleFrom: "#ffffff", titleTo: "#ffffff", titleGradient: false }, false))
      .toEqual({ titleBackground: themeView(theme).inactiveTitle, titleColor: theme.text });
  });
  it("uses solid Classic 95 defaults for both focus states without changing legacy 98", () => {
    expect(resolveWindowAppearance(theme, undefined, true, { preset: "classic-95" }))
      .toEqual({ titleBackground: theme.titleFrom, titleColor: "#ffffff" });
    expect(resolveWindowAppearance(theme, undefined, false, { preset: "classic-95" }))
      .toEqual({ titleBackground: theme.shadow, titleColor: "#000000" });
    for (const preset of ["classic-98", "compact-98"] as const) {
      expect(resolveWindowAppearance(theme, undefined, true, { preset })).toEqual(resolveWindowAppearance(theme));
      expect(resolveWindowAppearance(theme, undefined, false, { preset })).toEqual(resolveWindowAppearance(theme, undefined, false));
    }
  });
  it("keeps the author's explicit title appearance above the preset default", () => {
    const appearance = Object.freeze({ titleFrom: "#001144", titleTo: "#004444", titleGradient: true });
    expect(resolveWindowAppearance(theme, appearance, true, { preset: "classic-95" }))
      .toEqual(resolveWindowAppearance(theme, appearance));
  });
});
