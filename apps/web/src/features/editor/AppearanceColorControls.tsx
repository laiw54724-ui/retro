import { useState } from "react";
import { useTranslation } from "react-i18next";
import { makeWindow, type DesktopWindow, type RetroTheme } from "@retrodesk/shared";
import { contrastRatio, useThemeView } from "../../lib/themeView";
import { minimumContrast, resolveContentAppearance, resolveDesktopLabelAppearance, resolveWindowAppearance, resolveWindowFrame, supportsContentAppearance, titleBackgroundSamples } from "../../lib/windowAppearance";
import { AppearanceColorInput } from "./AppearanceColorInput";
import { patchAppearance, type WindowAppearance } from "./appearanceDraft";

type ColorField = Exclude<keyof WindowAppearance, "titleGradient">;
type Props = { theme: RetroTheme; window?: DesktopWindow; appearance?: WindowAppearance; onChange: (appearance: WindowAppearance | undefined) => void };
const commonFields: ColorField[] = ["titleText", "frameColor", "contentBackground", "contentText", "desktopLabelText", "desktopLabelBackground"];
const swatches = ["#ffffff", "#000000", "#000080", "#e6def7"];

/** Shared site/window controls. Editing values stay in the caller's local draft. */
export function AppearanceColorControls({ theme, window, appearance, onChange }: Props) {
  const { t } = useTranslation("editor");
  const inheritedTheme = window ? theme : { ...theme, appearance: undefined };
  const label = resolveDesktopLabelAppearance(inheritedTheme);
  const fallbacks: Record<ColorField, string> = {
    titleFrom: theme.titleFrom, titleTo: theme.titleTo,
    titleText: resolveWindowAppearance(inheritedTheme, undefined, true, { preset: window?.chrome?.preset }).titleColor,
    frameColor: resolveWindowFrame(inheritedTheme).face,
    contentBackground: inheritedTheme.appearance?.contentBackground ?? "#ffffff",
    contentText: inheritedTheme.appearance?.contentText ?? theme.text,
    desktopLabelText: label.color,
    desktopLabelBackground: label.background === "transparent" ? theme.wall : label.background
  };
  const hasGradient = resolveWindowAppearance(theme, window ? appearance : undefined, true, { preset: window?.chrome?.preset }).titleBackground.startsWith("linear-gradient");
  const fields = [...(window ? ["titleFrom", "titleTo"] as ColorField[] : []), ...commonFields]
    .filter((field) => field !== "titleTo" || hasGradient)
    .filter((field) => !window || supportsContentAppearance(window.type) || (field !== "contentBackground" && field !== "contentText"));
  return (
    <div className="p2-color-controls">
      <p className="w98-hint">{t(window ? "p2Appearance.windowScope" : "p2Appearance.siteScope")}</p>
      <p className="w98-hint">{t(window && !supportsContentAppearance(window.type) ? "p2Appearance.moduleIndependent" : "p2Appearance.contentScope")}</p>
      {fields.map((field) => {
        const custom = appearance?.[field] !== undefined;
        const fieldLabel = t(`p2Appearance.${field}`);
        return <fieldset key={field} className="w98-fieldset p2-color-row">
          <legend>{fieldLabel}</legend>
          <label className="check-row"><input type="checkbox" aria-label={t("p2Appearance.customField", { field: fieldLabel })} checked={custom} onChange={(event) => onChange(patchAppearance(appearance, field, event.target.checked ? fallbacks[field] : undefined))} />{t(custom ? "p2Appearance.custom" : "p2Appearance.inherit")}</label>
          <AppearanceColorInput label={fieldLabel} value={appearance?.[field] ?? fallbacks[field]} disabled={!custom} onChange={(value) => onChange(patchAppearance(appearance, field, value))} />
          <div className="p2-swatches">{swatches.map((color) => <button key={color} type="button" className="swatch" disabled={!custom} style={{ background: color }} aria-label={t("p2Appearance.swatch", { field: fieldLabel, color })} onClick={() => onChange(patchAppearance(appearance, field, color))} />)}</div>
          <button type="button" className="w98-btn small" disabled={!custom} aria-label={t("p2Appearance.resetField", { field: fieldLabel })} onClick={() => onChange(patchAppearance(appearance, field, undefined))}>{t("p2Appearance.reset")}</button>
        </fieldset>;
      })}
      <label className="w98-field"><span>{t("p2Appearance.titleFill")}</span><select className="w98-input" aria-label={t("p2Appearance.titleFill")} value={appearance?.titleGradient === undefined ? "inherit" : appearance.titleGradient ? "gradient" : "solid"} onChange={(event) => onChange(patchAppearance(appearance, "titleGradient", event.target.value === "inherit" ? undefined : event.target.value === "gradient"))}>
        <option value="inherit">{t("p2Appearance.inherit")}</option><option value="solid">{t("p2Appearance.solid")}</option><option value="gradient">{t("p2Appearance.gradient")}</option>
      </select></label>
    </div>
  );
}

/** A deliberately scoped sample, with warnings about the actual resolved pairs. */
export function AppearanceColorPreview({ theme, window, appearance }: Omit<Props, "onChange">) {
  const { t } = useTranslation("editor");
  const [active, setActive] = useState(true);
  const tv = useThemeView(theme);
  const target = window ? { ...window, appearance } : makeWindow("document");
  const title = resolveWindowAppearance(theme, window ? appearance : undefined, active, { preset: window?.chrome?.preset });
  const frame = resolveWindowFrame(theme, window ? appearance : undefined);
  const content = resolveContentAppearance(theme, target);
  const label = resolveDesktopLabelAppearance(theme, window ? appearance : undefined);
  const from = active ? appearance?.titleFrom ?? theme.titleFrom : theme.shadow;
  const to = active ? appearance?.titleTo ?? theme.titleTo : theme.light;
  // Use the exact resolved CSS background mode, including inactive/95 rules.
  const titleRatio = minimumContrast(title.titleColor, titleBackgroundSamples(from, to, title.titleBackground.startsWith("linear-gradient")));
  const labelBackground = label.background !== "transparent" ? label.background : theme.pattern === "none" ? theme.wall : undefined;
  const warnings = [
    [t("p2Appearance.titleText"), titleRatio],
    ...(supportsContentAppearance(target.type) ? [[t("p2Appearance.contentText"), contrastRatio(content.color, content.background)]] as const : []),
    ...(labelBackground ? [[t("p2Appearance.desktopLabelText"), contrastRatio(label.color, labelBackground)]] as const : [])
  ] as const;
  return <>
    <div className="p2-preview" aria-label={t("p2Appearance.preview")} style={{ backgroundColor: theme.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize }}>
      <span className="p2-preview-label" style={label}>{window?.title ?? t("p2Appearance.previewTitle")}</span>
      <div className="p2-preview-frame" style={{ background: frame.face, color: frame.text, boxShadow: frame.bevel }}>
        <div className="titlebar-preview" aria-label={t("windowAppearanceEditor.titleBarPreview")} style={{ background: title.titleBackground, color: title.titleColor }}>{window?.title ?? t("p2Appearance.previewTitle")}</div>
        <div className="p2-preview-content" style={content}>{t(supportsContentAppearance(target.type) ? "p2Appearance.previewBody" : "p2Appearance.moduleIndependent")}</div>
      </div>
    </div>
    <div className="seg" role="group" aria-label={t("windowAppearanceEditor.titleBarStatePreview")}>
      <button type="button" className="w98-btn grow" aria-pressed={active} onClick={() => setActive(true)}>{t("windowAppearanceEditor.active")}</button>
      <button type="button" className="w98-btn grow" aria-pressed={!active} onClick={() => setActive(false)}>{t("windowAppearanceEditor.inactive")}</button>
    </div>
    {warnings.filter(([, ratio]) => ratio < 4.5).map(([field, ratio]) => <p key={field} role="status" className="p2-contrast-warning">{t("p2Appearance.lowContrast", { field, ratio: ratio.toFixed(2) })}</p>)}
    {!labelBackground ? <p className="w98-hint" role="status">{t("p2Appearance.wallpaperCheck")}</p> : null}
  </>;
}
