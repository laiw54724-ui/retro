import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import { resolveWindowAppearance } from "../../lib/windowAppearance";
import { AppearanceColorInput } from "./AppearanceColorInput";

type Props = {
  theme: RetroTheme;
  window: DesktopWindow;
  onChange: (appearance: DesktopWindow["appearance"], historyKey?: string) => void;
};

export function WindowAppearanceEditor({ theme, window, onChange }: Props) {
  const { t: tr } = useTranslation("editor");
  const [active, setActive] = useState(true);
  const appearance = window.appearance;
  const defaults = { titleFrom: theme.titleFrom, titleTo: theme.titleTo, titleGradient: window.chrome?.preset !== "classic-95" };
  const patch = (change: Partial<NonNullable<DesktopWindow["appearance"]>>, key?: string) =>
    onChange({ ...defaults, ...appearance, ...change }, key ? `${key}:${window.id}` : undefined);
  const preview = resolveWindowAppearance(theme, appearance, active, { preset: window.chrome?.preset });
  return (
    <fieldset className="appearance-editor">
      <legend>{tr("windowAppearanceEditor.titleBarAppearance")}</legend>
      <label className="check-row"><input type="checkbox" aria-label={tr("windowAppearanceEditor.customTitleBar")} checked={!!appearance} onChange={(event) => onChange(event.target.checked ? defaults : undefined)} />{tr("windowAppearanceEditor.customTitleBar")}</label>
      <div className="titlebar-preview" aria-label={tr("windowAppearanceEditor.titleBarPreview")} style={{ background: preview.titleBackground, color: preview.titleColor }}>{window.title}</div>
      <div className="seg" role="group" aria-label={tr("windowAppearanceEditor.titleBarStatePreview")}>
        <button type="button" className="w98-btn grow" aria-pressed={active} onClick={() => setActive(true)}>{tr("windowAppearanceEditor.active")}</button>
        <button type="button" className="w98-btn grow" aria-pressed={!active} onClick={() => setActive(false)}>{tr("windowAppearanceEditor.inactive")}</button>
      </div>
      <div className="color-fields">
        <AppearanceColorInput label={tr("windowAppearanceEditor.titleStartColor")} disabled={!appearance} value={appearance?.titleFrom ?? theme.titleFrom} onChange={(titleFrom) => patch({ titleFrom }, "title-from")} />
        <AppearanceColorInput label={tr("windowAppearanceEditor.titleEndColor")} disabled={!appearance || !appearance.titleGradient} value={appearance?.titleTo ?? theme.titleTo} onChange={(titleTo) => patch({ titleTo }, "title-to")} />
      </div>
      <label className="check-row"><input type="checkbox" aria-label={tr("windowAppearanceEditor.useGradient")} disabled={!appearance} checked={appearance?.titleGradient ?? defaults.titleGradient} onChange={(event) => patch({ titleGradient: event.target.checked })} />{tr("windowAppearanceEditor.useGradient")}</label>
      <span className="w98-hint">{tr("windowAppearanceEditor.textColorFollowsTheBackground")}</span>
      <button type="button" className="w98-btn block" disabled={!appearance} onClick={() => onChange(undefined)}>{tr("windowAppearanceEditor.restoreThemeSettings")}</button>
    </fieldset>
  );
}
