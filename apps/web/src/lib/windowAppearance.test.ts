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
});
