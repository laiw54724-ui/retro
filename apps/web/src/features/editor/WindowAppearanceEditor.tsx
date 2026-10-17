import { useState } from "react";
import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import { resolveWindowAppearance } from "../../lib/windowAppearance";
import { AppearanceColorInput } from "./AppearanceColorInput";

type Props = {
  theme: RetroTheme;
  window: DesktopWindow;
  onChange: (appearance: DesktopWindow["appearance"], historyKey?: string) => void;
};

export function WindowAppearanceEditor({ theme, window, onChange }: Props) {
  const [active, setActive] = useState(true);
  const appearance = window.appearance;
  const defaults = { titleFrom: theme.titleFrom, titleTo: theme.titleTo, titleGradient: window.chrome?.preset !== "classic-95" };
  const patch = (change: Partial<NonNullable<DesktopWindow["appearance"]>>, key?: string) =>
    onChange({ ...defaults, ...appearance, ...change }, key ? `${key}:${window.id}` : undefined);
  const preview = resolveWindowAppearance(theme, appearance, active, { preset: window.chrome?.preset });
  return (
    <fieldset className="appearance-editor">
      <legend>標題列外觀</legend>
      <label className="check-row"><input type="checkbox" aria-label="自訂標題列" checked={!!appearance} onChange={(event) => onChange(event.target.checked ? defaults : undefined)} />自訂標題列</label>
      <div className="titlebar-preview" aria-label="標題列預覽" style={{ background: preview.titleBackground, color: preview.titleColor }}>{window.title}</div>
      <div className="seg" role="group" aria-label="預覽標題列狀態">
        <button type="button" className="w98-btn grow" aria-pressed={active} onClick={() => setActive(true)}>作用中</button>
        <button type="button" className="w98-btn grow" aria-pressed={!active} onClick={() => setActive(false)}>未作用中</button>
      </div>
      <div className="color-fields">
        <AppearanceColorInput label="標題起始色" disabled={!appearance} value={appearance?.titleFrom ?? theme.titleFrom} onChange={(titleFrom) => patch({ titleFrom }, "title-from")} />
        <AppearanceColorInput label="標題結束色" disabled={!appearance || !appearance.titleGradient} value={appearance?.titleTo ?? theme.titleTo} onChange={(titleTo) => patch({ titleTo }, "title-to")} />
      </div>
      <label className="check-row"><input type="checkbox" aria-label="使用漸層" disabled={!appearance} checked={appearance?.titleGradient ?? defaults.titleGradient} onChange={(event) => patch({ titleGradient: event.target.checked })} />使用漸層</label>
      <span className="w98-hint">文字色自動配合背景；未作用中沿用主題配色。</span>
      <button type="button" className="w98-btn block" disabled={!appearance} onClick={() => onChange(undefined)}>恢復主題設定</button>
    </fieldset>
  );
}
