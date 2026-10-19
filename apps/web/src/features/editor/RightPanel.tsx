import { useImageWriter } from "./ImageWriteContext";
import { InspectorContent } from "./InspectorContent";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeWindow, type DesktopWindow, type SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { IconPicker } from "../modules/links/IconPicker";
import { WindowAppearanceEditor } from "./WindowAppearanceEditor";
import { WindowChromeEditor } from "./WindowChromeEditor";

type Tab = "general" | "icon" | "layout";

type Props = {
  document: SiteDocument;
  selected: DesktopWindow | null;
  siteId: string;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  onUpdate: (recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onEnterLayout: () => void;
  onSiteName: (name: string) => void;
  indexing: boolean;
  onIndexing: (indexing: boolean) => void;
  onColumns: (columns: 3 | 4) => void;
};

const clamp = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)));

function GeometryNumberInput({ value, min, max, onCommit }: { value: number; min: number; max: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  const composing = useRef(false);
  const cancelBlur = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw = draft) => {
    if (cancelBlur.current || composing.current) {
      cancelBlur.current = false;
      setDraft(String(value));
      return;
    }
    const text = raw.trim();
    const parsed = /^-?\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isSafeInteger(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(parsed, min, max);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return <input className="w98-input" type="text" inputMode="numeric" value={draft}
    onFocus={() => { focused.current = true; setDraft(String(value)); }}
    onChange={(event) => setDraft(event.target.value)}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={(event) => {
      composing.current = false;
      const text = event.currentTarget.value;
      setDraft(text);
      if (!focused.current) commit(text);
    }}
    onBlur={() => { focused.current = false; if (!composing.current) commit(); }}
    onKeyDown={(event) => {
      if (composing.current || event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { cancelBlur.current = true; event.currentTarget.blur(); return; }
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
    }} />;
}

export function RightPanel({ document, selected, siteId, upload, onUpdate, onDelete, onDuplicate, onBringToFront, onEnterLayout, onSiteName, indexing, onIndexing, onColumns }: Props) {
  const { t: tr } = useTranslation("editor");
  const imageWriter = useImageWriter();
  const [tab, setTab] = useState<Tab>("general");

  if (!selected) {
    return (
      <aside id="editor-right-panel" className="right-panel2" aria-label={tr("rightPanel.propertiesPanel")}>
        <div className="w98-tabpanel w98-scroll panel-scroll">
          <div className="inspector-head"><Icon name="computer" size={22} /><strong>{tr("rightPanel.siteSettings")}</strong></div>
          <label className="w98-field"><span>{tr("rightPanel.desktopName")}</span><input className="w98-input" value={document.siteName} onChange={(event) => onSiteName(event.target.value)} /></label>
          <label className="check-row"><input type="checkbox" checked={indexing} onChange={(event) => onIndexing(event.target.checked)} />{tr("rightPanel.allowSearchEnginesToIndex")}</label>
          <p className="w98-hint">{tr("rightPanel.whenOffThePublicUrl")}</p>
          <div className="w98-field"><span>{tr("rightPanel.mobileIconColumns")}</span>
            <div className="seg">
              {([3, 4] as const).map((count) => <button key={count} type="button" className={"mini-btn grow" + (document.mobileColumns === count ? " on" : "")} onClick={() => onColumns(count)}>{tr("layout.columnCount", { count })}</button>)}
            </div>
          </div>
          <button type="button" className="w98-btn block" onClick={onEnterLayout}>{tr("rightPanel.enterDesktopLayoutMode")}</button>
          <p className="w98-hint">{tr("rightPanel.clickAWindowOrDesktop")}</p>
        </div>
      </aside>
    );
  }

  const layout = selected.layout.desktop;
  const setDesktop = (change: Partial<typeof layout>, key?: string) =>
    onUpdate((window) => ({ ...window, layout: { ...window.layout, desktop: { ...window.layout.desktop, ...change } } }), key);
  const tabs: Array<[Tab, string]> = [["general", tr("rightPanel.general")], ["icon", tr("rightPanel.icon")], ["layout", tr("rightPanel.layout")]];

  return (
    <aside id="editor-right-panel" className="right-panel2" aria-label={tr("rightPanel.propertiesPanel")}>
      <div className="inspector-head"><Icon name={selected.icon} size={22} /><strong>{selected.title}</strong></div>
      <div role="tablist" className="w98-tabs">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="w98-tabpanel w98-scroll panel-scroll" role="tabpanel">
        {tab === "general" ? (
          <>
            <label className="w98-field"><span>{tr("mobileEditor.windowTitle")}</span>
              <input className="w98-input" value={selected.title} onChange={(event) => onUpdate((window) => ({ ...window, title: event.target.value }), "title" + selected.id)} />
            </label>
            <label className="check-row"><input type="checkbox" checked={selected.defaultOpen} onChange={(event) => onUpdate((window) => ({ ...window, defaultOpen: event.target.checked }))} />{tr("rightPanel.openByDefaultWhenVisitors")}</label>
            {selected.type === "image" ? <InspectorContent key={selected.id} window={selected} allWindows={document.windows} siteId={siteId} theme={document.theme} upload={upload} update={onUpdate} onMessage={() => undefined} /> : null}
            <div className="w98-sep" />
            <button type="button" className="w98-btn block" onClick={onBringToFront}>{tr("rightPanel.bringToFront")}</button>
            <button type="button" className="w98-btn block" disabled={selected.type === "image" && !imageWriter} onClick={onDuplicate}>{tr("rightPanel.duplicateWindow")}</button>
            <button type="button" className="w98-btn block danger" onClick={onDelete}>{tr("mobileEditor.deleteWindow")}</button>
          </>
        ) : null}
        {tab === "icon" ? (
          <>
            <span className="w98-hint">{tr("rightPanel.theIconShownOnThe")}</span>
            <IconPicker key={selected.id} siteId={siteId} value={selected.icon} upload={upload} mediaTarget={{ windowId: selected.id, windowType: selected.type }} size={28} label={selected.title} defaultValue={makeWindow(selected.type).icon} onChange={(icon) => onUpdate((window) => ({ ...window, icon }))} />
          </>
        ) : null}
        {tab === "layout" ? (
          <>
            <WindowChromeEditor key={selected.id} theme={document.theme} window={selected} onChange={(chrome) => onUpdate((window) => ({ ...window, chrome }))} />
            <WindowAppearanceEditor key={selected.id} theme={document.theme} window={selected} onChange={(appearance, historyKey) => onUpdate((window) => ({ ...window, appearance }), historyKey)} />
            <div className="w98-sep" />
            <div className="geometry-grid">
              <label className="w98-field"><span>X</span><GeometryNumberInput key={`${selected.id}-x`} value={layout.x} min={0} max={5000} onCommit={(x) => setDesktop({ x })} /></label>
              <label className="w98-field"><span>Y</span><GeometryNumberInput key={`${selected.id}-y`} value={layout.y} min={0} max={5000} onCommit={(y) => setDesktop({ y })} /></label>
              <label className="w98-field"><span>{tr("rightPanel.w")}</span><GeometryNumberInput key={`${selected.id}-w`} value={layout.w} min={220} max={1400} onCommit={(w) => setDesktop({ w })} /></label>
              <label className="w98-field"><span>{tr("rightPanel.h")}</span><GeometryNumberInput key={`${selected.id}-h`} value={layout.h} min={140} max={1200} onCommit={(h) => setDesktop({ h })} /></label>
            </div>
            <button type="button" className="w98-btn block" onClick={onEnterLayout}>{tr("rightPanel.enterLayoutMode")}</button>
            <span className="w98-hint">{tr("rightPanel.inLayoutModeYouCan")}</span>
          </>
        ) : null}
      </div>
    </aside>
  );
}
