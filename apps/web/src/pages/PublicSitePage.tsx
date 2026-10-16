import { useEffect, useState } from "react";
import { loadVersionedSiteDocument, normalizeDocument, projectPublicSiteDocument, projectV2ToLegacyDocument, ProfileEntityV2Schema, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2 } from "@retrodesk/shared";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useThemeView } from "../lib/themeView";
import { MobileScreen } from "../features/site/MobileScreen";
import { VisitorDesktop } from "../features/site/VisitorDesktop";
import { buildProfileDirectory } from "../features/modules/instagram/profileDirectory";

export function PublicSitePage() {
  const { handle = "" } = useParams();
  const username = handle.startsWith("@") ? handle.slice(1) : "";
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntityV2[]>([]);
  const [profileIdsByWindow, setProfileIdsByWindow] = useState<Record<string, string>>({});
  const [profileDirectory, setProfileDirectory] = useState<ReturnType<typeof buildProfileDirectory>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    api.publicSite(username)
      .then(({ site }) => {
        const loaded = loadVersionedSiteDocument(site.published_document);
        if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "公開文件格式無效");
        let publicV2: SiteDocumentV2 | null = null;
        if (loaded.version === 2) {
          const scope = loaded.document.entities.profiles[0]?.siteId ?? loaded.document.windows.find((window) => window.type === "instagram")?.content.profileRef.siteId ?? "public-site";
          const projected = projectPublicSiteDocument(loaded.document, scope);
          if (!projected.ok || projected.version !== 2 || projected.document.schemaVersion !== 2) throw new Error("公開角色投影無效");
          publicV2 = projected.document;
        }
        const legacy = loaded.version === 1 ? { ok: true as const, document: normalizeDocument(loaded.document) } : projectV2ToLegacyDocument(publicV2!);
        if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? "公開角色引用無效");
        setDocument(legacy.document);
        if (loaded.version === 2) {
          setProfiles(publicV2!.entities.profiles.flatMap((profile) => { const parsed = ProfileEntityV2Schema.safeParse(profile); return parsed.success ? [parsed.data] : []; }));
          setProfileIdsByWindow(Object.fromEntries(publicV2!.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : [])));
          setProfileDirectory(buildProfileDirectory(publicV2!, true));
        }
        window.document.title = site.site_name + " — Retro Desktop";
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "找不到網站"));
  }, [username]);

  if (!username) return <Navigate to="/" replace />;
  if (error) return <main className="not-found"><div><h1>找不到這個桌面</h1><p>{error}</p></div></main>;
  if (!document) return <div className="boot-screen">Loading desktop...</div>;

  return <PublishedDesktop document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} />;
}

function PublishedDesktop({ document, profiles, profileIdsByWindow, profileDirectory }: { document: SiteDocument; profiles: ProfileEntityV2[]; profileIdsByWindow: Record<string, string>; profileDirectory: ReturnType<typeof buildProfileDirectory> }) {
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
      <VisitorDesktop document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} />

      <MobileScreen document={document} mode="visitor" profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} />
    </main>
  );
}
