import type { RetroTheme } from "@retrodesk/shared";
import { cssUrl } from "./icons";

export const FONT_STACKS: Record<RetroTheme["font"], { family: string; label: string }> = {
  noto: { family: "'Noto Sans TC', sans-serif", label: "清晰黑體（推薦）" },
  maru: { family: "'Zen Maru Gothic','Noto Sans TC', sans-serif", label: "可愛圓體" },
  dot: { family: "'Cubic 11','DotGothic16','Noto Sans TC', sans-serif", label: "點陣復古" },
  pixel: { family: "'Pixelify Sans','Noto Sans TC', sans-serif", label: "像素英文 + 黑體" }
};

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
export const readableOn = (bg: string) => (luminance(bg) > 0.6 ? "#000000" : "#ffffff");

export type ThemeView = RetroTheme & {
  wallImageCss: string;
  wallSize: string;
  fontFamily: string;
  bevel: string;
  sunken: string;
  pressed: string;
  titleBg: string;
  titleBgV: string;
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
    fontFamily: (FONT_STACKS[t.font] ?? FONT_STACKS.noto).family,
    bevel,
    sunken: `inset -1px -1px #ffffff, inset 1px 1px ${t.shadow}, inset -2px -2px ${t.light}, inset 2px 2px ${t.dark}`,
    pressed: `inset -1px -1px #ffffff, inset 1px 1px ${t.dark}, inset -2px -2px ${t.light}, inset 2px 2px ${t.shadow}`,
    titleBg: `linear-gradient(90deg, ${t.titleFrom}, ${t.titleTo})`,
    titleBgV: `linear-gradient(0deg, ${t.titleFrom}, ${t.titleTo})`,
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

/** Linear blend of two #rrggbb colours (t = 0 → a, t = 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [pa, pb] = [parse(a), parse(b)];
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
