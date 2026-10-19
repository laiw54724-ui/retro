import { createEntityViewer } from "../features/navigation/createEntityViewer";
import { createPreviewNavigation } from "../features/site/previewNavigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadVersionedSiteDocument, normalizeDocument, projectPublicSiteDocument, projectV2ToLegacyDocument, ProfileEntityV2Schema, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2 } from "@retrodesk/shared";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useMobileViewport } from "../lib/useMobileViewport";
import { useThemeView } from "../lib/themeView";
import { MobileScreen } from "../features/site/MobileScreen";
import { VisitorDesktop } from "../features/site/VisitorDesktop";
import { buildProfileDirectory } from "../features/modules/instagram/profileDirectory";

export function PublicSitePage() {
  const { t: tr } = useTranslation("common");
  const { handle = "", profileId, postId } = useParams();
  const username = handle.startsWith("@") ? handle.slice(1) : "";
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntityV2[]>([]);
  const [profileIdsByWindow, setProfileIdsByWindow] = useState<Record<string, string>>({});
  const [profileDirectory, setProfileDirectory] = useState<ReturnType<typeof buildProfileDirectory>>([]);
  const [initialTarget, setInitialTarget] = useState<{ windowId: string; postId?: string } | null>(null);
  const [navigationSiteId, setNavigationSiteId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    let active = true;
    setDocument(null);
    setError("");
    setNavigationSiteId(null);
    api.publicSite(username)
      .then(({ site }) => {
        if (!active) return;
        const loaded = loadVersionedSiteDocument(site.published_document);
        if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? tr("publicSite.thePublicDocumentFormatIs"));
        let publicV2: SiteDocumentV2 | null = null;
        if (loaded.version === 1 && (profileId || postId)) throw new Error(tr("publicSite.publicContentNotFound"));
        if (loaded.version === 2) {
          const scope = loaded.document.entities.profiles[0]?.siteId ?? loaded.document.windows.find((window) => window.type === "instagram")?.content.profileRef.siteId ?? loaded.document.windows.flatMap((window) => window.type === "explorer" ? window.content.shortcuts : [])[0]?.target.siteId ?? "public-site";
          setNavigationSiteId(scope);
          const projected = projectPublicSiteDocument(loaded.document, scope);
          if (!projected.ok || projected.version !== 2 || projected.document.schemaVersion !== 2) throw new Error(tr("publicSite.thePublicCharacterProjectionIs"));
          publicV2 = projected.document;
        }
        const legacy = loaded.version === 1 ? { ok: true as const, document: normalizeDocument(loaded.document) } : projectV2ToLegacyDocument(publicV2!);
        if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? tr("publicSite.thePublicCharacterReferenceIs"));
        let renderedDocument = legacy.document;
        if (loaded.version === 2) {
          const directory = buildProfileDirectory(publicV2!, true);
          const requestedPost = postId ? publicV2!.entities.posts.find((post) => post.id === postId) : undefined;
          const requestedProfileId = profileId ?? requestedPost?.authorProfileId;
          if ((profileId && !publicV2!.entities.profiles.some((profile) => profile.id === profileId)) || (postId && !requestedPost)) throw new Error(tr("publicSite.publicContentNotFound"));
          const idsByWindow = Object.fromEntries(publicV2!.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : []));
          if (requestedProfileId) {
            let targetWindow = publicV2!.windows.find((window) => window.type === "instagram" && window.content.profileRef.id === requestedProfileId)?.id;
            if (!targetWindow) {
              const entry = directory.find((candidate) => candidate.id === requestedProfileId);
              if (!entry) throw new Error(tr("publicSite.publicContentNotFound"));
              const viewer = createEntityViewer(entry, renderedDocument.windows);
              viewer.id = `viewer:${requestedProfileId}`;
              renderedDocument = { ...renderedDocument, windows: [...renderedDocument.windows, viewer] };
              idsByWindow[viewer.id] = requestedProfileId;
              targetWindow = viewer.id;
            }
            setInitialTarget({ windowId: targetWindow, postId: requestedPost?.id });
          } else setInitialTarget(null);
          setProfiles(publicV2!.entities.profiles.flatMap((profile) => { const parsed = ProfileEntityV2Schema.safeParse(profile); return parsed.success ? [parsed.data] : []; }));
          setProfileIdsByWindow(idsByWindow);
          setProfileDirectory(directory);
        }
        setDocument(renderedDocument);
        const selected = profileId ? publicV2?.entities.profiles.find((profile) => profile.id === profileId)?.displayName : postId ? publicV2?.entities.posts.find((post) => post.id === postId)?.title : "";
        window.document.title = (selected ? `${selected} — ` : "") + site.site_name + " — Retro Desktop";
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : tr("publicSite.siteNotFound")); });
    return () => { active = false; };
  }, [username, profileId, postId]);

  if (!username) return <Navigate to="/" replace />;
  if (error) return <main className="not-found"><div><h1>{tr("publicSite.thisDesktopCouldntBeFound")}</h1><p>{error}</p></div></main>;
  if (!document) return <div className="boot-screen">Loading desktop...</div>;

  return <PublishedDesktop key={`${username}:${profileId ?? ""}:${postId ?? ""}`} navigationSiteId={navigationSiteId} document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialTarget={initialTarget} shareBaseUrl={`${window.location.origin}/@${encodeURIComponent(username)}`} siteHandle={username} />;
}

function PublishedDesktop({ navigationSiteId, document, profiles, profileIdsByWindow, profileDirectory, initialTarget, shareBaseUrl, siteHandle }: { navigationSiteId: string | null; document: SiteDocument; profiles: ProfileEntityV2[]; profileIdsByWindow: Record<string, string>; profileDirectory: ReturnType<typeof buildProfileDirectory>; initialTarget: { windowId: string; postId?: string } | null; shareBaseUrl: string; siteHandle: string }) {
  const navigation = useRef(createPreviewNavigation()).current;
  const mobile = useMobileViewport();
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
      {mobile ? (
        <MobileScreen navigation={navigation} navigationSiteId={navigationSiteId} document={document} mode="visitor" profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialOpenId={initialTarget?.windowId} initialPostId={initialTarget?.postId} publicShareBaseUrl={shareBaseUrl} siteHandle={siteHandle} />
      ) : (
        <VisitorDesktop navigation={navigation} navigationSiteId={navigationSiteId} document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialOpenId={initialTarget?.windowId} initialPostId={initialTarget?.postId} publicShareBaseUrl={shareBaseUrl} siteHandle={siteHandle} />
      )}
    </main>
  );
}
