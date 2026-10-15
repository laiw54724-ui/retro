import { useMemo, useState } from "react";
import { THEME_PRESETS, type DesktopWindow, type SiteDocument } from "@retrodesk/shared";
import { RetroButton } from "../../components/RetroButton";
import { RetroWindow } from "../../components/RetroWindow";
import { InspectorContent } from "./InspectorContent";
import { WindowRenderer } from "../site/WindowRenderer";

type Mode = "desktop" | "add" | "edit" | "theme" | "preview";

const modules: Array<{ type: DesktopWindow["type"]; label: string; desc: string }> = [
  { type: "document", label: "文件", desc: "文字、圖片、按鈕與清單" },
  { type: "gallery", label: "相簿", desc: "圖片網格與說明" },
  { type: "links", label: "連結", desc: "社群與外部網址" },
  { type: "about", label: "關於我", desc: "頭像、簡介與欄位" },
  { type: "instagram", label: "復古 IG", desc: "個人頁與貼文" }
];

type Props = {
  document: SiteDocument;
  siteId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (type: DesktopWindow["type"]) => void;
  onUpdate: (id: string, recipe: (window: DesktopWindow) => DesktopWindow) => void;
  onDelete: (id: string) => void;
  onTheme: (theme: SiteDocument["theme"]) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onColumns: (columns: 3 | 4) => void;
  onMessage: (message: string) => void;
};

export function MobileEditor({
  document,
  siteId,
  selectedId,
  onSelect,
  onAdd,
  onUpdate,
  onDelete,
  onTheme,
  onReorder,
  onColumns,
  onMessage
}: Props) {
  const [mode, setMode] = useState<Mode>("desktop");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const selected = useMemo(
    () => document.windows.find((window) => window.id === selectedId) ?? null,
    [document.windows, selectedId]
  );
  const ordered = useMemo(
    () => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order),
    [document.windows]
  );

  function selectAndEdit(id: string) {
    onSelect(id);
    setMode("edit");
  }

  function add(type: DesktopWindow["type"]) {
    onAdd(type);
    setMode("edit");
  }

  function updateSelected(recipe: (window: DesktopWindow) => DesktopWindow) {
    if (selected) onUpdate(selected.id, recipe);
  }

  const previewWindow = document.windows.find((window) => window.id === previewId) ?? null;

  return (
    <div className="mobile-editor">
      <header className="mobile-editor-header">
        <div>
          <strong>{document.siteName}</strong>
          <small>{mode === "preview" ? "訪客預覽" : "手機編輯模式"}</small>
        </div>
        {mode !== "desktop" ? <button type="button" onClick={() => setMode("desktop")}>回桌面</button> : null}
      </header>

      <div className="mobile-editor-body" style={{ background: document.theme.wall }}>
        {mode === "desktop" ? (
          <section className="mobile-editor-desktop">
            <div className="mobile-layout-row">
              <span>圖示欄數</span>
              <button className={document.mobileColumns === 3 ? "active" : ""} onClick={() => onColumns(3)}>3</button>
              <button className={document.mobileColumns === 4 ? "active" : ""} onClick={() => onColumns(4)}>4</button>
            </div>
            <div className="mobile-icons mobile-edit-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0,1fr))` }}>
              {ordered.map((window) => (
                <button key={window.id} type="button" onClick={() => selectAndEdit(window.id)}>
                  <span className="file-icon" />
                  <small>{window.title}</small>
                </button>
              ))}
            </div>
            {document.windows.length === 0 ? <div className="mobile-empty">還沒有視窗，從下方「新增」開始。</div> : null}
          </section>
        ) : null}

        {mode === "add" ? (
          <section className="mobile-sheet">
            <h2>新增視窗</h2>
            <p>手機上不拖曳視窗。新增後直接編輯內容，桌面位置之後可在桌面版調整。</p>
            <div className="mobile-module-list">
              {modules.map((item) => (
                <button key={item.type} type="button" onClick={() => add(item.type)}>
                  <span className="module-icon" />
                  <span><strong>{item.label}</strong><small>{item.desc}</small></span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "edit" ? (
          <section className="mobile-sheet mobile-inspector">
            {selected ? (
              <>
                <div className="mobile-selected-heading">
                  <span className="module-icon" />
                  <div><strong>{selected.title}</strong><small>第 {selected.layout.mobile.order + 1} 個圖示</small></div>
                </div>
                <label>視窗標題<input value={selected.title} onChange={(event) => updateSelected((window) => ({ ...window, title: event.target.value }))} /></label>
                <label>桌面圖示<input value={selected.icon} onChange={(event) => updateSelected((window) => ({ ...window, icon: event.target.value }))} /></label>
                <label className="check-row"><input type="checkbox" checked={selected.defaultOpen} onChange={(event) => updateSelected((window) => ({ ...window, defaultOpen: event.target.checked }))} />訪客進入時預設開啟</label>
                <div className="mobile-order-row">
                  <span>手機圖示順序</span>
                  <RetroButton disabled={selected.layout.mobile.order === 0} onClick={() => onReorder(selected.id, -1)}>往前</RetroButton>
                  <RetroButton disabled={selected.layout.mobile.order === ordered.length - 1} onClick={() => onReorder(selected.id, 1)}>往後</RetroButton>
                </div>
                <InspectorContent
                  window={selected}
                  allWindows={document.windows}
                  siteId={siteId}
                  update={updateSelected}
                  onMessage={onMessage}
                />
                <RetroButton className="danger mobile-delete" onClick={() => { onDelete(selected.id); setMode("desktop"); }}>刪除視窗</RetroButton>
              </>
            ) : (
              <div className="mobile-empty">
                <strong>尚未選取視窗</strong>
                <p>回到桌面點一個圖示，或新增新的視窗。</p>
              </div>
            )}
          </section>
        ) : null}

        {mode === "theme" ? (
          <section className="mobile-sheet">
            <h2>桌面主題</h2>
            <div className="mobile-theme-grid">
              {Object.values(THEME_PRESETS).map((theme) => (
                <button key={theme.id} className={document.theme.id === theme.id ? "selected" : ""} onClick={() => onTheme(theme)}>
                  <i style={{ background: theme.wall }}><b style={{ background: `linear-gradient(90deg,${theme.titleFrom},${theme.titleTo})` }} /></i>
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "preview" ? (
          <section className="mobile-preview-mode">
            {previewWindow ? (
              <>
                <button className="mobile-back" type="button" onClick={() => setPreviewId(null)}>‹ 預覽桌面</button>
                <RetroWindow title={previewWindow.title} theme={document.theme} appearance={previewWindow.appearance}>
                  <WindowRenderer window={previewWindow} theme={document.theme} onOpenWindow={setPreviewId} />
                </RetroWindow>
              </>
            ) : (
              <div className="mobile-icons" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0,1fr))` }}>
                {ordered.map((window) => (
                  <button key={window.id} type="button" onClick={() => setPreviewId(window.id)}>
                    <span className="file-icon" />
                    <small>{window.title}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

      <nav className="mobile-editor-toolbar" aria-label="手機編輯工具">
        <button className={mode === "add" ? "active" : ""} onClick={() => setMode("add")}><span>＋</span><small>新增</small></button>
        <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><span>▤</span><small>編輯</small></button>
        <button className={mode === "theme" ? "active" : ""} onClick={() => setMode("theme")}><span>◉</span><small>主題</small></button>
        <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><span>▣</span><small>預覽</small></button>
      </nav>
    </div>
  );
}
