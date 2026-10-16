import { useEffect, useMemo, useRef, useState } from "react";
import { THEME_PRESETS, type CollectionEntityV2, type DesktopWindow, type PostEntityV2, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { IconPicker } from "../modules/links/IconPicker";
import { themeView, useThemeView } from "../../lib/themeView";
import { moduleDefinitions } from "../modules/registry";
import { useEditorStore } from "../editor/store";
import { WindowRenderer } from "./WindowRenderer";
import type { ProfileDirectoryEntry } from "../modules/types";
import { musicPlayback, useMusicPlayback } from "../modules/music/audioCoordinator";

type Sheet = "add" | "edit" | "theme" | null;

type Props = {
  document: SiteDocument;
  mode: "visitor" | "editor";
  /** Draw the phone bezel and status bar (preview and editor); the real visitor page is full screen. */
  framed?: boolean;
  siteId?: string;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  onPreview?: () => void;
  profiles?: ProfileEntityV2[];
  posts?: PostEntityV2[];
  collections?: CollectionEntityV2[];
  profileIdsByWindow?: Record<string, string>;
  onProfileSelect?: (id: string, windowId?: string) => void;
  onProfileAdd?: (windowId?: string) => void;
  onProfileDuplicate?: (id: string, windowId?: string) => void;
  onProfileChange?: (profileId: string, patch: Record<string, unknown>, historyKey?: string) => void;
  onProfileDelete?: (profileId: string, retargetProfileId?: string) => void;
  profileDeleteBlocked?: boolean;
  profileDeleteGuardById?: Record<string, { windowTitles: string[]; postIds: string[] }>;
  profileDirectory?: ProfileDirectoryEntry[];
  updateContent?: (recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) => void;
  socialDocument?: SiteDocumentV2Input;
  initialOpenId?: string;
  initialPostId?: string;
  publicShareBaseUrl?: string;
  siteHandle?: string;
};

const clock = () => new Date().toTimeString().slice(0, 5);

/** The single-window phone experience. Used for visitors, the editor preview and the mobile editor. */
export function MobileScreen({ document, mode, framed = false, siteId, upload, onPreview, profiles, posts, collections, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById, profileDirectory, updateContent, socialDocument, initialOpenId, initialPostId, publicShareBaseUrl, siteHandle }: Props) {
  const editor = mode === "editor";
  const store = useEditorStore();
  const tv = useThemeView(document.theme);
  const [openId, setOpenId] = useState<string | null>(() => initialOpenId ?? (mode === "visitor" ? document.windows.find((window) => window.type === "character-dialog" && window.content.autoShow)?.id ?? null : null));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inlineEdit, setInlineEdit] = useState(false);
  const iconRefs = useRef(new Map<string, HTMLButtonElement>());
  const music = useMusicPlayback();
  const ordered = useMemo(() => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order), [document.windows]);
  const openWindow = ordered.find((window) => window.id === openId) ?? null;
  const selected = document.windows.find((window) => window.id === store.selectedId) ?? null;

  useEffect(() => () => musicPlayback.stopAll(), []);
  const open = (id: string) => { if (openId && openId !== id) musicPlayback.stopWindow(openId); setOpenId(id); setInlineEdit(false); if (editor) store.select(id); };
  const back = () => { const closingId = openId; if (closingId) musicPlayback.stopWindow(closingId); setOpenId(null); setInlineEdit(false); if (closingId) requestAnimationFrame(() => iconRefs.current.get(closingId)?.focus()); };
  useEffect(() => {
    if (!openId) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") back(); };
    globalThis.document.addEventListener("keydown", escape);
    return () => globalThis.document.removeEventListener("keydown", escape);
  }, [openId]);
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel };

  const body = (
    <div className="m-screen" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
      {framed ? <div className="m-status" style={{ background: tv.face, color: tv.text }}><span>{clock()}</span><span>5G ▮▮▮</span></div> : null}
      <div className="m-titlebar" style={{ background: tv.titleBg, color: tv.titleText }}>
        <Icon name="computer" size={20} />
        <span className="m-site">{document.siteName}</span>
        {editor ? <span className="m-badge">編輯中</span> : null}
      </div>

      <div className="m-stage">
        <div className="m-scroll">
          <div className="mobile-icons m-grid" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {ordered.map((window) => (
              <button key={window.id} ref={(node) => { if (node) iconRefs.current.set(window.id, node); else iconRefs.current.delete(window.id); }} type="button" className="m-icon" aria-label={window.title} style={{ outline: editor && store.selectedId === window.id ? `2px dotted ${tv.text}` : "none" }} onClick={() => open(window.id)}>
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
            <div className="m-win-title" style={{ background: tv.titleBg, color: tv.titleText }}>
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
                profiles={profiles}
                posts={posts}
                collections={collections}
                profileIdsByWindow={profileIdsByWindow}
                onProfileSelect={onProfileSelect}
                onProfileAdd={onProfileAdd}
                onProfileDuplicate={onProfileDuplicate}
                onProfileChange={onProfileChange}
                onProfileDelete={onProfileDelete}
                profileDeleteBlocked={profileDeleteBlocked}
                profileDeleteGuardById={profileDeleteGuardById}
                profileDirectory={profileDirectory}
                updateContent={updateContent}
                socialDocument={socialDocument}
                initialPostId={openWindow.id === initialOpenId ? initialPostId : undefined}
                publicShareBaseUrl={publicShareBaseUrl}
                siteHandle={siteHandle}
              />
            </div>
            {editor ? <button type="button" className="m-fab" onClick={() => setInlineEdit(!inlineEdit)}>{inlineEdit ? "完成編輯" : "編輯此視窗"}</button> : null}
          </div>
        ) : null}
      </div>

      {!editor ? (
        <div className="m-taskbar" style={{ background: tv.taskbar, boxShadow: `inset 0 1px ${tv.light}, inset 0 2px #fff` }}>
          <button type="button" className="m-btn" style={btn} onClick={back}><Icon name="computer" size={18} />桌面</button>
          {openWindow ? <span className="m-current" style={{ background: tv.light, color: tv.text, boxShadow: tv.pressed }}><Icon name={openWindow.icon} size={16} />{openWindow.title}{music.windowId === openWindow.id && music.status === "playing" ? " · 播放中" : ""}</span> : null}
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
              {sheet === "add" ? moduleDefinitions.map((module) => (
                <button key={module.type} type="button" className="w98-btn m-add" onClick={() => { store.addWindow(module.type); setSheet(null); }}>
                  <Icon name={module.mobile.icon} size={32} />
                  <span className="add-card-text"><strong>{module.label}</strong><span>{module.description}</span></span>
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

function MobileEdit({ window, count, siteId, upload }: { window: DesktopWindow; count: number; siteId?: string; upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null> }) {
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
