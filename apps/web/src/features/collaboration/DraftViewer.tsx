import { useRef, useState } from "react";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { Icon } from "../../components/Icon";
import { RetroButton } from "../../components/RetroButton";
import { buildPreviewModel } from "../editor/previewModel";
import { AssetSourceProvider } from "../../lib/assetSource";
import type { SiteRecord } from "../../lib/api";
import { useThemeView } from "../../lib/themeView";
import { useIsPhoneViewport } from "../../lib/useViewport";
import { GuestbookPreviewProvider } from "../modules/guestbook/previewContext";
import { MobileScreen } from "../site/MobileScreen";
import { createPreviewNavigation } from "../site/previewNavigation";
import { VisitorDesktop } from "../site/VisitorDesktop";

function projectDraft(site: SiteRecord) {
  const model = buildPreviewModel("draft", site.draft_document, site.id);
  if (!model) throw new Error(i18n.t("collab:draftViewer.thePrivateDraftFormatIs"));
  return model;
}

export function DraftViewer({ site }: { site: SiteRecord }) {
  const { t: tr } = useTranslation("collab");
  try {
    return <DraftViewerContent site={site} draft={projectDraft(site)} />;
  } catch (cause) {
    return <main className="not-found"><div><h1>{tr("draftViewer.cantShowThePrivateDraft")}</h1><p>{cause instanceof Error ? cause.message : tr("draftViewer.thePrivateDraftFormatIs")}</p></div></main>;
  }
}

function DraftViewerContent({ site, draft }: { site: SiteRecord; draft: ReturnType<typeof projectDraft> }) {
  const { t: tr } = useTranslation("collab");
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const navigation = useRef(createPreviewNavigation()).current; // see VisitorPreview
  const phone = useIsPhoneViewport();
  const [chosen, setDevice] = useState<"desktop" | "mobile">("desktop");
  // A real phone only has the mobile layout (the desktop renderer is hidden there); larger screens may simulate either.
  const device = phone ? "mobile" : chosen;
  const tv = useThemeView(draft.document.theme);
  const imageWallpaper = draft.document.theme.pattern === "image" && !!draft.document.theme.wallImage;

  return (
    <AssetSourceProvider siteId={site.id}>
      <main className="draft-viewer">
        <header className="draft-viewer-bar">
          <Link to="/auth" className="brand" title={tr("draftViewer.backToMyDesktops")}><Icon name="computer" size={22} />Retro Desktop</Link>
          <strong className="draft-viewer-badge">{tr("draftViewer.privateDraftViewOnly")}</strong>
          <span className="draft-viewer-name">{site.site_name}</span>
          <div className="top-spacer" />
          {phone ? null : <div role="group" aria-label={tr("draftViewer.device")} className="device-toggle">
            <button type="button" aria-pressed={device === "desktop"} className={"w98-btn" + (device === "desktop" ? " on" : "")} onClick={() => setDevice("desktop")}>{tr("draftViewer.desktop")}</button>
            <button type="button" aria-pressed={device === "mobile"} className={"w98-btn" + (device === "mobile" ? " on" : "")} onClick={() => setDevice("mobile")}>{tr("draftViewer.mobile")}</button>
          </div>}
          <RetroButton onClick={async () => { await signOut(); navigate("/"); }}>{tr("draftViewer.signOut")}</RetroButton>
        </header>
        <GuestbookPreviewProvider>
        <section className={"draft-viewer-body " + device} aria-label={tr("draft.preview", { device: device === "desktop" ? tr("draft.deviceDesktop") : tr("draft.deviceMobile") })}>
          {device === "desktop" ? (
            <div key="desktop" className="visitor-page draft-viewer-desktop" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: imageWallpaper ? "center" : "0 0", backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat" }}>
              <VisitorDesktop viewDrafts navigation={navigation} document={draft.document} profiles={draft.profiles} profileIdsByWindow={draft.profileIdsByWindow} profileDirectory={draft.profileDirectory} />
            </div>
          ) : (
            <div key={phone ? "phone-plain" : "phone-simulated"} className="draft-viewer-phone"><MobileScreen document={draft.document} mode="visitor" framed={!phone} viewDrafts navigation={navigation} profiles={draft.profiles} profileIdsByWindow={draft.profileIdsByWindow} profileDirectory={draft.profileDirectory} /></div>
          )}
        </section>
        </GuestbookPreviewProvider>
      </main>
    </AssetSourceProvider>
  );
}
