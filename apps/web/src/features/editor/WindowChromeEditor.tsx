import { useEffect, useState } from "react";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { resolveWindowChrome, type DesktopWindow, type RetroTheme, type WindowChromeConfig, type WindowChromePreset, type WindowChromeSection } from "@retrodesk/shared";
import { RetroWindow } from "../../components/RetroWindow";
import { resolveWindowAppearance } from "../../lib/windowAppearance";
import styles from "./WindowChromeEditor.module.css";

type Props = {
  theme: RetroTheme;
  window: DesktopWindow;
  onChange: (chrome: WindowChromeConfig | undefined) => void;
  /** Runtime capabilities supplied by a future App host; never inferred from window.type. */
  availableSlots?: readonly WindowChromeSection[];
};

const presets = (): readonly [WindowChromePreset, string, string][] => [
  ["classic-95", "Classic 95", i18n.t("editor:windowChromeEditor.solidTitle3dBorder")],
  ["classic-98", "Classic 98", i18n.t("editor:windowChromeEditor.gradientTitleStandardSpacing")],
  ["compact-98", "Compact 98", i18n.t("editor:windowChromeEditor.compactTitleNarrowSpacing")]
];
const sectionLabels = (): Record<WindowChromeSection, string> => ({ menuBar: i18n.t("editor:windowChromeEditor.menuBar"), toolbar: i18n.t("editor:windowChromeEditor.toolbar"), statusBar: i18n.t("editor:windowChromeEditor.statusBar"), footerActions: i18n.t("editor:windowChromeEditor.bottomActionBar") });
const noSlots: readonly WindowChromeSection[] = [];

/** Draft/preview locally; Apply is a single existing updateWindow history transaction. */
export function WindowChromeEditor({ theme, window: win, onChange, availableSlots = noSlots }: Props) {
  const { t: tr } = useTranslation("editor");
  const saved = JSON.stringify(win.chrome ?? null);
  const [draft, setDraft] = useState(() => resolveWindowChrome(win.chrome));
  const [reset, setReset] = useState(false);
  useEffect(() => { setDraft(resolveWindowChrome(JSON.parse(saved) ?? undefined)); setReset(false); }, [win.id, saved]);
  const original = resolveWindowChrome(win.chrome);
  const dirty = reset ? win.chrome !== undefined : JSON.stringify(draft) !== JSON.stringify(original);
  const patch = (change: Partial<WindowChromeConfig>) => { setDraft((current) => ({ ...current, ...change })); setReset(false); };
  const cancel = () => { setDraft(original); setReset(false); };
  const combo = draft.controls.length === 3 ? "all" : draft.controls.length === 0 ? "none" : draft.controls.length === 1 && draft.controls[0] === "close" ? "close" : "custom";
  return (
    <fieldset className={styles.editor} aria-label={tr("windowChromeEditor.windowStyle")}>
      <legend>{tr("windowChromeEditor.windowStyle")}</legend>
      <div className={styles.presets}>
        {presets().map(([preset, name, description]) => {
          const title = resolveWindowAppearance(theme, win.appearance, true, { preset });
          return <button key={preset} type="button" className={styles.preset} aria-pressed={!reset && draft.preset === preset} onClick={() => patch({ preset })}>
            <span className={styles.thumbnail} style={{ background: theme.face }} aria-hidden="true"><i style={{ background: title.titleBackground, height: preset === "compact-98" ? 11 : 14 }} /><b /></span>
            <strong>{name}</strong><small>{description}</small>
          </button>;
        })}
      </div>
      {win.appearance ? <p className={styles.note}>{tr("windowChromeEditor.titleColorsAndGradientFollow")}</p> : null}
      <div className={styles.preview} aria-label={tr("windowChromeEditor.liveWindowStylePreview")}>
        <RetroWindow title={win.title} icon={win.icon} theme={theme} appearance={win.appearance} chrome={reset ? undefined : draft} frameProps={{ role: "group", "aria-label": tr("windowChromeEditor.stylePreview") }} style={{ height: 90 }} bodyStyle={{ minHeight: 0 }}>
          <p className={styles.previewText}>{tr("windowChromeEditor.contentIsKeptTheDesktop")}</p>
        </RetroWindow>
      </div>
      <label className={styles.field}><span>{tr("windowChromeEditor.controls")}</span>
        <select aria-label={tr("windowChromeEditor.windowControls")} value={combo} onChange={(event) => patch({ controls: event.target.value === "all" ? ["minimize", "maximize", "close"] : event.target.value === "close" ? ["close"] : [] })}>
          <option value="all">{tr("windowChromeEditor.all")}</option><option value="close">{tr("windowChromeEditor.closeOnly")}</option><option value="none">{tr("windowChromeEditor.noControls")}</option>
          {combo === "custom" ? <option value="custom" disabled>{tr("windowChromeEditor.customValidCombination")}</option> : null}
        </select>
      </label>
      <label className={styles.check}><input type="checkbox" checked={draft.showIcon} onChange={(event) => patch({ showIcon: event.target.checked })} />{tr("windowChromeEditor.showTitleIcon")}</label>
      <label className={styles.check}><input type="checkbox" checked={draft.density === "compact"} onChange={(event) => patch({ density: event.target.checked ? "compact" : "normal" })} />{tr("windowChromeEditor.compactSpacing")}</label>
      <div className={styles.sections}>
        {(Object.keys(sectionLabels()) as WindowChromeSection[]).map((name) => {
          const app = availableSlots.includes(name);
          const supported = app || name === "statusBar";
          const checked = draft.sections?.[name] ?? app;
          return <label key={name} className={styles.section}>
            <input type="checkbox" aria-label={sectionLabels()[name]} checked={checked} disabled={!supported} onChange={(event) => patch({ sections: { ...draft.sections, [name]: event.target.checked } })} />
            <span>{sectionLabels()[name]}<small>{app ? tr("windowChromeEditor.providedByTheApp") : name === "statusBar" ? tr("windowChromeEditor.providedByTheWindow") : tr("windowChromeEditor.notProvidedByThisApp")}</small></span>
          </label>;
        })}
      </div>
      <p className={styles.note}>{tr("windowChromeEditor.mobileUsesTheSameStyle")}</p>
      <button type="button" className="w98-btn" disabled={!win.chrome && !dirty} onClick={() => { setDraft(resolveWindowChrome()); setReset(true); }}>{tr("windowChromeEditor.resetWindowStyle")}</button>
      <div className={styles.actions}>
        <button type="button" className="w98-btn" disabled={!dirty} onClick={cancel}>{tr("windowChromeEditor.cancelStyleChanges")}</button>
        <button type="button" className="w98-btn" disabled={!dirty} onClick={() => onChange(reset ? undefined : draft)}>{tr("windowChromeEditor.applyWindowStyle")}</button>
      </div>
      <span role="status" className={styles.note}>{reset && dirty ? tr("windowChromeEditor.onlyTheWindowStyleIs") : dirty ? tr("windowChromeEditor.previewingNotAppliedYet") : tr("windowChromeEditor.alreadyMatchesTheCurrentWindow")}</span>
    </fieldset>
  );
}
