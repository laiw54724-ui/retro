import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { sameDocumentContent, type DesktopWindow, type RetroTheme } from "@retrodesk/shared";
import { AppearanceColorControls, AppearanceColorPreview } from "./AppearanceColorControls";
import { resetTitleAppearance } from "./appearanceDraft";

type Props = { theme: RetroTheme; window: DesktopWindow; onChange: (appearance: DesktopWindow["appearance"], historyKey?: string) => void };

/** One canonical mutation on Apply; preview/reset/cancel only touch local state. */
export function WindowColorAppearanceEditor({ theme, window, onChange }: Props) {
  const { t } = useTranslation("editor");
  const [draft, setDraft] = useState(window.appearance);
  const [generation, setGeneration] = useState(0);
  useEffect(() => { setDraft(window.appearance); setGeneration((value) => value + 1); }, [window.id, window.appearance]);
  const changed = !sameDocumentContent(draft, window.appearance);
  const cancel = () => { setDraft(window.appearance); setGeneration((value) => value + 1); };
  return <fieldset className="appearance-editor" data-appearance-p2-writer>
    <legend>{t("p2Appearance.windowColors")}</legend>
    <AppearanceColorPreview theme={theme} window={window} appearance={draft} />
    <div className="theme-draft-actions">
      <button type="button" className="w98-btn primary" disabled={!changed} onClick={() => onChange(draft)}>{t("p2Appearance.apply")}</button>
      <button type="button" className="w98-btn" onClick={cancel}>{t("p2Appearance.cancel")}</button>
    </div>
    <AppearanceColorControls key={generation} theme={theme} window={window} appearance={draft} onChange={setDraft} />
    <div className="p2-reset-actions">
      <button type="button" className="w98-btn block" onClick={() => setDraft(resetTitleAppearance(draft))}>{t("windowAppearanceEditor.restoreThemeSettings")}</button>
      <button type="button" className="w98-btn block" disabled={!draft} onClick={() => setDraft(undefined)}>{t("p2Appearance.resetWindow")}</button>
    </div>
  </fieldset>;
}
