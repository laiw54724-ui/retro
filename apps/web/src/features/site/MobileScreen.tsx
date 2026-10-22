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
import { AddWindowDialog } from "../editor/AddWindowDialog";
import { useEditorStore } from "../editor/store";
import { WindowRenderer } from "./WindowRenderer";
import type { ProfileDirectoryEntry } from "../modules/types";
import { musicPlayback, useMusicPlayback } from "../modules/music/audioCoordinator";
import { stopAllMedia, stopWindowMedia } from "../modules/music/mediaSession";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useLocaleFormatting } from "../../i18n/format";

type Sheet = "add" | "edit" | "icon" | "theme" | null;

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
  const [inlineEdit, setInlineEdit] = useState(false);
  const iconRefs = useRef(new Map<string, HTMLButtonElement>());
  const screenRef = useRef<HTMLDivElement | null>(null);
  const contentEditButton = useRef<HTMLButtonElement | null>(null);
  const music = useMusicPlayback();
  const ordered = useMemo(() => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order), [document.windows]);
  const visitor = useVisitorNavigation({ document, siteId: navigationSiteId, profileDirectory, profileIdsByWindow, navigation, editing: editor, recordReturns: true, onOpen: (window) => open(window.id, true) });
  const openWindow = visitor.windows.find((window) => window.id === openId) ?? null;
  const selected = document.windows.find((window) => window.id === store.selectedId) ?? null;

  useEffect(() => () => stopAllMedia(), []);
  const open = (id: string, fromNavigation = false) => { if (!fromNavigation) visitor.clearReturns(); if (openId && openId !== id) stopWindowMedia(openId); if (navigation) navigation.openId = id; setOpenId(id); setInlineEdit(false); if (editor) store.select(id); };
  const back = () => { const closingId = openId; if (closingId) stopWindowMedia(closingId); const previous = visitor.back(openId); const returning = previous && visitor.windows.some((window) => window.id === previous.windowId) ? previous : null; if (navigation) navigation.openId = returning?.windowId ?? null; setOpenId(returning?.windowId ?? null); setInlineEdit(false); if (returning) restoreNavigationFocus(returning.focusKey, screenRef.current); else if (closingId) requestAnimationFrame(() => iconRefs.current.get(closingId)?.focus()); };
  useEffect(() => {
    if (!openId) return;
    // preventDefault marks the key as handled, so a surrounding preview does not also close on the same Escape
    const escape = (event: KeyboardEvent) => {
      // The author screen stays mounted behind preview; it must not consume
      // Escape before the active visitor screen receives the same event.
      if (screenRef.current?.closest("[inert], [hidden], [aria-hidden='true']")) return;
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); back(); }
    };
    globalThis.document.addEventListener("keydown", escape);
    return () => globalThis.document.removeEventListener("keydown", escape);
  }, [openId]);
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
    <div ref={screenRef} tabIndex={-1} className={`m-screen${editor ? ` ${authoring.screen}` : ""}`} style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
      {framed ? <div className="m-status" style={{ background: tv.face, color: tv.text, fontFamily }}><time dateTime={now.toISOString()} title={formatDate(now, { dateStyle: "full" })} aria-label={common("desktop.clockLabel", { time: clock })}>{clock}</time><span>5G ▮▮▮</span></div> : null}
      {/* One return path: while an app is open its own title bar is the only header (site options live in its menu). */}
      {!openWindow ? (
        <div className="m-titlebar" style={{ background: tv.titleBg, color: tv.titleText, fontFamily }}>
          <Icon name="computer" size={20} />
          <span className="m-site">{document.siteName}</span>
          {editor ? <span className="m-badge">{t("mobile.editing")}</span> : <LanguageSwitcher compact />}
        </div>
      ) : null}

      <div className="m-stage">
        <div className="m-scroll">
          <div className="mobile-icons m-grid" style={{ gridTemplateColumns: `repeat(${document.mobileColumns}, minmax(0, 1fr))` }}>
            {ordered.map((window) => (
              <button key={window.id} ref={(node) => { if (node) iconRefs.current.set(window.id, node); else iconRefs.current.delete(window.id); }} type="button" className="m-icon" data-window-id={window.id} aria-label={window.title} style={{ outline: editor && store.selectedId === window.id ? `2px dotted ${tv.text}` : "none" }} onClick={() => open(window.id)}>
                <span className="m-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}><Icon name={window.icon} size={40} /></span>
                <span className="m-label" style={resolveDesktopLabelAppearance(theme, window.appearance)}>{window.title}</span>
              </button>
            ))}
          </div>
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
              titleBarTrailing={editor
                ? <WindowChromeButton ref={contentEditButton} className="m-btn m-edit-toggle" aria-pressed={inlineEdit} onClick={() => setInlineEdit(!inlineEdit)}>{t(inlineEdit ? "mobile.finishEditing" : "mobile.editWindow")}</WindowChromeButton>
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

      {!editor ? null : (
        <div className="m-toolbar" role="toolbar" aria-label={t("mobile.toolbar")} style={{ fontFamily, gridTemplateColumns: `repeat(${selected ? 5 : 4}, minmax(0, 1fr))` }}>
          {([
            ["add", "folder"], ...(selected ? [["icon", "photo"] as const] : []), ["edit", "doc"], ["theme", "palette"], ["preview", "star"]
          ] as const).map(([id, icon]) => (
            <button key={id} type="button" className="m-tool" aria-pressed={sheet === id} onClick={() => { if (id === "preview") onPreview?.(); else setSheet(sheet === id ? null : id); }}>
              <Icon name={icon} size={22} />{id === "icon" ? t("rightPanel.icon") : t(`mobile.${id}`)}
            </button>
          ))}
        </div>
      )}

      {editor && sheet === "add" ? <AddWindowDialog onClose={() => setSheet(null)} onAdd={type => {
        const previous = useEditorStore.getState().selectedId;
        store.addWindow(type);
        const id = useEditorStore.getState().selectedId;
        setSheet(null);
        if (id && id !== previous) {
          open(id);
          setInlineEdit(true);
          requestAnimationFrame(() => contentEditButton.current?.focus({ preventScroll: true }));
        }
      }} /> : null}
      {editor && sheet && sheet !== "add" ? (
        <ModalDialog title={t(({ icon: "rightPanel.icon", edit: "mobile.editWindowTitle", theme: "mobile.theme" } as const)[sheet])} className="m-sheet" bodyClassName="m-sheet-body" width={520} onClose={() => setSheet(null)} actions={<button type="button" className="w98-btn primary" onClick={() => setSheet(null)}>{t("editor.done")}</button>}>
          {sheet === "edit" && openWindow ? (
            <button type="button" className="w98-btn m-return-content" onClick={() => {
              // Keep the content editor mounted and preserve its mode, local drafts and scroll.
              setSheet(null);
              requestAnimationFrame(() => contentEditButton.current?.focus({ preventScroll: true }));
            }}>{t("mobile.returnToContent", { title: openWindow.title })}</button>
          ) : sheet === "edit" && selected ? <p className="w98-hint">{t("mobile.openWindowForContent")}</p> : null}
          {sheet === "icon" && selected ? <IconPicker key={selected.id} siteId={siteId} value={selected.icon} upload={upload} mediaTarget={{ windowId: selected.id, windowType: selected.type }} size={28} label={selected.title} defaultValue={makeWindow(selected.type).icon} onChange={icon => store.updateWindow(selected.id, window => ({ ...window, icon }))} /> : null}
          {sheet === "theme" ? <ThemeAppearanceEditor theme={document.theme} previewTheme={store.themePreview} onPreviewTheme={store.setThemePreview} onTheme={store.setTheme} upload={upload} /> : null}
          {sheet === "edit" ? (
            selected ? <MobileEdit key={selected.id} theme={theme} window={selected} count={ordered.length} siteId={siteId} upload={upload} /> : <span className="m-note">{t("mobileScreen.clickAnIconOnThe")}</span>
          ) : null}
          {sheet === "edit" ? (
            <>
              <div className="w98-field"><span className="w98-hint">{t("mobileEditor.iconColumns")}</span>
                <div className="seg">{([3, 4] as const).map((count) => <button key={count} type="button" className={"w98-btn grow" + (document.mobileColumns === count ? " on" : "")} onClick={() => store.setMobileColumns(count)}>{t("layout.columnCount", { count })}</button>)}</div>
              </div>
              <label className="check-row m-check"><input type="checkbox" checked={store.versionedDocument?.seo?.indexing ?? true} onChange={(event) => store.setSeoIndexing(event.target.checked)} />{t("rightPanel.allowSearchEnginesToIndex")}</label>
              <span className="w98-hint">{t("mobileScreen.turningThisOffOnlyOutputs")}</span>
            </>
          ) : null}
        </ModalDialog>
      ) : null}
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
      <label className="w98-field"><span className="w98-hint">{tr("mobileEditor.windowTitle")}</span><input className="w98-input m-input" value={window.title} onChange={(event) => patch({ title: event.target.value }, "mt" + window.id)} /></label>
      <WindowChromeEditor theme={theme} window={window} onChange={(chrome) => patch({ chrome })} />
      <WindowAppearanceEditor theme={theme} window={window} onChange={(appearance, historyKey) => patch({ appearance }, historyKey)} />
      <span className="w98-hint">{tr("rightPanel.icon")}</span>
      <IconPicker key={window.id} siteId={siteId} value={window.icon} upload={upload} mediaTarget={{ windowId: window.id, windowType: window.type }} size={28} label={window.title} defaultValue={makeWindow(window.type).icon} onChange={(icon) => patch({ icon })} />
      <label className="check-row m-check"><input type="checkbox" checked={window.defaultOpen} onChange={(event) => patch({ defaultOpen: event.target.checked })} />{tr("mobileEditor.openByDefaultWhenVisitors")}</label>
      <div className="m-actions">
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order === 0} onClick={() => store.reorderMobile(window.id, -1)}>{tr("mobileScreen.moveIconEarlier")}</button>
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order >= count - 1} onClick={() => store.reorderMobile(window.id, 1)}>{tr("mobileScreen.moveIconLater")}</button>
        <button type="button" className="w98-btn" onClick={() => store.duplicateWindow(window.id)}>{tr("mobileScreen.duplicate")}</button>
        <button type="button" className="w98-btn danger" onClick={() => store.deleteWindow(window.id)}>{tr("inspectorContent.delete")}</button>
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
