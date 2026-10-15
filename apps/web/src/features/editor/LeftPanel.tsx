import { useState } from "react";
import { THEME_PRESETS, type DesktopWindow, type RetroTheme, type SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { isDark, mixHex, themeView } from "../../lib/themeView";
import { COMING_SOON, WINDOW_TYPES, registry } from "../modules/registry";
import { FilePick } from "../modules/ui";

type Tab = "add" | "layers" | "theme";
type ViewMap = Record<string, "min" | "closed" | "max">;

const WALLS = ["#008080", "#ffd6e5", "#c9b8f0", "#a8e0cf", "#9fd8f5", "#ffe9b3", "#1d1a3a", "#ffffff"];
const TITLES: Array<[string, string]> = [["#000080", "#f48fb1"], ["#000080", "#1084d0"], ["#5b3fa8", "#b39ddb"], ["#1f7a5c", "#7fd1b0"], ["#2a2470", "#e05a9b"], ["#0a0a0a", "#808080"]];
const TASKBARS = ["#c0c0c0", "#e6def7", "#dff2ea", "#fff3d6", "#f4dde7"];
const PATTERNS: Array<[RetroTheme["pattern"], string]> = [["none", "無"], ["dots", "圓點"], ["checker", "棋盤"], ["stars", "星星"]];
const ICON_STYLES: Array<[RetroTheme["iconStyle"], string]> = [["classic", "經典"], ["sticker", "貼紙"], ["tile", "方塊"]];

type Props = {
  document: SiteDocument;
  selectedId: string | null;
  view: ViewMap;
  onAdd: (type: DesktopWindow["type"]) => void;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onTheme: (theme: RetroTheme) => void;
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
  initialTab?: Tab;
};

export function LeftPanel({ document, selectedId, view, onAdd, onSelect, onToggleVisible, onMoveLayer, onTheme, upload, initialTab = "add" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Array<[Tab, string]> = [["add", "新增"], ["layers", "視窗"], ["theme", "主題"]];
  return (
    <aside className="left-panel2" aria-label="工具面板">
      <div role="tablist" className="w98-tabs">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <div className="w98-tabpanel w98-scroll panel-scroll" role="tabpanel">
        {tab === "add" ? <AddTab onAdd={onAdd} /> : null}
        {tab === "layers" ? <LayersTab document={document} selectedId={selectedId} view={view} onSelect={onSelect} onToggleVisible={onToggleVisible} onMoveLayer={onMoveLayer} /> : null}
        {tab === "theme" ? <ThemeTab theme={document.theme} onTheme={onTheme} upload={upload} /> : null}
      </div>
    </aside>
  );
}

function AddTab({ onAdd }: { onAdd: Props["onAdd"] }) {
  return (
    <>
      <strong>新增視窗</strong>
      <span className="w98-hint">點一下就會加到桌面上，並自動建立桌面圖示。</span>
      {WINDOW_TYPES.map((type) => (
        <button key={type} type="button" className="w98-btn add-card" onClick={() => onAdd(type)}>
          <Icon name={registry[type].icon} size={32} />
          <span className="add-card-text"><strong>{registry[type].label}</strong><span>{registry[type].description}</span></span>
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

function ThemeTab({ theme, onTheme, upload }: { theme: RetroTheme; onTheme: Props["onTheme"]; upload?: Props["upload"] }) {
  const patch = (change: Partial<RetroTheme>) => onTheme({ ...theme, ...change });
  const setWall = (wall: string) => patch({ wall, pattern: theme.pattern === "image" ? "none" : theme.pattern, wallImage: null, patternColor: mixHex(wall, isDark(wall) ? "#ffffff" : "#ffffff", isDark(wall) ? 0.22 : 0.45) });
  async function uploadWall(file: File) {
    const url = await upload?.(file, "image");
    if (url) patch({ wallImage: url, pattern: "image" });
  }
  const reset = () => onTheme(THEME_PRESETS[theme.id] ?? THEME_PRESETS.classic98);
  const patterns = theme.wallImage ? [...PATTERNS, ["image", "圖片"] as [RetroTheme["pattern"], string]] : PATTERNS;

  return (
    <>
      <div className="theme-head"><strong>主題</strong><button type="button" className="w98-btn small" onClick={reset}>重設</button></div>
      <fieldset className="w98-fieldset"><legend>預設主題</legend>
        <div className="preset-grid">
          {Object.values(THEME_PRESETS).map((preset) => {
            const tv = themeView(preset);
            return (
              <button key={preset.id} type="button" className={"preset" + (theme.id === preset.id ? " on" : "")} aria-pressed={theme.id === preset.id} onClick={() => onTheme(preset)}>
                <span className="preset-thumb" style={{ backgroundColor: preset.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize }}><i style={{ background: tv.titleBg }} /></span>
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>桌布</legend>
        <div className="swatches">{WALLS.map((color) => <button key={color} type="button" aria-label={`桌布顏色 ${color}`} aria-pressed={theme.wall === color} className="swatch sq26" style={{ background: color, outline: theme.wall === color ? "2px solid #000080" : "none" }} onClick={() => setWall(color)} />)}</div>
        <span className="w98-hint">圖樣</span>
        <div className="swatches">{patterns.map(([id, label]) => <button key={id} type="button" className={"mini-btn wide" + (theme.pattern === id ? " on" : "")} onClick={() => patch({ pattern: id })}>{label}</button>)}</div>
        <FilePick className="w98-btn small block" onFiles={(files) => void uploadWall(files[0])}>上傳桌布圖片…</FilePick>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>視窗標題列</legend>
        <div className="title-swatches">{TITLES.map(([from, to]) => <button key={from + to} type="button" aria-label="標題列配色" aria-pressed={theme.titleFrom === from && theme.titleTo === to} className="swatch h20" style={{ background: `linear-gradient(90deg, ${from}, ${to})`, outline: theme.titleFrom === from && theme.titleTo === to ? "2px solid #000080" : "none" }} onClick={() => patch({ titleFrom: from, titleTo: to, accent: from })} />)}</div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>工作列</legend>
        <div className="swatches">{TASKBARS.map((color) => <button key={color} type="button" aria-label={`工作列顏色 ${color}`} aria-pressed={theme.taskbar === color} className="swatch sq26" style={{ background: color, outline: theme.taskbar === color ? "2px solid #000080" : "none" }} onClick={() => patch({ taskbar: color })} />)}</div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>圖示樣式與字型</legend>
        <div className="swatches">{ICON_STYLES.map(([id, label]) => <button key={id} type="button" className={"mini-btn grow" + (theme.iconStyle === id ? " on" : "")} onClick={() => patch({ iconStyle: id })}>{label}</button>)}</div>
        <span className="w98-hint">全站字型：Cubic 11（中英文）</span>
      </fieldset>
    </>
  );
}
