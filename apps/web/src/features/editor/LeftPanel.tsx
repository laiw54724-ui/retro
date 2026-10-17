import { useState } from "react";
import type { DesktopWindow, RetroTheme, SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { COMING_SOON, moduleDefinitions, registry } from "../modules/registry";
import { ThemeAppearanceEditor } from "./ThemeAppearanceEditor";

type Tab = "add" | "layers" | "theme";
type ViewMap = Record<string, "min" | "closed" | "max">;

type Props = {
  document: SiteDocument;
  selectedId: string | null;
  view: ViewMap;
  onAdd: (type: DesktopWindow["type"]) => void;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onTheme: (theme: RetroTheme) => void;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  initialTab?: Tab;
};

export function LeftPanel({ document, selectedId, view, onAdd, onSelect, onToggleVisible, onMoveLayer, onTheme, upload, initialTab = "add" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Array<[Tab, string]> = [["add", "新增"], ["layers", "視窗"], ["theme", "主題"]];
  return (
    <aside id="editor-left-panel" className="left-panel2" aria-label="工具面板">
      <div role="tablist" className="w98-tabs">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="w98-tabpanel w98-scroll panel-scroll" role="tabpanel">
        {tab === "add" ? <AddTab onAdd={onAdd} /> : null}
        {tab === "layers" ? <LayersTab document={document} selectedId={selectedId} view={view} onSelect={onSelect} onToggleVisible={onToggleVisible} onMoveLayer={onMoveLayer} /> : null}
        {tab === "theme" ? <ThemeAppearanceEditor theme={document.theme} onTheme={onTheme} upload={upload} /> : null}
      </div>
    </aside>
  );
}

function AddTab({ onAdd }: { onAdd: Props["onAdd"] }) {
  return (
    <>
      <strong>新增視窗</strong>
      <span className="w98-hint">點一下就會加到桌面上，並自動建立桌面圖示。</span>
      {moduleDefinitions.map((module) => (
        <button key={module.type} type="button" className="w98-btn add-card" onClick={() => onAdd(module.type)}>
          <Icon name={module.icon} size={32} />
          <span className="add-card-text"><strong>{module.label}</strong><span>{module.description}</span></span>
        </button>
      ))}
      <div className="w98-sep" />
      <strong style={{ color: "var(--w98-muted)" }}>即將推出</strong>
      <div className="soon">{COMING_SOON.map((name) => <span key={name}>{name}</span>)}</div>
    </>
  );
}

function LayersTab({ document, selectedId, view, onSelect, onToggleVisible, onMoveLayer }: Pick<Props, "document" | "selectedId" | "view" | "onSelect" | "onToggleVisible" | "onMoveLayer">) {
  const ordered = [...document.windows].sort((a, b) => b.layout.desktop.z - a.layout.desktop.z);
  return (
    <>
      <strong>視窗與層級</strong>
      <span className="w98-hint">上面的視窗會疊在最前面。隱藏的視窗仍保留桌面圖示。</span>
      {ordered.length === 0 ? <span className="layers-empty">還沒有視窗</span> : null}
      <div className="layers w98-sunken">
        {ordered.map((window, index) => {
          const hidden = view[window.id] === "closed" || view[window.id] === "min";
          const selected = selectedId === window.id;
          return (
            <div key={window.id} className={"layer" + (selected ? " selected" : "")}>
              <button type="button" className="layer-main" onClick={() => onSelect(window.id)}>
                <Icon name={window.icon} size={18} />
                <span className="layer-text"><span className="layer-title">{window.title}</span><small>{hidden ? "已隱藏" : "顯示中"}</small></span>
              </button>
              <button type="button" className="mini-btn" onClick={() => onToggleVisible(window.id)}>{hidden ? "顯示" : "隱藏"}</button>
              <button type="button" className="mini-btn" aria-label="往前一層" disabled={index === 0} onClick={() => onMoveLayer(window.id, 1)}>▲</button>
              <button type="button" className="mini-btn" aria-label="往後一層" disabled={index === ordered.length - 1} onClick={() => onMoveLayer(window.id, -1)}>▼</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
