import { useState } from "react";
import type { DesktopWindow, SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { IconPicker } from "../modules/links/IconPicker";

type Tab = "general" | "icon" | "layout";

type Props = {
  document: SiteDocument;
  selected: DesktopWindow | null;
  siteId: string;
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
  onUpdate: (recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onEnterLayout: () => void;
  onSiteName: (name: string) => void;
  onColumns: (columns: 3 | 4) => void;
};

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)));

export function RightPanel({ document, selected, siteId, upload, onUpdate, onDelete, onDuplicate, onBringToFront, onEnterLayout, onSiteName, onColumns }: Props) {
  const [tab, setTab] = useState<Tab>("general");

  if (!selected) {
    return (
      <aside id="editor-right-panel" className="right-panel2" aria-label="屬性面板">
        <div className="w98-tabpanel w98-scroll panel-scroll">
          <div className="inspector-head"><Icon name="computer" size={22} /><strong>網站設定</strong></div>
          <label className="w98-field"><span>桌面名稱</span><input className="w98-input" value={document.siteName} onChange={(event) => onSiteName(event.target.value)} /></label>
          <div className="w98-field"><span>手機版圖示欄數</span>
            <div className="seg">
              {([3, 4] as const).map((count) => <button key={count} type="button" className={"mini-btn grow" + (document.mobileColumns === count ? " on" : "")} onClick={() => onColumns(count)}>{count} 欄</button>)}
            </div>
          </div>
          <button type="button" className="w98-btn block" onClick={onEnterLayout}>▦ 進入桌面排版模式</button>
          <p className="w98-hint">點畫布上的視窗或桌面圖示來選取，選取後可以修改標題、圖示、位置與大小。視窗內容直接在視窗裡編輯。</p>
        </div>
      </aside>
    );
  }

  const layout = selected.layout.desktop;
  const setDesktop = (change: Partial<typeof layout>, key?: string) =>
    onUpdate((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, ...change } } }), key);
  const setAppearance = (change: Partial<NonNullable<DesktopWindow["appearance"]>>, key?: string) =>
    onUpdate((window) => ({
      ...window,
      appearance: { titleFrom: document.theme.titleFrom, titleTo: document.theme.titleTo, titleGradient: true, ...window.appearance, ...change }
    }), key);
  const tabs: Array<[Tab, string]> = [["general", "通用"], ["icon", "圖示"], ["layout", "版面"]];

  return (
    <aside id="editor-right-panel" className="right-panel2" aria-label="屬性面板">
      <div className="inspector-head"><Icon name={selected.icon} size={22} /><strong>{selected.title}</strong></div>
      <div role="tablist" className="w98-tabs">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="w98-tabpanel w98-scroll panel-scroll" role="tabpanel">
        {tab === "general" ? (
          <>
            <label className="w98-field"><span>視窗標題</span>
              <input className="w98-input" value={selected.title} onChange={(event) => onUpdate((window) => ({ ...window, title: event.target.value }), "title" + selected.id)} />
            </label>
            <label className="check-row"><input type="checkbox" checked={selected.defaultOpen} onChange={(event) => onUpdate((window) => ({ ...window, defaultOpen: event.target.checked }))} />訪客打開網站時預設開啟</label>
            <div className="w98-sep" />
            <button type="button" className="w98-btn block" onClick={onBringToFront}>移到最前</button>
            <button type="button" className="w98-btn block" onClick={onDuplicate}>複製視窗</button>
            <button type="button" className="w98-btn block danger" onClick={onDelete}>刪除視窗</button>
          </>
        ) : null}
        {tab === "icon" ? (
          <>
            <span className="w98-hint">桌面與工作列上的圖示。</span>
            <IconPicker siteId={siteId} value={selected.icon} upload={upload} size={28} onChange={(icon) => onUpdate((window) => ({ ...window, icon }))} />
          </>
        ) : null}
        {tab === "layout" ? (
          <>
            <fieldset className="appearance-editor">
              <legend>標題列外觀</legend>
              <label className="check-row"><input type="checkbox" aria-label="自訂標題列" checked={!!selected.appearance} onChange={(event) => onUpdate((window) => ({ ...window, appearance: event.target.checked ? { titleFrom: document.theme.titleFrom, titleTo: document.theme.titleTo, titleGradient: true } : undefined }))} />自訂標題列</label>
              <div className="titlebar-preview" aria-hidden="true" style={{ background: selected.appearance ? (selected.appearance.titleGradient ? `linear-gradient(90deg, ${selected.appearance.titleFrom}, ${selected.appearance.titleTo})` : selected.appearance.titleFrom) : `linear-gradient(90deg, ${document.theme.titleFrom}, ${document.theme.titleTo})` }}>視窗標題</div>
              <div className="color-fields">
                <label className="w98-field"><span>起始色</span><input aria-label="標題起始色" type="color" disabled={!selected.appearance} value={selected.appearance?.titleFrom ?? document.theme.titleFrom} onChange={(event) => setAppearance({ titleFrom: event.target.value }, "title-from" + selected.id)} /></label>
                <label className="w98-field"><span>結束色</span><input aria-label="標題結束色" type="color" disabled={!selected.appearance || !selected.appearance.titleGradient} value={selected.appearance?.titleTo ?? document.theme.titleTo} onChange={(event) => setAppearance({ titleTo: event.target.value }, "title-to" + selected.id)} /></label>
              </div>
              <label className="check-row"><input type="checkbox" aria-label="使用漸層" disabled={!selected.appearance} checked={selected.appearance?.titleGradient ?? true} onChange={(event) => setAppearance({ titleGradient: event.target.checked })} />使用漸層</label>
              <button type="button" className="w98-btn block" disabled={!selected.appearance} onClick={() => onUpdate((window) => ({ ...window, appearance: undefined }))}>恢復主題設定</button>
            </fieldset>
            <div className="w98-sep" />
            <div className="geometry-grid">
              <label className="w98-field"><span>X</span><input className="w98-input" type="number" value={layout.x} onChange={(event) => setDesktop({ x: clamp(Number(event.target.value), 0, 5000) }, "x" + selected.id)} /></label>
              <label className="w98-field"><span>Y</span><input className="w98-input" type="number" value={layout.y} onChange={(event) => setDesktop({ y: clamp(Number(event.target.value), 0, 5000) }, "y" + selected.id)} /></label>
              <label className="w98-field"><span>寬</span><input className="w98-input" type="number" min={220} max={1400} value={layout.w} onChange={(event) => setDesktop({ w: clamp(Number(event.target.value), 220, 1400) }, "w" + selected.id)} /></label>
              <label className="w98-field"><span>高</span><input className="w98-input" type="number" min={140} max={1200} value={layout.h} onChange={(event) => setDesktop({ h: clamp(Number(event.target.value), 140, 1200) }, "h" + selected.id)} /></label>
            </div>
            <button type="button" className="w98-btn block" onClick={onEnterLayout}>▦ 進入排版模式</button>
            <span className="w98-hint">排版模式可以直接拖曳視窗與桌面圖示。</span>
          </>
        ) : null}
      </div>
    </aside>
  );
}
