import { useEffect, useState } from "react";
import { loadVersionedSiteDocument, normalizeDocument, projectV2ToLegacyDocument, ProfileEntityV2Schema, type ProfileEntityV2, type SiteDocument } from "@retrodesk/shared";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useThemeView } from "../lib/themeView";
import { MobileScreen } from "../features/site/MobileScreen";
import { VisitorDesktop } from "../features/site/VisitorDesktop";

export function PublicSitePage() {
  const { handle = "" } = useParams();
  const username = handle.startsWith("@") ? handle.slice(1) : "";
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntityV2[]>([]);
  const [profileIdsByWindow, setProfileIdsByWindow] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    api.publicSite(username)
      .then(({ site }) => {
        const loaded = loadVersionedSiteDocument(site.published_document);
        if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "公開文件格式無效");
        const legacy = loaded.version === 1 ? { ok: true as const, document: normalizeDocument(loaded.document) } : projectV2ToLegacyDocument(loaded.document);
        if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? "公開角色引用無效");
        setDocument(legacy.document);
        if (loaded.version === 2) {
          setProfiles(loaded.document.entities.profiles.flatMap((profile) => { const parsed = ProfileEntityV2Schema.safeParse(profile); return parsed.success ? [parsed.data] : []; }));
          setProfileIdsByWindow(Object.fromEntries(loaded.document.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : [])));
        }
        window.document.title = site.site_name + " — Retro Desktop";
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "找不到網站"));
  }, [username]);

  if (!username) return <Navigate to="/" replace />;
  if (error) return <main className="not-found"><div><h1>找不到這個桌面</h1><p>{error}</p></div></main>;
  if (!document) return <div className="boot-screen">Loading desktop...</div>;

  return <PublishedDesktop document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} />;
}

function PublishedDesktop({ document, profiles, profileIdsByWindow }: { document: SiteDocument; profiles: ProfileEntityV2[]; profileIdsByWindow: Record<string, string> }) {
  const theme = document.theme;
  const tv = useThemeView(theme);
  const imageWallpaper = theme.pattern === "image" && !!theme.wallImage;
  return (
    <main
      className="visitor-page"
      style={{
        backgroundColor: tv.wall,
        backgroundImage: tv.wallImageCss,
        backgroundSize: tv.wallSize,
        backgroundPosition: imageWallpaper ? "center" : "0 0",
        backgroundRepeat: imageWallpaper ? "no-repeat" : "repeat"
      }}
    >
      <VisitorDesktop document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} />

      <MobileScreen document={document} mode="visitor" profiles={profiles} profileIdsByWindow={profileIdsByWindow} />
    </main>
  );
}
