import { restoreNavigationFocus, useVisitorNavigation } from "../navigation/useVisitorNavigation";
import { resolveDesktopLabelAppearance } from "../../lib/windowAppearance";
import type { PreviewNavigation } from "./previewNavigation";
import authoring from "./MobileAuthoring.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeWindow, THEME_PRESETS, type CollectionEntityV2, type DesktopWindow, type PostEntityV2, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { Icon } from "../../components/Icon";
import { ModalDialog } from "../../components/ModalDialog";
import { IconPicker } from "../modules/links/IconPicker";
import { useThemeView } from "../../lib/themeView";
import { ImageWindowShell } from "./ImageWindowShell";
import { useImageWriter } from "../editor/ImageWriteContext";
import { WindowChromeButton } from "../../components/window-chrome";
import { WindowAppearanceEditor } from "../editor/WindowAppearanceEditor";
import { WindowChromeEditor } from "../editor/WindowChromeEditor";
import { ThemeAppearanceEditor } from "../editor/ThemeAppearanceEditor";
import { BottomSheet, EditorStatusBar, InlineTextField, LongPressReorderGrid, UndoToast } from "../../components/editing";
import { isFramelessImage } from "./ImageWindowShell";
import { AddWindowCatalog } from "../editor/AddWindowDialog";
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
  navigationSiteId?: string | null;
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
  /** Visitor previews: shared with the other layouts so rotation keeps the open app and character. */
  navigation?: PreviewNavigation;
  canShareEntity?: (kind: "oc" | "post", id: string) => boolean;
  viewDrafts?: boolean;
  publicShareBaseUrl?: string;
  siteHandle?: string;
};

/** The single-window phone experience. Used for visitors, the editor preview and the mobile editor. */
export function MobileScreen({ document, mode, framed = false, siteId, upload, onPreview, profiles, posts, collections, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById, profileDirectory, updateContent, socialDocument, initialOpenId, initialPostId, navigation, canShareEntity, viewDrafts, publicShareBaseUrl, siteHandle, navigationSiteId }: Props) {
  const { t } = useTranslation("editor");
  const { t: common } = useTranslation("common");
  const { t: musicText } = useTranslation("music");
  const { formatDate, formatTime, fontFamily } = useLocaleFormatting();
  const now = new Date();
  const clock = formatTime(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const editor = mode === "editor";
  const imageWriter = useImageWriter();
  const store = useEditorStore();
  const theme = (editor ? store.themePreview : null) ?? document.theme;
  const tv = useThemeView(theme);
  const [openId, setOpenId] = useState<string | null>(() => initialOpenId ?? (navigation?.openId && [...document.windows, ...(navigation.visitor?.source === document ? navigation.visitor.windows : [])].some((window) => window.id === navigation.openId) ? navigation.openId : null) ?? (mode === "visitor" ? document.windows.find((window) => window.type === "character-dialog" && window.content.autoShow)?.id ?? null : null));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inlineEdit, setInlineEdit] = useState(editor);
  const [arranging, setArranging] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [toast, setToast] = useState<{ id: string; message: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DesktopWindow | null>(null);
  const pendingDeleteRef = useRef<{ window: DesktopWindow; siteId: string | undefined } | null>(null);
  const flushDelete = () => {
    const pending = pendingDeleteRef.current; pendingDeleteRef.current = null; setPendingDelete(null);
    const current = useEditorStore.getState();
    if (pending && current.siteId === pending.siteId && current.document?.windows.find(window => window.id === pending.window.id) === pending.window) current.deleteWindow(pending.window.id);
  };
  useEffect(() => () => flushDelete(), [siteId]);
  useEffect(() => {
    if (!editor || !pendingDelete) return;
    const undoPending = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== "z" || screenRef.current?.closest("[inert], [hidden]")) return;
      if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true]")) return;
      event.preventDefault(); event.stopImmediatePropagation(); pendingDeleteRef.current = null; setPendingDelete(null); setToast(null);
      requestAnimationFrame(() => iconRefs.current.get(pendingDelete.id)?.focus());
    };
    globalThis.document.addEventListener("keydown", undoPending, true);
    return () => globalThis.document.removeEventListener("keydown", undoPending, true);
  }, [editor, pendingDelete]);
  const deleteIcon = (window: DesktopWindow) => { flushDelete(); pendingDeleteRef.current = { window, siteId }; setPendingDelete(window); setOpenId(null); setSheet(null); setRenaming(null); store.select(null); setToast({ id: crypto.randomUUID(), message: t("mobileEditor.deleted", { title: window.title }) }); };
  const iconRefs = useRef(new Map<string, HTMLElement>());
  const screenRef = useRef<HTMLDivElement | null>(null);
  const contentEditButton = useRef<HTMLButtonElement | null>(null);
  const music = useMusicPlayback();
  const ordered = useMemo(() => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order), [document.windows]);
  const visitor = useVisitorNavigation({ document, siteId: navigationSiteId, profileDirectory, profileIdsByWindow, navigation, editing: editor, recordReturns: true, onOpen: (window) => open(window.id, true) });
  const openWindow = visitor.windows.find((window) => window.id === openId) ?? null;
  const selected = document.windows.find((window) => window.id === store.selectedId) ?? null;

  useEffect(() => () => stopAllMedia(), []);
  const open = (id: string, fromNavigation = false) => { if (!fromNavigation) visitor.clearReturns(); if (openId && openId !== id) stopWindowMedia(openId); if (navigation) navigation.openId = id; setOpenId(id); setInlineEdit(editor); if (editor) store.select(id); };
  const back = () => { const closingId = openId; if (closingId) stopWindowMedia(closingId); const previous = visitor.back(openId); const returning = previous && visitor.windows.some((window) => window.id === previous.windowId) ? previous : null; if (navigation) navigation.openId = returning?.windowId ?? null; setOpenId(returning?.windowId ?? null); setInlineEdit(editor); if (returning) restoreNavigationFocus(returning.focusKey, screenRef.current); else if (closingId) requestAnimationFrame(() => iconRefs.current.get(closingId)?.focus()); };
  useEffect(() => {
    if (!openId) return;
    // preventDefault marks the key as handled, so a surrounding preview does not also close on the same Escape
    const escape = (event: KeyboardEvent) => {
      // The author screen stays mounted behind preview; it must not consume
      // Escape before the active visitor screen receives the same event.
      if (screenRef.current?.closest("[inert], [hidden], [aria-hidden='true']")) return;
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && !sheet) { event.preventDefault(); back(); }
    };
    globalThis.document.addEventListener("keydown", escape);
    return () => globalThis.document.removeEventListener("keydown", escape);
  }, [openId, sheet]);
  // Resizing a phone viewport must not leave the active field behind an inner
  // scroll clip. Keep the mounted editor and its draft/focus; scroll only fields
  // belonging to this author screen, never a modal or the visitor preview.
  useEffect(() => {
    const screen = screenRef.current;
    if (!editor || !screen) return;
    let frame = 0;
    const revealInput = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = globalThis.document.activeElement;
        if ((globalThis.visualViewport && globalThis.visualViewport.scale !== 1) ||
          screen.closest("[inert], [hidden], [aria-hidden='true']") ||
          !(active instanceof HTMLElement) || !screen.contains(active) ||
          !active.matches("input, textarea, select, [contenteditable='true']")) return;
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    };
    const observer = new ResizeObserver(revealInput);
    observer.observe(screen);
    const stage = screen.querySelector(".m-stage");
    if (stage) observer.observe(stage);
    globalThis.visualViewport?.addEventListener("resize", revealInput);
    return () => {
      observer.disconnect();
      globalThis.visualViewport?.removeEventListener("resize", revealInput);
      cancelAnimationFrame(frame);
    };
  }, [editor]);

  const body = (
    <div ref={screenRef} tabIndex={-1} onKeyDown={event=>{ if(!editor || sheet || event.defaultPrevented || event.nativeEvent.isComposing || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]"))return; if(event.key==="Escape" && arranging){event.preventDefault();setArranging(false);setRenaming(null);} else if((event.key==="Delete" || event.key==="Backspace") && arranging){const id=(event.target as HTMLElement).closest<HTMLElement>("[data-reorder-id]")?.dataset.reorderId;const window=ordered.find(window=>window.id===id);if(window){event.preventDefault();deleteIcon(window);}} else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"&&pendingDelete){event.preventDefault();event.stopPropagation();pendingDeleteRef.current=null;setPendingDelete(null);setToast(null);} }} className={`m-screen${editor ? ` ${authoring.screen}` : ""}`} style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
      {framed ? <div className="m-status" style={{ background: tv.face, color: tv.text, fontFamily }}><time dateTime={now.toISOString()} title={formatDate(now, { dateStyle: "full" })} aria-label={common("desktop.clockLabel", { time: clock })}>{clock}</time><span>5G ▮▮▮</span></div> : null}
      {/* One return path: while an app is open its own title bar is the only header (site options live in its menu). */}
      {!openWindow ? (
        <div className="m-titlebar" style={{ background: tv.titleBg, color: tv.titleText, fontFamily }}>
          {editor && arranging ? <><strong className="grow">{t("mobileEditor.arrange")}</strong><div className="seg" role="group" aria-label={t("mobileEditor.iconColumns")}>{([3,4] as const).map(n=><button key={n} type="button" className="w98-btn" aria-pressed={document.mobileColumns===n} onClick={()=>store.setMobileColumns(n)}>{n}</button>)}</div><button type="button" className="w98-btn" onClick={()=>{setArranging(false);setRenaming(null);}}>{t("editor.done")}</button></> : <><Icon name="computer" size={20} />{editor ? <MobileTitleField className="m-site m-inline-title" aria-label={t("mobileEditor.siteName")} value={document.siteName} maxLength={120} onValueChange={name => store.setSiteName(name,"mobile-site-name")} /> : <span className="m-site">{document.siteName}</span>}{editor ? <span className="m-badge">{t("mobile.editing")}</span> : <LanguageSwitcher compact />}</>}

        </div>
      ) : null}

      <div className="m-stage">
        <div className="m-scroll">
          {editor ? <LongPressReorderGrid items={ordered.filter(window=>window.id!==pendingDelete?.id)} columns={document.mobileColumns} arranging={arranging} revision={store.document} onArrangeStart={()=>setArranging(true)} onReorder={ids=>{ if(useEditorStore.getState().document !== document || useEditorStore.getState().siteId !== siteId)return; if(pendingDelete){flushDelete();setToast(null);} store.reorderMobileIds(ids); }} onOpen={id=>{if(arranging){const window=ordered.find(window=>window.id===id);if(window){setRenameDraft(window.title);setRenaming(id);}}else open(id);}} cellRef={(id,node)=>{if(node)iconRefs.current.set(id,node);else iconRefs.current.delete(id);}} label={t("mobileEditor.desktopIcons")} renderGhost={window=><Icon name={window.icon} size={40}/>} renderCell={window=><>
            <span className="m-tile" style={{background:tv.tileBg,boxShadow:tv.tileShadow}}><Icon name={window.icon} size={40}/></span>
            {renaming===window.id ? <InlineTextField autoFocus className="m-icon-rename" aria-label={t("mobileEditor.iconName")} value={renameDraft} maxLength={160} onPointerDown={e=>e.stopPropagation()} onValueChange={setRenameDraft} onBlur={()=>{if(renameDraft.trim())store.updateWindow(window.id,current=>({...current,title:renameDraft.trim()}));setRenaming(null);}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();setRenaming(null);requestAnimationFrame(()=>iconRefs.current.get(window.id)?.focus());}else if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();if(renameDraft.trim())store.updateWindow(window.id,current=>({...current,title:renameDraft.trim()}));setRenaming(null);requestAnimationFrame(()=>iconRefs.current.get(window.id)?.focus());}}}/> : <span className="m-label" style={resolveDesktopLabelAppearance(theme,window.appearance)}>{window.title}</span>}
            {arranging && renaming!==window.id ? <button type="button" className="m-icon-delete w98-btn" aria-label={t("mobileEditor.deleteNamed",{title:window.title})} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();deleteIcon(window);}}>×</button>:null}
          </>} /> : (
          <div className="mobile-icons m-grid" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {ordered.map((window) => (
              <button key={window.id} ref={(node) => { if (node) iconRefs.current.set(window.id, node); else iconRefs.current.delete(window.id); }} type="button" className="m-icon" data-window-id={window.id} aria-label={window.title} style={{ outline: editor && store.selectedId === window.id ? `2px dotted ${tv.text}` : "none" }} onClick={() => open(window.id)}>
                <span className="m-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}><Icon name={window.icon} size={40} /></span>
                <span className="m-label" style={resolveDesktopLabelAppearance(theme, window.appearance)}>{window.title}</span>
              </button>
            ))}
          </div>
          )}
          {ordered.length === 0 ? (
            <div className="m-empty w98-window" style={{ fontFamily }}><strong>{t("mobile.emptyTitle")}</strong><span>{t(editor ? "mobile.emptyEditor" : "mobile.emptyVisitor")}</span></div>
          ) : null}
        </div>

        {openWindow ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 5 }}>
            <ImageWindowShell window={openWindow} editor={editor}
              title={openWindow.title}
              icon={openWindow.icon}
              theme={theme}
              appearance={openWindow.appearance}
              chrome={openWindow.chrome}
              presentation="mobile"
              interactiveControls
              controlLabels={{ close: common("actions.close") }}
              onClose={back}
              titleBarLeading={<WindowChromeButton className="m-btn m-back" onClick={back}>‹ {visitor.hasReturn ? common("auth.back") : t("mobile.desktop")}</WindowChromeButton>}
              slots={editor ? { titleBar: props => <div {...props.titleBarProps} className="retro-titlebar m-inline-titlebar">
                <WindowChromeButton className="m-btn m-back" onClick={back}>‹ {t("mobile.desktop")}</WindowChromeButton><Icon name={openWindow.icon} size={16}/><MobileTitleField className="m-inline-title" aria-label={t("mobileEditor.windowTitle")} value={openWindow.title} maxLength={160} onValueChange={title=>{if(title.trim())store.updateWindow(openWindow.id,current=>({...current,title}),`mt${openWindow.id}`);}}/><WindowChromeButton ref={contentEditButton} className="m-btn m-window-settings" aria-label={t("mobile.editWindowTitle")} aria-expanded={sheet==="edit"} onClick={()=>setSheet("edit")}>⋯</WindowChromeButton>
              </div> } : undefined}
              titleBarTrailing={editor
                ? <WindowChromeButton ref={isFramelessImage(openWindow) ? contentEditButton : undefined} className="m-btn m-window-settings" aria-label={t("mobile.editWindowTitle")} aria-expanded={sheet === "edit"} onClick={() => setSheet("edit")}>⋯</WindowChromeButton>
                : <MobileSiteMenu label={t("mobile.siteMenu")} playing={music.windowId === openWindow.id && music.status === "playing"} playingLabel={musicText("playback.playing")} />}
            >
              <WindowRenderer
                key={editor ? openWindow.id : undefined}
                window={openWindow}
                theme={theme}
                mobile
                editing={editor && inlineEdit}
                allWindows={visitor.windows}
                onNavigate={editor ? undefined : visitor.navigate}
                navigationSiteId={navigationSiteId}
                navigationRequest={visitor.requests[openWindow.id]}
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
                navigation={navigation}
                canShareEntity={canShareEntity}
                viewDrafts={viewDrafts}
                publicShareBaseUrl={publicShareBaseUrl}
                siteHandle={siteHandle}
              />
            </ImageWindowShell>
          </div>
        ) : null}
      </div>

      {editor && !openWindow ? <>
        <EditorStatusBar message={t(arranging ? "mobileEditor.arrangeHint" : "mobileEditor.homeHint")} count={t("mobileEditor.windowCount",{count:ordered.length-(pendingDelete?1:0)})} tv={tv} mobile />
        {!arranging ? <div className="m-toolbar" role="toolbar" aria-label={t("mobile.toolbar")} style={{gridTemplateColumns:"repeat(4,minmax(0,1fr))"}}>
          {([['add','folder'],['arrange','doc'],['theme','palette'],['preview','star']] as const).map(([id,icon])=><button key={id} type="button" className="m-tool" aria-pressed={sheet===id} onClick={()=>{if(id==='preview')onPreview?.();else if(id==='arrange')setArranging(true);else setSheet(id);}}><Icon name={icon} size={22}/>{id==='arrange'?t('mobileEditor.arrange'):t(`mobile.${id}`)}</button>)}
        </div>:null}
      </>:null}
      {editor ? <BottomSheet open={sheet==='add'} title={t('authoring.add')} onClose={()=>setSheet(null)}>
        <AddWindowCatalog onAdd={type=>{const before=useEditorStore.getState().selectedId;store.addWindow(type);const id=useEditorStore.getState().selectedId;setSheet(null);if(id && id!==before){open(id);setToast({id:crypto.randomUUID(),message:t('mobileEditor.added')});requestAnimationFrame(()=>screenRef.current?.querySelector<HTMLInputElement>('.m-inline-titlebar input')?.focus());}}}/>
      </BottomSheet>:null}
      {editor ? <BottomSheet open={sheet==='theme'} title={t('mobile.theme')} onClose={()=>setSheet(null)} actions={<button type="button" className="w98-btn" onClick={()=>setSheet(null)}>{t('editor.done')}</button>}>
        <div className="mobile-quick-theme"><strong>{t('themeAppearanceEditor.wallpaper')}</strong><div className="mobile-wall-swatches">{['#008080','#ffd6e5','#c9b8f0','#a8e0cf','#9fd8f5','#ffe9b3','#1d1a3a','#c0c0c0'].map((wall,index)=><button key={wall} type="button" className="w98-btn" aria-label={t('mobileEditor.wallColor',{number:index+1})} aria-pressed={document.theme.wall===wall} style={{backgroundColor:wall}} onClick={()=>store.setTheme({...document.theme,wall,pattern:"none",wallImage:null})}/>)}</div><strong>{t('mobileEditor.titleColors')}</strong><div className="mobile-title-swatches">{[['#000080','#1084d0'],['#5b3fa8','#b39ddb'],['#1f7a5c','#5fbf9a'],['#bf360c','#ff8a65'],['#000000','#808080']].map(([titleFrom,titleTo],index)=><button key={titleFrom} type="button" className="w98-btn" aria-label={t('mobileEditor.titleColor',{number:index+1})} aria-pressed={document.theme.titleFrom===titleFrom} style={{background:`linear-gradient(90deg,${titleFrom},${titleTo})`}} onClick={()=>store.setTheme({...document.theme,titleFrom,titleTo})}/>)}</div></div>
        <details><summary>{t('mobileEditor.moreThemeOptions')}</summary><label className="check-row m-check"><input type="checkbox" checked={store.versionedDocument?.seo?.indexing ?? true} onChange={event=>store.setSeoIndexing(event.target.checked)}/>{t('rightPanel.allowSearchEnginesToIndex')}</label><span className="w98-hint">{t('mobileScreen.turningThisOffOnlyOutputs')}</span><ThemeAppearanceEditor theme={document.theme} previewTheme={store.themePreview} onPreviewTheme={store.setThemePreview} onTheme={store.setTheme} upload={upload}/></details>
      </BottomSheet>:null}
      {editor ? <BottomSheet open={sheet==='edit'} title={t('mobile.editWindowTitle')} onClose={()=>setSheet(null)} actions={<button type="button" className="w98-btn" onClick={()=>setSheet(null)}>{t('editor.done')}</button>}>
        {selected ? <>
          <IconPicker key={selected.id} siteId={siteId} value={selected.icon} upload={upload} mediaTarget={{windowId:selected.id,windowType:selected.type}} size={28} label={selected.title} defaultValue={makeWindow(selected.type).icon} onChange={icon=>store.updateWindow(selected.id,window=>({...window,icon}))}/>
          <label className="check-row m-check"><input type="checkbox" checked={selected.defaultOpen} onChange={e=>store.updateWindow(selected.id,window=>({...window,defaultOpen:e.target.checked}))}/>{t('mobileEditor.openByDefaultWhenVisitors')}</label>
          <button type="button" className="w98-btn danger" onClick={()=>deleteIcon(selected)}>{t('inspectorContent.delete')}</button>
          <details><summary>{t('mobileEditor.moreWindowOptions')}</summary><MobileEdit theme={theme} window={selected} count={ordered.length} siteId={siteId} upload={upload}/></details>
        </>:null}
      </BottomSheet>:null}
      {editor && toast ? <UndoToast key={toast.id} message={toast.message} hidden={!!sheet} onUndo={pendingDelete ? ()=>{pendingDeleteRef.current=null;setPendingDelete(null);setToast(null);requestAnimationFrame(()=>iconRefs.current.get(pendingDelete.id)?.focus());}:undefined} onExpire={()=>{flushDelete();setToast(null);}}/>:null}
    </div>
  );

  if (!framed) return <div className="visitor-mobile">{body}</div>;
  return <div className="visitor-mobile framed"><div className="m-bezel">{body}</div></div>;
}

function MobileEdit({ theme, window, count, siteId, upload }: { theme: SiteDocument["theme"]; window: DesktopWindow; count: number; siteId?: string; upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null> }) {
  const { t: tr } = useTranslation("editor");
  const store = useEditorStore();
  const patch = (change: Partial<DesktopWindow>, key?: string) => store.updateWindow(window.id, (current) => ({ ...current, ...change }) as DesktopWindow, key);
  return (
    <>
      <WindowChromeEditor theme={theme} window={window} onChange={(chrome) => patch({ chrome })} />
      <WindowAppearanceEditor theme={theme} window={window} onChange={(appearance, historyKey) => patch({ appearance }, historyKey)} />
      <div className="m-actions">
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order === 0} onClick={() => store.reorderMobile(window.id, -1)}>{tr("mobileScreen.moveIconEarlier")}</button>
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order >= count - 1} onClick={() => store.reorderMobile(window.id, 1)}>{tr("mobileScreen.moveIconLater")}</button>
        <button type="button" className="w98-btn" onClick={() => store.duplicateWindow(window.id)}>{tr("mobileScreen.duplicate")}</button>
      </div>
    </>
  );
}

/** Site-level options (language) tucked into the open app's title bar, plus a playing indicator now that the bottom taskbar is gone. */
function MobileSiteMenu({ label, playing, playingLabel }: { label: string; playing: boolean; playingLabel: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    // Capture phase on window: the menu is the top layer, so Escape closes only it (not the app, not a surrounding preview).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    globalThis.addEventListener("keydown", onKey, true);
    globalThis.document.addEventListener("pointerdown", onPointer);
    return () => {
      globalThis.removeEventListener("keydown", onKey, true);
      globalThis.document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <span ref={root} className="m-site-menu">
      {playing ? <span className="m-playing" role="status" title={playingLabel}>♫<span className="visually-hidden">{playingLabel}</span></span> : null}
      <WindowChromeButton ref={trigger} className="m-btn sq" aria-label={label} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((value) => !value)}>⋯</WindowChromeButton>
      {open ? <div className="m-site-panel w98-window" role="group" aria-label={label}><LanguageSwitcher /></div> : null}
    </span>
  );
}

/** A temporarily blank required title is a local draft, not an invalid document. */
function MobileTitleField(props: Parameters<typeof InlineTextField>[0]) {
  const [draft, setDraft] = useState(String(props.value ?? ""));
  useEffect(() => setDraft(String(props.value ?? "")), [props.value]);
  return <InlineTextField {...props} value={draft} onKeyDown={event => { props.onKeyDown?.(event); if(event.defaultPrevented || event.nativeEvent.isComposing)return; if(event.key==="Escape" || event.key==="Enter" && !draft.trim()){event.preventDefault();event.stopPropagation();setDraft(String(props.value ?? ""));} }} onValueChange={value => { setDraft(value); if(value.trim()) props.onValueChange?.(value); }} />;
}
