import { isAssetReference, type RetroTheme } from "@retrodesk/shared";
import { cssUrl } from "./icons";
import { useMemo } from "react";
import { useAssetSource } from "./assetSource";

export const CUBIC_FONT_STACK = "'Cubic 11', system-ui, sans-serif";

export function isDark(hex: string): boolean {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 120;
}

/** Perceived luminance 0..1, used to pick black/white text on a custom colour. */
export function luminance(hex: string): number {
  const n = parseInt((hex || "#ffffff").slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function relativeLuminance(hex: string): number {
  const value = parseInt((hex || "#ffffff").slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
export function readableOn(...backgrounds: string[]) {
  const candidates = ["#000000", "#ffffff"];
  return candidates.sort((a, b) => Math.min(...backgrounds.map((bg) => contrastRatio(b, bg))) - Math.min(...backgrounds.map((bg) => contrastRatio(a, bg))))[0];
}

export type ThemeView = RetroTheme & {
  wallImageCss: string;
  wallSize: string;
  fontFamily: string;
  bevel: string;
  sunken: string;
  pressed: string;
  titleBg: string;
  titleBgV: string;
  titleText: string;
  accentText: string;
  inactiveTitle: string;
  taskbarText: string;
  labelBg: string;
  labelColor: string;
  labelBorder: string;
  labelRadius: string;
  labelShadow: string;
  tileBg: string;
  tileShadow: string;
};

const star = (c: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><path d='M14 6l2 6 6 2-6 2-2 6-2-6-6-2 6-2z' fill='${c}'/><circle cx='42' cy='40' r='2' fill='${c}'/><circle cx='40' cy='12' r='1.2' fill='${c}'/></svg>`)}")`;

/** Derives every CSS value the desktop needs from a theme token set. */
export function themeView(t: RetroTheme): ThemeView {
  const pc = t.patternColor;
  const patterns: Record<RetroTheme["pattern"], [string, string]> = {
    none: ["none", "auto"],
    dots: [`radial-gradient(${pc} 1.5px, transparent 1.7px)`, "16px 16px"],
    checker: [`conic-gradient(${pc} 25%, transparent 0 50%, ${pc} 0 75%, transparent 0)`, "28px 28px"],
    stars: [star(pc), "56px 56px"],
    image: [t.wallImage ? cssUrl(t.wallImage) : "none", "cover"]
  };
  const [wallImageCss, wallSize] = patterns[t.pattern] ?? patterns.none;
  const dark = isDark(t.wall);
  const sticker = t.iconStyle === "sticker";
  const tile = t.iconStyle === "tile";
  const bevel = `inset -1px -1px ${t.dark}, inset 1px 1px #ffffff, inset -2px -2px ${t.shadow}, inset 2px 2px ${t.light}`;
  return {
    ...t,
    wallImageCss,
    wallSize,
    fontFamily: CUBIC_FONT_STACK,
    bevel,
    sunken: `inset -1px -1px #ffffff, inset 1px 1px ${t.shadow}, inset -2px -2px ${t.light}, inset 2px 2px ${t.dark}`,
    pressed: `inset -1px -1px #ffffff, inset 1px 1px ${t.dark}, inset -2px -2px ${t.light}, inset 2px 2px ${t.shadow}`,
    titleBg: t.appearance?.titleGradient === false ? t.titleFrom : `linear-gradient(90deg, ${t.titleFrom}, ${t.titleTo})`,
    titleBgV: t.appearance?.titleGradient === false ? t.titleFrom : `linear-gradient(0deg, ${t.titleFrom}, ${t.titleTo})`,
    titleText: t.appearance?.titleText ?? readableOn(...titleBackgroundSamples(t.titleFrom, t.titleTo, t.appearance?.titleGradient !== false)),
    accentText: readableOn(t.accent),
    inactiveTitle: `linear-gradient(90deg, ${t.shadow}, ${t.light})`,
    taskbarText: isDark(t.taskbar) ? "#ffffff" : t.text,
    labelBg: sticker ? "#ffffff" : "transparent",
    labelColor: sticker ? t.text : dark ? "#ffffff" : t.text,
    labelBorder: sticker ? `1px solid ${t.dark}` : "1px solid transparent",
    labelRadius: sticker ? "3px" : "0px",
    labelShadow: !sticker && dark ? "1px 1px 0 #000000" : "none",
    tileBg: tile ? t.face : "transparent",
    tileShadow: tile ? bevel : "none"
  };
}

export function useThemeView(t: RetroTheme): ThemeView {
  const view = useMemo(() => themeView(t), [t]);
  const resolvedWallpaper = useAssetSource(t.wallImage);
  return useMemo(() => resolvedThemeView(t, view, resolvedWallpaper), [resolvedWallpaper, t.pattern, t.wallImage, view]);
}

export function resolvedThemeView(t: RetroTheme, view: ThemeView, resolvedWallpaper: string | null): ThemeView {
  if (t.pattern !== "image") return view;
  if (!resolvedWallpaper && isAssetReference(t.wallImage)) return { ...view, wallImageCss: "none" };
  if (!resolvedWallpaper || resolvedWallpaper === t.wallImage) return view;
  return { ...view, wallImageCss: cssUrl(resolvedWallpaper) };
}

/** Linear blend of two #rrggbb colours (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [pa, pb] = [parse(a), parse(b)];
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Sample sRGB backgrounds across the full title gradient, including both endpoints. */
export function titleBackgroundSamples(from: string, to: string, gradient: boolean): string[] {
  return gradient ? Array.from({ length: 33 }, (_, index) => mixHex(from, to, index / 32)) : [from];
}
