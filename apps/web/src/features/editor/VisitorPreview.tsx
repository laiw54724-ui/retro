import { useState } from "react";
import type { SiteDocument } from "@retrodesk/shared";
import { useThemeView } from "../../lib/themeView";
import { VisitorDesktop } from "../site/VisitorDesktop";
import { MobilePreview } from "./MobilePreview";

/** Full-screen "what a visitor sees" view of the current draft. */
export function VisitorPreview({ document, username, published, onClose }: { document: SiteDocument; username: string; published: boolean; onClose: () => void }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const tv = useThemeView(document.theme);
  const imageWallpaper = document.theme.pattern === "image" && !!document.theme.wallImage;
  return (
    <div className="preview-overlay" role="dialog" aria-label="訪客預覽">
      <div className="preview-bar">
        <span className="visitor-badge">訪客模式</span>
        <span className="preview-label">{published ? `預覽已發布版本 · retrodesk.me/${username}` : "預覽目前草稿 · 尚未發布的內容訪客看不到"}</span>
        <div role="group" aria-label="裝置" className="device-toggle">
          <button type="button" aria-pressed={device === "desktop"} className={"w98-btn" + (device === "desktop" ? " on" : "")} onClick={() => setDevice("desktop")}>桌面版</button>
          <button type="button" aria-pressed={device === "mobile"} className={"w98-btn" + (device === "mobile" ? " on" : "")} onClick={() => setDevice("mobile")}>手機版</button>
        </div>
        <button type="button" className="w98-btn primary" onClick={onClose} autoFocus>‹ 回到編輯器</button>
      </div>
      <div className="preview-body">
        {device === "desktop" ? (
          <main className="visitor-page preview-page" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: imageWallpaper ? "center" : "0 0", backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat" }}>
            <VisitorDesktop document={document} />
          </main>
        ) : (
          <div className="preview-phone"><MobilePreview document={document} /></div>
        )}
      </div>
    </div>
  );
}
