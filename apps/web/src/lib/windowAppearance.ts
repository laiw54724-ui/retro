import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import { readableOn, themeView } from "./themeView";

/** One titlebar contract for desktop, mobile and the appearance preview. */
export function resolveWindowAppearance(theme: RetroTheme, appearance?: DesktopWindow["appearance"], active = true) {
  const view = themeView(theme);
  if (!active) return { titleBackground: view.inactiveTitle, titleColor: view.text };
  if (!appearance) return { titleBackground: view.titleBg, titleColor: view.titleText };
  return {
    titleBackground: appearance.titleGradient
      ? `linear-gradient(90deg, ${appearance.titleFrom}, ${appearance.titleTo})`
      : appearance.titleFrom,
    titleColor: readableOn(appearance.titleFrom, appearance.titleGradient ? appearance.titleTo : appearance.titleFrom)
  };
}
