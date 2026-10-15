import { useMemo, useState } from "react";
import { THEME_PRESETS, type DesktopWindow, type SiteDocument } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { IconPicker } from "../modules/links/IconPicker";
import { themeView } from "../../lib/themeView";
import { registry, WINDOW_TYPES } from "../modules/registry";
import { useEditorStore } from "../editor/store";
import { WindowRenderer } from "./WindowRenderer";

type Sheet = "add" | "edit" | "theme" | null;

type Props = {
  document: SiteDocument;
  mode: "visitor" | "editor";
  /** Draw the phone bezel and status bar (preview and editor); the real visitor page is full screen. */
  framed?: boolean;
  siteId?: string;
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
  onPreview?: () => void;
};

const clock = () => new Date().toTimeString().slice(0, 5);

/** The single-window phone experience. Used for visitors, the editor preview and the mobile editor. */
export function MobileScreen({ document, mode, framed = false, siteId, upload, onPreview }: Props) {
  const editor = mode === "editor";
  const store = useEditorStore();
  const tv = themeView(document.theme);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inlineEdit, setInlineEdit] = useState(false);
  const ordered = useMemo(() => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order), [document.windows]);
  const openWindow = ordered.find((window) => window.id === openId) ?? null;
  const selected = document.windows.find((window) => window.id === store.selectedId) ?? null;

  const open = (id: string) => { setOpenId(id); setInlineEdit(false); if (editor) store.select(id); };
  const back = () => { setOpenId(null); setInlineEdit(false); };
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel };

  const body = (
    <div className="m-screen" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
      {framed ? <div className="m-status" style={{ background: tv.face, color: tv.text }}><span>{clock()}</span><span>5G ▮▮▮</span></div> : null}
      <div className="m-titlebar" style={{ background: tv.titleBg }}>
        <Icon name="computer" size={20} />
        <span className="m-site">{document.siteName}</span>
        {editor ? <span className="m-badge">編輯中</span> : null}
      </div>

      <div className="m-stage">
        <div className="m-scroll">
          <div className="mobile-icons m-grid" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {ordered.map((window) => (
              <button key={window.id} type="button" className="m-icon" aria-label={window.title} style={{ outline: editor && store.selectedId === window.id ? `2px dotted ${tv.text}` : "none" }} onClick={() => open(window.id)}>
                <span className="m-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}><Icon name={window.icon} size={40} /></span>
                <span className="m-label" style={{ background: tv.labelBg, color: tv.labelColor, border: tv.labelBorder, borderRadius: tv.labelRadius }}>{window.title}</span>
              </button>
            ))}
          </div>
          {ordered.length === 0 ? (
            <div className="m-empty w98-window"><strong>桌面還空空的</strong><span>{editor ? "點下方「新增」放上第一個視窗。" : "這個桌面還沒有內容。"}</span></div>
          ) : null}
        </div>

        {openWindow ? (
          <div role="dialog" aria-label={openWindow.title} className="m-window" style={{ background: tv.face, boxShadow: tv.bevel }}>
            <div className="m-win-title" style={{ background: tv.titleBg }}>
              <button type="button" className="m-btn m-back" style={btn} onClick={back}>‹ 桌面</button>
              <Icon name={openWindow.icon} size={18} />
              <span className="m-win-name">{openWindow.title}</span>
              <button type="button" className="m-btn sq" style={btn} aria-label="關閉" onClick={back}>×</button>
            </div>
            <div className="m-win-body" style={{ boxShadow: tv.sunken }}>
              <WindowRenderer
                window={openWindow}
                theme={document.theme}
                mobile
                editing={editor && inlineEdit}
                allWindows={document.windows}
                siteId={siteId}
                upload={upload}
                onUpdate={store.updateWindow}
                onOpenWindow={open}
              />
            </div>
            {editor ? <button type="button" className="m-fab" onClick={() => setInlineEdit(!inlineEdit)}>{inlineEdit ? "完成編輯" : "編輯此視窗"}</button> : null}
          </div>
        ) : null}
      </div>

      {!editor ? (
        <div className="m-taskbar" style={{ background: tv.taskbar, boxShadow: `inset 0 1px ${tv.light}, inset 0 2px #fff` }}>
          <button type="button" className="m-btn" style={btn} onClick={back}><Icon name="computer" size={18} />桌面</button>
          {openWindow ? <span className="m-current" style={{ background: tv.light, color: tv.text, boxShadow: tv.pressed }}><Icon name={openWindow.icon} size={16} />{openWindow.title}</span> : null}
        </div>
      ) : (
        <div className="m-toolbar" role="toolbar" aria-label="手機編輯工具">
          {([
            ["add", "folder", "新增"], ["edit", "doc", "編輯"], ["theme", "palette", "主題"], ["preview", "star", "預覽"]
          ] as const).map(([id, icon, label]) => (
            <button key={id} type="button" className="m-tool" aria-pressed={sheet === id} onClick={() => { if (id === "preview") onPreview?.(); else setSheet(sheet === id ? null : id); }}>
              <Icon name={icon} size={22} />{label}
            </button>
          ))}
        </div>
      )}

      {editor && sheet ? (
        <>
          <div className="m-scrim" onClick={() => setSheet(null)} />
          <div role="dialog" aria-label={{ add: "新增視窗", edit: "編輯視窗", theme: "主題" }[sheet]} className="m-sheet w98-window">
            <div className="m-sheet-title"><strong>{{ add: "新增視窗", edit: "編輯視窗", theme: "主題" }[sheet]}</strong><button type="button" className="m-btn sq" aria-label="關閉" onClick={() => setSheet(null)}>×</button></div>
            <div className="m-sheet-body">
              {sheet === "add" ? WINDOW_TYPES.map((type) => (
                <button key={type} type="button" className="w98-btn m-add" onClick={() => { store.addWindow(type); setSheet(null); }}>
                  <Icon name={registry[type].icon} size={32} />
                  <span className="add-card-text"><strong>{registry[type].label}</strong><span>{registry[type].description}</span></span>
                </button>
              )) : null}
              {sheet === "theme" ? (
                <>
                  <div className="m-theme-grid">
                    {Object.values(THEME_PRESETS).map((theme) => {
                      const view = themeView(theme);
                      return (
                        <button key={theme.id} type="button" className={"preset" + (document.theme.id === theme.id ? " on" : "")} aria-pressed={document.theme.id === theme.id} onClick={() => store.setTheme(theme)}>
                          <span className="preset-thumb" style={{ backgroundColor: theme.wall, backgroundImage: view.wallImageCss, backgroundSize: view.wallSize, height: 44 }}><i style={{ background: view.titleBg }} /></span>
                          <span>{theme.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="w98-hint">桌布圖片、字型等進階設定可在桌面版編輯器調整。</span>
                </>
              ) : null}
              {sheet === "edit" ? (
                selected ? <MobileEdit window={selected} count={ordered.length} siteId={siteId} upload={upload} /> : <span className="m-note">先點一下桌面上的圖示，選取要編輯的視窗。</span>
              ) : null}
              {sheet === "edit" ? (
                <div className="w98-field"><span className="w98-hint">圖示欄數</span>
                  <div className="seg">{([3, 4] as const).map((count) => <button key={count} type="button" className={"w98-btn grow" + (document.mobileColumns === count ? " on" : "")} onClick={() => store.setMobileColumns(count)}>{count} 欄</button>)}</div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );

  if (!framed) return <div className="visitor-mobile">{body}</div>;
  return <div className="visitor-mobile framed"><div className="m-bezel">{body}</div></div>;
}

function MobileEdit({ window, count, siteId, upload }: { window: DesktopWindow; count: number; siteId?: string; upload?: (file: File, kind?: "image" | "icon") => Promise<string | null> }) {
  const store = useEditorStore();
  const patch = (change: Partial<DesktopWindow>, key?: string) => store.updateWindow(window.id, (current) => ({ ...current, ...change }) as DesktopWindow, key);
  return (
    <>
      <label className="w98-field"><span className="w98-hint">視窗標題</span><input className="w98-input m-input" value={window.title} onChange={(event) => patch({ title: event.target.value }, "mt" + window.id)} /></label>
      <span className="w98-hint">圖示</span>
      <IconPicker siteId={siteId} value={window.icon} upload={upload} size={28} onChange={(icon) => patch({ icon })} />
      <label className="check-row m-check"><input type="checkbox" checked={window.defaultOpen} onChange={(event) => patch({ defaultOpen: event.target.checked })} />訪客進站時自動開啟</label>
      <div className="m-actions">
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order === 0} onClick={() => store.reorderMobile(window.id, -1)}>▲ 圖示往前</button>
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order >= count - 1} onClick={() => store.reorderMobile(window.id, 1)}>▼ 圖示往後</button>
        <button type="button" className="w98-btn" onClick={() => store.duplicateWindow(window.id)}>複製</button>
        <button type="button" className="w98-btn danger" onClick={() => store.deleteWindow(window.id)}>刪除</button>
      </div>
      <div className="w98-sep" />
      <span className="w98-hint">內容：關閉此面板，開啟視窗後按「編輯此視窗」，直接點文字或圖片編輯。</span>
    </>
  );
}
