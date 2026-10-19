import { APPEARANCE_P2_WRITER_ENABLED } from "../../lib/appearanceP2Writer";
import { useAppearanceP2Writer } from "./AppearanceWriteContext";
import { AppearanceColorControls, AppearanceColorPreview } from "./AppearanceColorControls";
import { useEffect, useState } from "react";
import { themeLabel } from "../../i18n/themeNames";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { THEME_PRESETS, type RetroTheme } from "@retrodesk/shared";
import { isDark, mixHex, themeView, useThemeView } from "../../lib/themeView";
import { FilePick } from "../modules/ui";
import { AppearanceColorInput } from "./AppearanceColorInput";

const WALLS = ["#008080", "#ffd6e5", "#c9b8f0", "#a8e0cf", "#9fd8f5", "#ffe9b3", "#1d1a3a", "#ffffff"];
const TITLES: Array<[string, string]> = [["#000080", "#f48fb1"], ["#000080", "#1084d0"], ["#5b3fa8", "#b39ddb"], ["#1f7a5c", "#7fd1b0"], ["#2a2470", "#e05a9b"], ["#0a0a0a", "#808080"]];
const TASKBARS = ["#c0c0c0", "#e6def7", "#dff2ea", "#fff3d6", "#f4dde7"];
const patternOptions = (): Array<[RetroTheme["pattern"], string]> => [["none", i18n.t("editor:themeAppearanceEditor.none")], ["dots", i18n.t("editor:themeAppearanceEditor.dots")], ["checker", i18n.t("editor:themeAppearanceEditor.checkerboard")], ["stars", i18n.t("editor:themeAppearanceEditor.star")]];
const iconStyleOptions = (): Array<[RetroTheme["iconStyle"], string]> => [["classic", i18n.t("editor:themeAppearanceEditor.classic")], ["sticker", i18n.t("editor:themeAppearanceEditor.sticker")], ["tile", i18n.t("editor:themeAppearanceEditor.tile")]];

export function ThemeAppearanceEditor({ theme, onTheme, upload }: { theme: RetroTheme; onTheme: (theme: RetroTheme) => void; upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null> }) {
  const { t: tr } = useTranslation("editor");
  const writerEnabled = useAppearanceP2Writer();
  const [draft, setDraft] = useState(theme);
  useEffect(() => setDraft(theme), [theme]);
  const patch = (change: Partial<RetroTheme>) => setDraft((current) => ({ ...current, ...change }));
  const changed = JSON.stringify(draft) !== JSON.stringify(theme);
  const setWall = (wall: string) => patch({ wall, pattern: draft.pattern === "image" ? "none" : draft.pattern, wallImage: null, patternColor: mixHex(wall, "#ffffff", isDark(wall) ? 0.22 : 0.45) });
  async function uploadWall(file: File) {
    const url = await upload?.(file, "image");
    if (url) patch({ wallImage: url, pattern: "image" });
  }
  const reset = () => setDraft(THEME_PRESETS[theme.id] ?? THEME_PRESETS.classic98);
  const patterns = draft.wallImage ? [...patternOptions(), ["image", tr("inspectorContent.image")] as [RetroTheme["pattern"], string]] : patternOptions();
  const preview = useThemeView(draft);

  return (
    <>
      <div className="theme-head"><strong>{tr("mobileEditor.theme")}</strong><button type="button" className="w98-btn small" onClick={reset}>{tr("themeAppearanceEditor.resetPreview")}</button></div>
      <div className="theme-draft-preview" aria-label={tr("themeAppearanceEditor.themePreview")} style={{ backgroundColor: draft.wall, backgroundImage: preview.wallImageCss, backgroundSize: preview.wallSize, color: preview.text }}><span style={{ background: preview.titleBg, color: preview.titleText }}>Active window</span><i style={{ background: preview.inactiveTitle, color: preview.text }}>Inactive window</i><b style={{ background: draft.face, boxShadow: preview.bevel }}>{tr("themeAppearanceEditor.aaLatinCjk")}</b></div>
      <div className="theme-draft-actions"><button type="button" className="w98-btn primary" disabled={!changed} onClick={() => onTheme(draft)}>{tr("themeAppearanceEditor.applyTheme")}</button><button type="button" className="w98-btn" disabled={!changed} onClick={() => setDraft(theme)}>{tr("themeAppearanceEditor.cancelPreview")}</button></div>
      <fieldset className="w98-fieldset"><legend>{tr("themeAppearanceEditor.presetThemes")}</legend>
        <div className="preset-grid">
          {Object.values(THEME_PRESETS).map((preset) => {
            const tv = themeView(preset);
            return (
              <button key={preset.id} type="button" className={"preset" + (draft.id === preset.id ? " on" : "")} aria-pressed={draft.id === preset.id} onClick={() => setDraft(preset)}>
                <span className="preset-thumb" style={{ backgroundColor: preset.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize }}><i style={{ background: tv.titleBg }} /></span>
                <span>{themeLabel(preset)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>{tr("themeAppearanceEditor.wallpaper")}</legend>
        <div className="swatches">{WALLS.map((color) => <button key={color} type="button" aria-label={tr("themeAppearanceEditor.wallpaperColor", { color })} aria-pressed={draft.wall === color} className="swatch sq26" style={{ background: color, outline: draft.wall === color ? "2px solid #000080" : "none" }} onClick={() => setWall(color)} />)}</div>
        <span className="w98-hint">{tr("themeAppearanceEditor.pattern")}</span>
        <div className="swatches">{patterns.map(([id, label]) => <button key={id} type="button" className={"mini-btn wide" + (draft.pattern === id ? " on" : "")} onClick={() => patch({ pattern: id })}>{label}</button>)}</div>
        <FilePick className="w98-btn small block" onFiles={(files) => void uploadWall(files[0])}>{tr("themeAppearanceEditor.uploadWallpaperImage")}</FilePick>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>{tr("themeAppearanceEditor.windowTitleBars")}</legend>
        <div className="color-fields">
          <AppearanceColorInput label={tr("themeAppearanceEditor.themeTitleStartColor")} value={draft.titleFrom} onChange={(titleFrom) => patch({ titleFrom })} />
          <AppearanceColorInput label={tr("themeAppearanceEditor.themeTitleEndColor")} disabled={draft.appearance?.titleGradient === false} value={draft.titleTo} onChange={(titleTo) => patch({ titleTo })} />
        </div>
        <div className="title-swatches">{TITLES.map(([from, to]) => <button key={from + to} type="button" aria-label={tr("themeAppearanceEditor.titleBarColors")} aria-pressed={draft.titleFrom === from && draft.titleTo === to} className="swatch h20" style={{ background: `linear-gradient(90deg, ${from}, ${to})`, outline: draft.titleFrom === from && draft.titleTo === to ? "2px solid #000080" : "none" }} onClick={() => patch({ titleFrom: from, titleTo: to })} />)}</div>
      </fieldset>
      {APPEARANCE_P2_WRITER_ENABLED && writerEnabled ? <fieldset className="w98-fieldset" data-appearance-p2-writer><legend>{tr("p2Appearance.siteColors")}</legend>
        <AppearanceColorPreview theme={draft} />
        <AppearanceColorControls theme={draft} appearance={draft.appearance} onChange={(appearance) => patch({ appearance })} />
      </fieldset> : null}
      <fieldset className="w98-fieldset"><legend>{tr("themeAppearanceEditor.taskbar")}</legend>
        <div className="swatches">{TASKBARS.map((color) => <button key={color} type="button" aria-label={tr("themeAppearanceEditor.taskbarColor", { color })} aria-pressed={draft.taskbar === color} className="swatch sq26" style={{ background: color, outline: draft.taskbar === color ? "2px solid #000080" : "none" }} onClick={() => patch({ taskbar: color })} />)}</div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>{tr("themeAppearanceEditor.iconStyleAndFont")}</legend>
        <div className="swatches">{iconStyleOptions().map(([id, label]) => <button key={id} type="button" className={"mini-btn grow" + (draft.iconStyle === id ? " on" : "")} onClick={() => patch({ iconStyle: id })}>{label}</button>)}</div>
        <span className="w98-hint">{tr("themeAppearanceEditor.siteWideFontCubic11")}</span>
      </fieldset>
    </>
  );
}
