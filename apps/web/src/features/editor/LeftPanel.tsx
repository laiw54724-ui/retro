import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { THEME_PRESETS, type DesktopWindow, type RetroTheme, type SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { isDark, mixHex, themeView, useThemeView } from "../../lib/themeView";
import { COMING_SOON, moduleDefinitions, registry } from "../modules/registry";
import { FilePick } from "../modules/ui";
import { useLocaleFormatting } from "../../i18n/format";

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
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  initialTab?: Tab;
};

export function LeftPanel({ document, selectedId, view, onAdd, onSelect, onToggleVisible, onMoveLayer, onTheme, upload, initialTab = "add" }: Props) {
  const { t } = useTranslation("editor");
  const { fontFamily } = useLocaleFormatting();
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: Tab[] = ["add", "layers", "theme"];
  return (
    <aside id="editor-left-panel" className="left-panel2" aria-label={t("shell.toolsPanel")} style={{ fontFamily }}>
      <div role="tablist" className="w98-tabs" aria-label={t("shell.toolsTabs")}>
        {tabs.map((id) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{t(`tabs.${id}`)}</button>)}
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
  const { t } = useTranslation("editor");
  // The legacy coming-soon list contains product labels, not persisted window data.
  const comingSoonKeys: Record<string, "add.diary" | "add.characterProfile" | "add.visualNovel"> = { "日記": "add.diary", "角色檔案": "add.characterProfile", "視覺小說": "add.visualNovel" };
  return (
    <>
      <strong>{t("add.heading")}</strong>
      <span className="w98-hint">{t("add.hint")}</span>
      {moduleDefinitions.map((module) => (
        <button key={module.type} type="button" className="w98-btn add-card" onClick={() => onAdd(module.type)}>
          <Icon name={module.icon} size={32} />
          <span className="add-card-text"><strong>{t(`modules.${module.type}.label`, { defaultValue: module.label })}</strong><span>{t(`modules.${module.type}.description`, { defaultValue: module.description })}</span></span>
        </button>
      ))}
      <div className="w98-sep" />
      <strong style={{ color: "var(--w98-muted)" }}>{t("add.comingSoon")}</strong>
      <div className="soon">{COMING_SOON.map((name) => <span key={name}>{comingSoonKeys[name] ? t(comingSoonKeys[name], { defaultValue: name }) : name}</span>)}</div>
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
  const [draft, setDraft] = useState(theme);
  useEffect(() => setDraft(theme), [theme]);
  const patch = (change: Partial<RetroTheme>) => setDraft((current) => ({ ...current, ...change }));
  const changed = JSON.stringify(draft) !== JSON.stringify(theme);
  const setWall = (wall: string) => patch({ wall, pattern: draft.pattern === "image" ? "none" : draft.pattern, wallImage: null, patternColor: mixHex(wall, "#ffffff", isDark(wall) ? 0.22 : 0.45) });
  async function uploadWall(file: File) {
    const url = await upload?.(file, "image");
    if (url) patch({ wallImage: url, pattern: "image" });
  }
  const reset = () => setDraft(THEME_PRESETS[theme.id] ?? THEME_PRESETS.classic98);
  const patterns = draft.wallImage ? [...PATTERNS, ["image", "圖片"] as [RetroTheme["pattern"], string]] : PATTERNS;
  const preview = themeView(draft);

  return (
    <>
      <div className="theme-head"><strong>主題</strong><button type="button" className="w98-btn small" onClick={reset}>預覽重設</button></div>
      <div className="theme-draft-preview" aria-label="主題預覽" style={{ backgroundColor: draft.wall, backgroundImage: preview.wallImageCss, backgroundSize: preview.wallSize, color: preview.text }}><span style={{ background: preview.titleBg, color: preview.titleText }}>Active window</span><i style={{ background: preview.inactiveTitle, color: preview.text }}>Inactive window</i><b style={{ background: draft.face, boxShadow: preview.bevel }}>Aa 中英文</b></div>
      <div className="theme-draft-actions"><button type="button" className="w98-btn primary" disabled={!changed} onClick={() => onTheme(draft)}>套用主題</button><button type="button" className="w98-btn" disabled={!changed} onClick={() => setDraft(theme)}>取消預覽</button></div>
      <fieldset className="w98-fieldset"><legend>預設主題</legend>
        <div className="preset-grid">
          {Object.values(THEME_PRESETS).map((preset) => {
            const tv = themeView(preset);
            return (
              <button key={preset.id} type="button" className={"preset" + (draft.id === preset.id ? " on" : "")} aria-pressed={draft.id === preset.id} onClick={() => setDraft(preset)}>
                <span className="preset-thumb" style={{ backgroundColor: preset.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize }}><i style={{ background: tv.titleBg }} /></span>
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>桌布</legend>
        <div className="swatches">{WALLS.map((color) => <button key={color} type="button" aria-label={`桌布顏色 ${color}`} aria-pressed={draft.wall === color} className="swatch sq26" style={{ background: color, outline: draft.wall === color ? "2px solid #000080" : "none" }} onClick={() => setWall(color)} />)}</div>
        <span className="w98-hint">圖樣</span>
        <div className="swatches">{patterns.map(([id, label]) => <button key={id} type="button" className={"mini-btn wide" + (draft.pattern === id ? " on" : "")} onClick={() => patch({ pattern: id })}>{label}</button>)}</div>
        <FilePick className="w98-btn small block" onFiles={(files) => void uploadWall(files[0])}>上傳桌布圖片…</FilePick>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>視窗標題列</legend>
        <div className="title-swatches">{TITLES.map(([from, to]) => <button key={from + to} type="button" aria-label="標題列配色" aria-pressed={draft.titleFrom === from && draft.titleTo === to} className="swatch h20" style={{ background: `linear-gradient(90deg, ${from}, ${to})`, outline: draft.titleFrom === from && draft.titleTo === to ? "2px solid #000080" : "none" }} onClick={() => patch({ titleFrom: from, titleTo: to, accent: from })} />)}</div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>工作列</legend>
        <div className="swatches">{TASKBARS.map((color) => <button key={color} type="button" aria-label={`工作列顏色 ${color}`} aria-pressed={draft.taskbar === color} className="swatch sq26" style={{ background: color, outline: draft.taskbar === color ? "2px solid #000080" : "none" }} onClick={() => patch({ taskbar: color })} />)}</div>
      </fieldset>
      <fieldset className="w98-fieldset"><legend>圖示樣式與字型</legend>
        <div className="swatches">{ICON_STYLES.map(([id, label]) => <button key={id} type="button" className={"mini-btn grow" + (draft.iconStyle === id ? " on" : "")} onClick={() => patch({ iconStyle: id })}>{label}</button>)}</div>
        <span className="w98-hint">全站字型：Cubic 11（中英文）</span>
      </fieldset>
    </>
  );
}
