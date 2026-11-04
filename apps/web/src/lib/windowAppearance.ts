import type { DesktopWindow, RetroTheme, WindowChromePreset } from "@retrodesk/shared";
import { contrastRatio, mixHex, readableOn, themeView, titleBackgroundSamples } from "./themeView";

export { titleBackgroundSamples } from "./themeView";
export function minimumContrast(foreground: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)));
}

/** One titlebar contract for desktop, mobile and the appearance preview. */
export function resolveWindowAppearance(theme: RetroTheme, appearance?: DesktopWindow["appearance"], active = true, options: { preset?: WindowChromePreset } = {}) {
  const view = themeView(theme);
  if (!active) return options.preset === "classic-95"
    ? { titleBackground: theme.shadow, titleColor: readableOn(theme.shadow) }
    : { titleBackground: view.inactiveTitle, titleColor: view.text };
  const from = appearance?.titleFrom ?? theme.titleFrom;
  const to = appearance?.titleTo ?? theme.titleTo;
  const gradient = appearance?.titleGradient ?? theme.appearance?.titleGradient ?? (options.preset !== "classic-95" || appearance?.titleFrom !== undefined || appearance?.titleTo !== undefined);
  return {
    titleBackground: gradient ? `linear-gradient(90deg, ${from}, ${to})` : from,
    titleColor: appearance?.titleText ?? theme.appearance?.titleText ?? readableOn(...titleBackgroundSamples(from, to, gradient))
  };
}

/** Frame colors are local to the window, including its buttons and bevel. */
export function resolveWindowFrame(theme: RetroTheme, appearance?: DesktopWindow["appearance"]) {
  const face = appearance?.frameColor ?? theme.appearance?.frameColor;
  if (!face) return themeView(theme);
  return themeView({ ...theme, face, text: readableOn(face), light: mixHex(face, "#ffffff", 0.65), shadow: mixHex(face, "#000000", 0.4), dark: mixHex(face, "#000000", 0.75) });
}

/** This P2 slice supports the generic surfaces only. Explicit tiles retain their colors. */
export function supportsContentAppearance(type: DesktopWindow["type"]) {
  return type === "document" || type === "gallery" || type === "links";
}
export function resolveContentAppearance(theme: RetroTheme, window: DesktopWindow) {
  const supported = supportsContentAppearance(window.type);
  return {
    background: supported ? window.appearance?.contentBackground ?? theme.appearance?.contentBackground ?? "#ffffff" : theme.face,
    color: supported ? window.appearance?.contentText ?? theme.appearance?.contentText ?? theme.text : theme.text
  };
}

/** Shared by owner canvas, visitors and phone icons. No global CSS state. */
export function resolveDesktopLabelAppearance(theme: RetroTheme, appearance?: DesktopWindow["appearance"]) {
  const view = themeView(theme);
  const background = appearance?.desktopLabelBackground ?? theme.appearance?.desktopLabelBackground;
  return {
    background: background ?? view.labelBg,
    color: appearance?.desktopLabelText ?? theme.appearance?.desktopLabelText ?? (background ? readableOn(background) : view.labelColor),
    border: view.labelBorder, borderRadius: view.labelRadius,
    textShadow: background ? "none" : view.labelShadow
  };
}
