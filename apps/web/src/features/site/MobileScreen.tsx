import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeWindow, THEME_PRESETS, type CollectionEntityV2, type DesktopWindow, type PostEntityV2, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { IconPicker } from "../modules/links/IconPicker";
import { useThemeView } from "../../lib/themeView";
import { RetroWindow } from "../../components/RetroWindow";
import { WindowChromeButton } from "../../components/window-chrome";
import { WindowAppearanceEditor } from "../editor/WindowAppearanceEditor";
import { WindowChromeEditor } from "../editor/WindowChromeEditor";
import { ThemeAppearanceEditor } from "../editor/ThemeAppearanceEditor";
import { moduleDefinitions } from "../modules/registry";
import { useEditorStore } from "../editor/store";
import { WindowRenderer } from "./WindowRenderer";
import type { ProfileDirectoryEntry } from "../modules/types";
import { musicPlayback, useMusicPlayback } from "../modules/music/audioCoordinator";
import { stopAllMedia, stopWindowMedia } from "../modules/music/mediaSession";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useLocaleFormatting } from "../../i18n/format";

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

/** The single-window phone experience. Used for visitors, the editor preview and the mobile editor. */
export function MobileScreen({ document, mode, framed = false, siteId, upload, onPreview, profiles, posts, collections, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById, profileDirectory, updateContent, socialDocument, initialOpenId, initialPostId, publicShareBaseUrl, siteHandle }: Props) {
  const { t } = useTranslation("editor");
  const { t: common } = useTranslation("common");
  const { t: musicText } = useTranslation("music");
  const { formatDate, formatTime, fontFamily } = useLocaleFormatting();
  const now = new Date();
  const clock = formatTime(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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

  useEffect(() => () => stopAllMedia(), []);
  const open = (id: string) => { if (openId && openId !== id) stopWindowMedia(openId); setOpenId(id); setInlineEdit(false); if (editor) store.select(id); };
  const back = () => { const closingId = openId; if (closingId) stopWindowMedia(closingId); setOpenId(null); setInlineEdit(false); if (closingId) requestAnimationFrame(() => iconRefs.current.get(closingId)?.focus()); };
  useEffect(() => {
    if (!openId) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") back(); };
    globalThis.document.addEventListener("keydown", escape);
    return () => globalThis.document.removeEventListener("keydown", escape);
  }, [openId]);
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel, fontFamily };

  const body = (
    <div className="m-screen" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
      {framed ? <div className="m-status" style={{ background: tv.face, color: tv.text, fontFamily }}><time dateTime={now.toISOString()} title={formatDate(now, { dateStyle: "full" })} aria-label={common("desktop.clockLabel", { time: clock })}>{clock}</time><span>5G ▮▮▮</span></div> : null}
      <div className="m-titlebar" style={{ background: tv.titleBg, color: tv.titleText, fontFamily }}>
        <Icon name="computer" size={20} />
        <span className="m-site">{document.siteName}</span>
        {editor ? <span className="m-badge">{t("mobile.editing")}</span> : <LanguageSwitcher compact />}
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
            <div className="m-empty w98-window" style={{ fontFamily }}><strong>{t("mobile.emptyTitle")}</strong><span>{t(editor ? "mobile.emptyEditor" : "mobile.emptyVisitor")}</span></div>
          ) : null}
        </div>

        {openWindow ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>
            <RetroWindow
              title={openWindow.title}
              icon={openWindow.icon}
              theme={document.theme}
              appearance={openWindow.appearance}
              chrome={openWindow.chrome}
              presentation="mobile"
              interactiveControls
              controlLabels={{ close: common("actions.close") }}
              onClose={back}
              titleBarLeading={<WindowChromeButton className="m-btn m-back" onClick={back}>‹ {t("mobile.desktop")}</WindowChromeButton>}
            >
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
            </RetroWindow>
            {editor ? <button type="button" className="m-fab" onClick={() => setInlineEdit(!inlineEdit)}>{t(inlineEdit ? "mobile.finishEditing" : "mobile.editWindow")}</button> : null}
          </div>
        ) : null}
      </div>

      {!editor ? (
        <div className="m-taskbar" style={{ background: tv.taskbar, boxShadow: `inset 0 1px ${tv.light}, inset 0 2px #fff`, fontFamily }}>
          <button type="button" className="m-btn" style={btn} onClick={back}><Icon name="computer" size={18} />{t("mobile.desktop")}</button>
          {openWindow ? <span className="m-current" style={{ background: tv.light, color: tv.text, boxShadow: tv.pressed }}><Icon name={openWindow.icon} size={16} />{openWindow.title}{music.windowId === openWindow.id && music.status === "playing" ? ` · ${musicText("playback.playing")}` : ""}</span> : null}
        </div>
      ) : (
        <div className="m-toolbar" role="toolbar" aria-label={t("mobile.toolbar")} style={{ fontFamily }}>
          {([
            ["add", "folder"], ["edit", "doc"], ["theme", "palette"], ["preview", "star"]
          ] as const).map(([id, icon]) => (
            <button key={id} type="button" className="m-tool" aria-pressed={sheet === id} onClick={() => { if (id === "preview") onPreview?.(); else setSheet(sheet === id ? null : id); }}>
              <Icon name={icon} size={22} />{t(`mobile.${id}`)}
            </button>
          ))}
        </div>
      )}

      {editor && sheet ? (
        <>
          <div className="m-scrim" onClick={() => setSheet(null)} />
          <div role="dialog" aria-label={t(({ add: "mobile.addWindow", edit: "mobile.editWindowTitle", theme: "mobile.theme" } as const)[sheet])} className="m-sheet w98-window" style={{ fontFamily }}>
            <div className="m-sheet-title"><strong>{t(({ add: "mobile.addWindow", edit: "mobile.editWindowTitle", theme: "mobile.theme" } as const)[sheet])}</strong><button type="button" className="m-btn sq" aria-label={common("actions.close")} onClick={() => setSheet(null)}>×</button></div>
            <div className="m-sheet-body">
              {sheet === "add" ? moduleDefinitions.map((module) => (
                <button key={module.type} type="button" className="w98-btn m-add" onClick={() => { store.addWindow(module.type); setSheet(null); }}>
                  <Icon name={module.mobile.icon} size={32} />
                  <span className="add-card-text"><strong>{t(`modules.${module.type}.label`, { defaultValue: module.label })}</strong><span>{t(`modules.${module.type}.description`, { defaultValue: module.description })}</span></span>
                </button>
              )) : null}
              {sheet === "theme" ? <ThemeAppearanceEditor theme={document.theme} onTheme={store.setTheme} upload={upload} /> : null}
              {sheet === "edit" ? (
                selected ? <MobileEdit key={selected.id} theme={document.theme} window={selected} count={ordered.length} siteId={siteId} upload={upload} /> : <span className="m-note">先點一下桌面上的圖示，選取要編輯的視窗。</span>
              ) : null}
              {sheet === "edit" ? (
                <>
                  <div className="w98-field"><span className="w98-hint">圖示欄數</span>
                    <div className="seg">{([3, 4] as const).map((count) => <button key={count} type="button" className={"w98-btn grow" + (document.mobileColumns === count ? " on" : "")} onClick={() => store.setMobileColumns(count)}>{count} 欄</button>)}</div>
                  </div>
                  <label className="check-row m-check"><input type="checkbox" checked={store.versionedDocument?.seo?.indexing ?? true} onChange={(event) => store.setSeoIndexing(event.target.checked)} />允許搜尋引擎收錄公開頁面</label>
                  <span className="w98-hint">關閉只會輸出 noindex，不會把公開網站變成私密。</span>
                </>
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

function MobileEdit({ theme, window, count, siteId, upload }: { theme: SiteDocument["theme"]; window: DesktopWindow; count: number; siteId?: string; upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null> }) {
  const store = useEditorStore();
  const patch = (change: Partial<DesktopWindow>, key?: string) => store.updateWindow(window.id, (current) => ({ ...current, ...change }) as DesktopWindow, key);
  return (
    <>
      <label className="w98-field"><span className="w98-hint">視窗標題</span><input className="w98-input m-input" value={window.title} onChange={(event) => patch({ title: event.target.value }, "mt" + window.id)} /></label>
      <WindowChromeEditor theme={theme} window={window} onChange={(chrome) => patch({ chrome })} />
      <WindowAppearanceEditor theme={theme} window={window} onChange={(appearance, historyKey) => patch({ appearance }, historyKey)} />
      <span className="w98-hint">圖示</span>
      <IconPicker key={window.id} siteId={siteId} value={window.icon} upload={upload} mediaTarget={{ windowId: window.id, windowType: window.type }} size={28} label={window.title} defaultValue={makeWindow(window.type).icon} onChange={(icon) => patch({ icon })} />
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
