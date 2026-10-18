import type { PreviewNavigation } from "./previewNavigation";
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
  /** Visitor previews: shared with the other layouts so rotation keeps the open app and character. */
  navigation?: PreviewNavigation;
  canShareEntity?: (kind: "oc" | "post", id: string) => boolean;
  viewDrafts?: boolean;
  publicShareBaseUrl?: string;
  siteHandle?: string;
};

/** The single-window phone experience. Used for visitors, the editor preview and the mobile editor. */
export function MobileScreen({ document, mode, framed = false, siteId, upload, onPreview, profiles, posts, collections, profileIdsByWindow, onProfileSelect, onProfileAdd, onProfileDuplicate, onProfileChange, onProfileDelete, profileDeleteBlocked, profileDeleteGuardById, profileDirectory, updateContent, socialDocument, initialOpenId, initialPostId, navigation, canShareEntity, viewDrafts, publicShareBaseUrl, siteHandle }: Props) {
  const { t } = useTranslation("editor");
  const { t: common } = useTranslation("common");
  const { t: musicText } = useTranslation("music");
  const { formatDate, formatTime, fontFamily } = useLocaleFormatting();
  const now = new Date();
  const clock = formatTime(now, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const editor = mode === "editor";
  const store = useEditorStore();
  const tv = useThemeView(document.theme);
  const [openId, setOpenId] = useState<string | null>(() => initialOpenId ?? (navigation?.openId && document.windows.some((window) => window.id === navigation.openId) ? navigation.openId : null) ?? (mode === "visitor" ? document.windows.find((window) => window.type === "character-dialog" && window.content.autoShow)?.id ?? null : null));
  const [sheet, setSheet] = useState<Sheet>(null);
  const [inlineEdit, setInlineEdit] = useState(false);
  const iconRefs = useRef(new Map<string, HTMLButtonElement>());
  const music = useMusicPlayback();
  const ordered = useMemo(() => [...document.windows].sort((a, b) => a.layout.mobile.order - b.layout.mobile.order), [document.windows]);
  const openWindow = ordered.find((window) => window.id === openId) ?? null;
  const selected = document.windows.find((window) => window.id === store.selectedId) ?? null;

  useEffect(() => () => stopAllMedia(), []);
  const open = (id: string) => { if (openId && openId !== id) stopWindowMedia(openId); if (navigation) navigation.openId = id; setOpenId(id); setInlineEdit(false); if (editor) store.select(id); };
  const back = () => { const closingId = openId; if (closingId) stopWindowMedia(closingId); if (navigation) navigation.openId = null; setOpenId(null); setInlineEdit(false); if (closingId) requestAnimationFrame(() => iconRefs.current.get(closingId)?.focus()); };
  useEffect(() => {
    if (!openId) return;
    // preventDefault marks the key as handled, so a surrounding preview does not also close on the same Escape
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); back(); } };
    globalThis.document.addEventListener("keydown", escape);
    return () => globalThis.document.removeEventListener("keydown", escape);
  }, [openId]);
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel, fontFamily };

  const body = (
    <div className="m-screen" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: "center", fontFamily: tv.fontFamily, color: tv.text }}>
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
              titleBarTrailing={editor
                ? <WindowChromeButton className="m-btn m-edit-toggle" aria-pressed={inlineEdit} onClick={() => setInlineEdit(!inlineEdit)}>{t(inlineEdit ? "mobile.finishEditing" : "mobile.editWindow")}</WindowChromeButton>
                : <MobileSiteMenu label={t("mobile.siteMenu")} playing={music.windowId === openWindow.id && music.status === "playing"} playingLabel={musicText("playback.playing")} />}
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
                navigation={navigation}
                canShareEntity={canShareEntity}
                viewDrafts={viewDrafts}
                publicShareBaseUrl={publicShareBaseUrl}
                siteHandle={siteHandle}
              />
            </RetroWindow>
          </div>
        ) : null}
      </div>

      {!editor ? null : (
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
                selected ? <MobileEdit key={selected.id} theme={document.theme} window={selected} count={ordered.length} siteId={siteId} upload={upload} /> : <span className="m-note">{t("mobileScreen.clickAnIconOnThe")}</span>
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
      <label className="check-row m-check"><input type="checkbox" checked={window.defaultOpen} onChange={(event) => patch({ defaultOpen: event.target.checked })} />{tr("mobileScreen.openAutomaticallyWhenVisitorsArrive")}</label>
      <div className="m-actions">
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order === 0} onClick={() => store.reorderMobile(window.id, -1)}>{tr("mobileScreen.moveIconEarlier")}</button>
        <button type="button" className="w98-btn" disabled={window.layout.mobile.order >= count - 1} onClick={() => store.reorderMobile(window.id, 1)}>{tr("mobileScreen.moveIconLater")}</button>
        <button type="button" className="w98-btn" onClick={() => store.duplicateWindow(window.id)}>{tr("mobileScreen.duplicate")}</button>
        <button type="button" className="w98-btn danger" onClick={() => store.deleteWindow(window.id)}>{tr("inspectorContent.delete")}</button>
      </div>
      <div className="w98-sep" />
      <span className="w98-hint">{tr("mobileScreen.contentCloseThisPanelOpen")}</span>
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
