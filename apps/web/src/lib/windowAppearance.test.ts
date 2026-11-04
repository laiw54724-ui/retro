import { describe, expect, it } from "vitest";
import { THEME_PRESETS, makeWindow } from "@retrodesk/shared";
import { themeView } from "./themeView";
import { resolveWindowAppearance, resolveWindowFrame, resolveContentAppearance, resolveDesktopLabelAppearance, titleBackgroundSamples, minimumContrast } from "./windowAppearance";

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

describe("P2 scoped optional colors", () => {
  const theme = { ...THEME_PRESETS.classic98, appearance: { titleText: "#ffeecc", frameColor: "#aaaaaa", contentBackground: "#eeddcc", contentText: "#112233", desktopLabelText: "#101010", desktopLabelBackground: "#eeeeee" } };
  it("resolves each field without inventing title overrides for a partial window", () => {
    expect(resolveWindowAppearance(theme, { contentText: "#ff0000" })).toEqual(resolveWindowAppearance(theme));
    expect(resolveWindowAppearance(theme, { titleText: "#123456" }).titleColor).toBe("#123456");
    expect(resolveWindowAppearance(theme, { titleText: "#123456" }, false).titleColor).toBe(theme.text);
    expect(resolveWindowFrame(theme, { frameColor: "#224466" }).face).toBe("#224466");
    expect(resolveWindowFrame(theme).face).toBe("#aaaaaa");
    expect(theme.face).toBe(THEME_PRESETS.classic98.face);
  });
  it("isolates labels and generic content from neighboring windows and explicit module content", () => {
    const first = makeWindow("document");
    first.appearance = { desktopLabelText: "#ff0000", contentBackground: "#dddddd" };
    const second = makeWindow("gallery");
    expect(resolveDesktopLabelAppearance(theme, first.appearance).color).toBe("#ff0000");
    expect(resolveDesktopLabelAppearance(theme, second.appearance).color).toBe("#101010");
    expect(resolveContentAppearance(theme, first)).toEqual({ background: "#dddddd", color: "#112233" });
    expect(resolveContentAppearance(theme, second)).toEqual({ background: "#eeddcc", color: "#112233" });
    for (const type of ["instagram", "moodboard", "music", "about"] as const) {
      const window = makeWindow(type);
      window.appearance = { contentBackground: "#ff0000", contentText: "#00ff00" };
      expect(resolveContentAppearance(theme, window)).toEqual({ background: theme.face, color: theme.text });
    }
  });
  it("does not claim a cross-black/white gradient passes just because endpoints were checked", () => {
    const samples = titleBackgroundSamples("#000000", "#ffffff", true);
    expect(samples).toHaveLength(33);
    expect(minimumContrast("#ffffff", samples)).toBe(1);
    expect(minimumContrast("#000000", samples)).toBe(1);
    expect(titleBackgroundSamples("#ffffff", "#000000", false)).toEqual(["#ffffff"]);
  });
});
