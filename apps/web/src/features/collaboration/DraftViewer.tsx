import { useState } from "react";
import { loadVersionedSiteDocument, normalizeDocument, ProfileEntityV2Schema, projectV2ToLegacyDocument } from "@retrodesk/shared";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { Icon } from "../../components/Icon";
import { RetroButton } from "../../components/RetroButton";
import { buildProfileDirectory } from "../modules/instagram/profileDirectory";
import { AssetSourceProvider } from "../../lib/assetSource";
import type { SiteRecord } from "../../lib/api";
import { useThemeView } from "../../lib/themeView";
import { MobileScreen } from "../site/MobileScreen";
import { VisitorDesktop } from "../site/VisitorDesktop";

function projectDraft(site: SiteRecord) {
  const loaded = loadVersionedSiteDocument(site.draft_document, { siteId: site.id });
  if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "私人草稿格式無效");
  if (loaded.version === 1) return { document: normalizeDocument(loaded.document), profiles: [], profileIdsByWindow: {}, profileDirectory: [] };
  const legacy = projectV2ToLegacyDocument(loaded.document);
  if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? "角色引用無效");
  return {
    document: legacy.document,
    profiles: loaded.document.entities.profiles.flatMap((profile) => {
      const parsed = ProfileEntityV2Schema.safeParse(profile);
      return parsed.success ? [parsed.data] : [];
    }),
    profileIdsByWindow: Object.fromEntries(loaded.document.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : [])),
    profileDirectory: buildProfileDirectory(loaded.document)
  };
}

export function DraftViewer({ site }: { site: SiteRecord }) {
  try {
    return <DraftViewerContent site={site} draft={projectDraft(site)} />;
  } catch (cause) {
    return <main className="not-found"><div><h1>無法顯示私人草稿</h1><p>{cause instanceof Error ? cause.message : "私人草稿格式無效"}</p></div></main>;
  }
}

function DraftViewerContent({ site, draft }: { site: SiteRecord; draft: ReturnType<typeof projectDraft> }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [device, setDevice] = useState<"desktop" | "mobile">(() => window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop");
  const tv = useThemeView(draft.document.theme);
  const imageWallpaper = draft.document.theme.pattern === "image" && !!draft.document.theme.wallImage;

  return (
    <AssetSourceProvider siteId={site.id}>
      <main className="draft-viewer">
        <header className="draft-viewer-bar">
          <Link to="/auth" className="brand" title="回到我的桌面"><Icon name="computer" size={22} />Retro Desktop</Link>
          <strong className="draft-viewer-badge">私人草稿 · 只能查看</strong>
          <span className="draft-viewer-name">{site.site_name}</span>
          <div className="top-spacer" />
          <div role="group" aria-label="裝置" className="device-toggle">
            <button type="button" aria-pressed={device === "desktop"} className={"w98-btn" + (device === "desktop" ? " on" : "")} onClick={() => setDevice("desktop")}>桌面版</button>
            <button type="button" aria-pressed={device === "mobile"} className={"w98-btn" + (device === "mobile" ? " on" : "")} onClick={() => setDevice("mobile")}>手機版</button>
          </div>
          <RetroButton onClick={async () => { await signOut(); navigate("/"); }}>登出</RetroButton>
        </header>
        <section className={"draft-viewer-body " + device} aria-label={`${device === "desktop" ? "桌面" : "手機"}草稿預覽`}>
          {device === "desktop" ? (
            <div className="visitor-page draft-viewer-desktop" style={{ backgroundColor: tv.wall, backgroundImage: tv.wallImageCss, backgroundSize: tv.wallSize, backgroundPosition: imageWallpaper ? "center" : "0 0", backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat" }}>
              <VisitorDesktop document={draft.document} profiles={draft.profiles} profileIdsByWindow={draft.profileIdsByWindow} profileDirectory={draft.profileDirectory} />
            </div>
          ) : (
            <div className="draft-viewer-phone"><MobileScreen document={draft.document} mode="visitor" framed profiles={draft.profiles} profileIdsByWindow={draft.profileIdsByWindow} profileDirectory={draft.profileDirectory} /></div>
          )}
        </section>
      </main>
    </AssetSourceProvider>
  );
}
