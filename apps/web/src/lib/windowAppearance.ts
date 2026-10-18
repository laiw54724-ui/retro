import type { DesktopWindow, RetroTheme, WindowChromePreset } from "@retrodesk/shared";
import { readableOn, themeView } from "./themeView";

/** One titlebar contract for desktop, mobile and the appearance preview. */
export function resolveWindowAppearance(theme: RetroTheme, appearance?: DesktopWindow["appearance"], active = true, options: { preset?: WindowChromePreset } = {}) {
  const view = themeView(theme);
  // Presets supply a fill default; an author's explicit title appearance still wins.
  // Keep this decision here so chrome, mobile, and author previews share one resolver.
  if (options.preset === "classic-95") {
    if (!active) return { titleBackground: theme.shadow, titleColor: readableOn(theme.shadow) };
    if (!appearance) return { titleBackground: theme.titleFrom, titleColor: readableOn(theme.titleFrom) };
  }
  if (!active) return { titleBackground: view.inactiveTitle, titleColor: view.text };
  if (!appearance) return { titleBackground: view.titleBg, titleColor: view.titleText };
  return {
    titleBackground: appearance.titleGradient
      ? `linear-gradient(90deg, ${appearance.titleFrom}, ${appearance.titleTo})`
      : appearance.titleFrom,
    titleColor: readableOn(appearance.titleFrom, appearance.titleGradient ? appearance.titleTo : appearance.titleFrom)
  };
}
