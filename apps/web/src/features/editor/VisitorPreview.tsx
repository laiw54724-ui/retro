import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SiteDocument } from "@retrodesk/shared";
import { useThemeView } from "../../lib/themeView";
import { useIsPhoneViewport } from "../../lib/useViewport";
import { VisitorDesktop } from "../site/VisitorDesktop";
import { MobilePreview } from "./MobilePreview";

/** Full-screen "what a visitor sees" view of the current draft. */
export function VisitorPreview({ document, username, published, onClose }: { document: SiteDocument; username: string; published: boolean; onClose: () => void }) {
  const { t: tr } = useTranslation("editor");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const phone = useIsPhoneViewport();
  // On a real phone the desktop renderer is hidden by the global stylesheet, so the only honest view is the mobile one.
  const view = phone ? "mobile" : device;
  const tv = useThemeView(document.theme);
  const imageWallpaper = document.theme.pattern === "image" && !!document.theme.wallImage;
  return (
    <div className="preview-overlay" role="dialog" aria-label={tr("mobileEditor.visitorPreview")}>
      <div className="preview-bar">
        <span className="visitor-badge">{tr("visitorPreview.visitorMode")}</span>
        <span className="preview-label">{published ? tr("visitorPreview.previewingThePublishedVersionRetrodesk", { username }) : tr("visitorPreview.previewingTheCurrentDraftVisitors")}</span>
        {phone ? null : (
          <div role="group" aria-label={tr("visitorPreview.device")} className="device-toggle">
            <button type="button" aria-pressed={view === "desktop"} className={"w98-btn" + (view === "desktop" ? " on" : "")} onClick={() => setDevice("desktop")}>{tr("visitorPreview.desktop")}</button>
            <button type="button" aria-pressed={view === "mobile"} className={"w98-btn" + (view === "mobile" ? " on" : "")} onClick={() => setDevice("mobile")}>{tr("visitorPreview.mobile")}</button>
          </div>
        )}
        <button type="button" className="w98-btn primary" onClick={onClose} autoFocus>{tr("visitorPreview.backToEditor")}</button>
      </div>
      <div className="preview-body">
        {view === "desktop" ? (
          <main className="visitor-page preview-page" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: imageWallpaper ? "center" : "0 0", backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat" }}>
            <VisitorDesktop document={document} />
          </main>
        ) : phone ? (
          <div className="preview-phone-real"><MobilePreview document={document} framed={false} /></div>
        ) : (
          <div className="preview-phone"><MobilePreview document={document} /></div>
        )}
      </div>
    </div>
  );
}
