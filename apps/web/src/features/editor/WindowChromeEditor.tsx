import { useEffect, useState } from "react";
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

const presets: readonly [WindowChromePreset, string, string][] = [
  ["classic-95", "Classic 95", "純色標題・立體框線"],
  ["classic-98", "Classic 98", "漸層標題・標準間距"],
  ["compact-98", "Compact 98", "緊湊標題・窄間距"]
];
const sectionLabels: Record<WindowChromeSection, string> = { menuBar: "選單列", toolbar: "工具列", statusBar: "狀態列", footerActions: "底部操作列" };
const noSlots: readonly WindowChromeSection[] = [];

/** Draft/preview locally; Apply is a single existing updateWindow history transaction. */
export function WindowChromeEditor({ theme, window: win, onChange, availableSlots = noSlots }: Props) {
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
    <fieldset className={styles.editor} aria-label="視窗樣式">
      <legend>視窗樣式</legend>
      <div className={styles.presets}>
        {presets.map(([preset, name, description]) => {
          const title = resolveWindowAppearance(theme, win.appearance, true, { preset });
          return <button key={preset} type="button" className={styles.preset} aria-pressed={!reset && draft.preset === preset} onClick={() => patch({ preset })}>
            <span className={styles.thumbnail} style={{ background: theme.face }} aria-hidden="true"><i style={{ background: title.titleBackground, height: preset === "compact-98" ? 11 : 14 }} /><b /></span>
            <strong>{name}</strong><small>{description}</small>
          </button>;
        })}
      </div>
      {win.appearance ? <p className={styles.note}>標題配色與漸層沿用你的自訂外觀；樣式只提供預設值。</p> : null}
      <div className={styles.preview} aria-label="視窗樣式即時預覽">
        <RetroWindow title={win.title} icon={win.icon} theme={theme} appearance={win.appearance} chrome={reset ? undefined : draft} frameProps={{ role: "group", "aria-label": "樣式預覽" }} style={{ height: 90 }} bodyStyle={{ minHeight: 0 }}>
          <p className={styles.previewText}>內容會保留。套用後更新桌面視窗。</p>
        </RetroWindow>
      </div>
      <label className={styles.field}><span>控制鈕</span>
        <select aria-label="視窗控制鈕" value={combo} onChange={(event) => patch({ controls: event.target.value === "all" ? ["minimize", "maximize", "close"] : event.target.value === "close" ? ["close"] : [] })}>
          <option value="all">全部</option><option value="close">僅關閉</option><option value="none">無控制鈕</option>
          {combo === "custom" ? <option value="custom" disabled>自訂合法組合</option> : null}
        </select>
      </label>
      <label className={styles.check}><input type="checkbox" checked={draft.showIcon} onChange={(event) => patch({ showIcon: event.target.checked })} />顯示標題圖示</label>
      <label className={styles.check}><input type="checkbox" checked={draft.density === "compact"} onChange={(event) => patch({ density: event.target.checked ? "compact" : "normal" })} />緊湊間距</label>
      <div className={styles.sections}>
        {(Object.keys(sectionLabels) as WindowChromeSection[]).map((name) => {
          const app = availableSlots.includes(name);
          const supported = app || name === "statusBar";
          const checked = draft.sections?.[name] ?? app;
          return <label key={name} className={styles.section}>
            <input type="checkbox" aria-label={sectionLabels[name]} checked={checked} disabled={!supported} onChange={(event) => patch({ sections: { ...draft.sections, [name]: event.target.checked } })} />
            <span>{sectionLabels[name]}<small>{app ? "由 App 提供" : name === "statusBar" ? "由視窗提供" : "此 App 未提供"}</small></span>
          </label>;
        })}
      </div>
      <p className={styles.note}>手機使用相同樣式，保留桌面返回鈕與較大的觸控範圍。沒有提供內容的區塊不占空間。</p>
      <button type="button" className="w98-btn" disabled={!win.chrome && !dirty} onClick={() => { setDraft(resolveWindowChrome()); setReset(true); }}>重設視窗樣式</button>
      <div className={styles.actions}>
        <button type="button" className="w98-btn" disabled={!dirty} onClick={cancel}>取消樣式變更</button>
        <button type="button" className="w98-btn" disabled={!dirty} onClick={() => onChange(reset ? undefined : draft)}>套用視窗樣式</button>
      </div>
      <span role="status" className={styles.note}>{reset && dirty ? "將只重設視窗樣式，保留配色、內容與位置。" : dirty ? "預覽中，尚未套用。" : "已與目前視窗一致。"}</span>
    </fieldset>
  );
}
