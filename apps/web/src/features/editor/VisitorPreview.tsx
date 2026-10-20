import { DesktopPreviewViewport } from "../preview/DesktopPreviewViewport";
import { createDesktopPreviewSession } from "../preview/desktopPreviewGeometry";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { currentOpener } from "../../lib/openerFocus";
import { lockBackground } from "../../lib/backgroundLock";
import { useThemeView } from "../../lib/themeView";
import { useIsPhoneViewport } from "../../lib/useViewport";
import { createPreviewNavigation } from "../site/previewNavigation";
import { VisitorDesktop } from "../site/VisitorDesktop";
import { GuestbookPreviewProvider } from "../modules/guestbook/previewContext";
import { MobileScreen } from "../site/MobileScreen";
import type { PreviewModel, ShareableEntities } from "./previewModel";

/** Where the site stands relative to what is online; drives the wording of the preview bar. */
export type PublishState = "never" | "changed" | "in-sync";

type Props = {
  /** What the visitor would get once published (public projection of the draft). Editor default. */
  publishable?: PreviewModel | null;
  /** The private working draft. */
  draft?: PreviewModel | null;
  /** A built-in read-only example (home page). Mutually exclusive with the two above. */
  sample?: PreviewModel | null;
  username?: string;
  /** Reachable public URL; only set when a published snapshot exists. */
  siteUrl?: string | null;
  publishState?: PublishState;
  /** Characters/posts in the stored public snapshot: the only things a share link may point at. */
  shareable?: ShareableEntities | null;
  onClose: () => void;
};

const FOCUSABLE = "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])";

/**
 * Full-screen "what a visitor sees". Everything a visitor does here (opening apps, switching characters, liking) is
 * session-only: nothing is written to the draft, autosave or the editor's undo history.
 *
 * Dismissal: Escape closes the topmost layer first — a lightbox/dialog (they stop the key), then a start menu, story or
 * open phone app (they mark it handled) — and only then the preview; browser Back closes it without leaving the page;
 * focus returns to what opened it.
 */
export function VisitorPreview({ publishable, draft, sample, username = "", siteUrl = null, publishState = "never", shareable = null, onClose }: Props) {
  const { t: tr } = useTranslation("editor");
  const [source, setSource] = useState<"publishable" | "draft" | "sample">(sample ? "sample" : publishable ? "publishable" : "draft");
  const [device, setDevice] = useState<"desktop" | "mobile" | null>(null);
  const desktopSessions = useRef({ sample: createDesktopPreviewSession(), publishable: createDesktopPreviewSession(), draft: createDesktopPreviewSession() }).current;
  const phone = useIsPhoneViewport();
  // Position (open app, character) survives layout switches and rotation; it is dropped when the preview closes.
  const navigation = useRef(createPreviewNavigation()).current;
  const root = useRef<HTMLDivElement | null>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const model = (source === "sample" ? sample : source === "publishable" ? publishable : draft) ?? sample ?? publishable ?? draft;
  const view = device ?? (phone ? "mobile" : "desktop");
  const tv = useThemeView(model?.document.theme ?? ({} as never));

  useEffect(() => lockBackground(), []);

  // Focus: move into the preview, give it back to the opener on close.
  useEffect(() => {
    const doc = globalThis.document;
    const previous = currentOpener();
    root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  // Escape: bubble phase on window, after lightboxes/dialogs (capture + stopPropagation) and inner layers (preventDefault).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      latestClose.current();
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  // Tab stays inside the preview, except while a lightbox/dialog portalled elsewhere owns focus.
  useEffect(() => {
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !root.current) return;
      const active = globalThis.document.activeElement as HTMLElement | null;
      if (active && !root.current.contains(active) && active.closest("[aria-modal='true']")) return;
      const controls = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (!active || !root.current.contains(active)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    globalThis.addEventListener("keydown", onTab, true);
    return () => globalThis.removeEventListener("keydown", onTab, true);
  }, []);

  // Browser Back closes the preview instead of leaving the page. One marker entry is pushed while open; leaving by any
  // other route pops it again (deferred so a StrictMode remount does not trip over its own pop).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const hist = globalThis.history;
    if (!hist.state?.retroPreview) hist.pushState({ ...(hist.state ?? {}), retroPreview: true }, "");
    const onPop = () => { if (!globalThis.history.state?.retroPreview) latestClose.current(); };
    globalThis.addEventListener("popstate", onPop);
    return () => {
      mounted.current = false;
      globalThis.removeEventListener("popstate", onPop);
      setTimeout(() => { if (!mounted.current && globalThis.history.state?.retroPreview) globalThis.history.back(); }, 0);
    };
  }, []);

  const canShareEntity = useCallback((kind: "oc" | "post", id: string) => !!shareable && (kind === "oc" ? shareable.profileIds.has(id) : shareable.postIds.has(id)), [shareable]);

  if (!model) return null;
  const sharing = source === "sample" ? {} : { viewDrafts: source === "draft", publicShareBaseUrl: siteUrl ?? undefined, siteHandle: username, canShareEntity: siteUrl ? canShareEntity : undefined };
  const imageWallpaper = model.document.theme.pattern === "image" && !!model.document.theme.wallImage;
  const label = source === "sample"
    ? tr("visitorPreview.sampleReadOnly")
    : source === "draft"
      ? tr("visitorPreview.draftLabel")
      : publishState === "never"
        ? tr("visitorPreview.notPublishedYet")
        : publishState === "changed"
          ? tr("visitorPreview.hasUnpublishedChanges")
          : tr("visitorPreview.sameAsPublished");

  return createPortal(
    <div ref={root} className="preview-overlay" role="dialog" aria-modal="true" aria-label={tr("mobileEditor.visitorPreview")} data-preview-source={source}>
      <div className="preview-bar">
        <span className="visitor-badge">{tr("visitorPreview.visitorMode")}</span>
        {!sample ? (
          <div role="group" aria-label={tr("visitorPreview.source")} className="preview-source-toggle">
            <button type="button" aria-pressed={source === "publishable"} className={"w98-btn" + (source === "publishable" ? " on" : "")} disabled={!publishable} onClick={() => setSource("publishable")}>{tr("visitorPreview.showPublishable")}</button>
            <button type="button" aria-pressed={source === "draft"} className={"w98-btn" + (source === "draft" ? " on" : "")} disabled={!draft} onClick={() => setSource("draft")}>{tr("visitorPreview.showDraft")}</button>
          </div>
        ) : null}
        <span className="preview-label" role="status" data-testid="preview-label">{label}</span>
        <div role="group" aria-label={tr("visitorPreview.device")} className="device-toggle">
            <button type="button" aria-pressed={view === "desktop"} className={"w98-btn" + (view === "desktop" ? " on" : "")} onClick={() => setDevice("desktop")}>{tr("visitorPreview.desktop")}</button>
            <button type="button" aria-pressed={view === "mobile"} className={"w98-btn" + (view === "mobile" ? " on" : "")} onClick={() => setDevice("mobile")}>{tr("visitorPreview.mobile")}</button>
        </div>
        <button type="button" className="w98-btn primary" onClick={onClose} data-autofocus>{source === "sample" ? tr("visitorPreview.backToSamples") : tr("visitorPreview.backToEditor")}</button>
      </div>
      <GuestbookPreviewProvider>
      <div className="preview-body">
        {view === "desktop" ? (
          <DesktopPreviewViewport key={source} windows={model.document.windows} session={desktopSessions[source]}>{(scale) => (
          <main className="visitor-page preview-page" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: imageWallpaper ? "center" : "0 0", backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat" }}>
            <VisitorDesktop navigationSiteId={model.siteId} key={source} interactionScale={scale} document={model.document} profiles={model.profiles} profileIdsByWindow={model.profileIdsByWindow} profileDirectory={model.profileDirectory} navigation={navigation} {...sharing} />
          </main>
          )}</DesktopPreviewViewport>
        ) : (
          <div key={phone ? "phone-plain" : "phone-simulated"} className={phone ? "preview-phone-real" : "preview-phone"}>
            <MobileScreen navigationSiteId={model.siteId} key={source} document={model.document} mode="visitor" framed={!phone} profiles={model.profiles} profileIdsByWindow={model.profileIdsByWindow} profileDirectory={model.profileDirectory} navigation={navigation} {...sharing} />
          </div>
        )}
      </div>
      </GuestbookPreviewProvider>
    </div>,
    globalThis.document.body
  );
}
