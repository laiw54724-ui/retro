import { useEffect, useState } from "react";
import { loadVersionedSiteDocument, makeWindow, normalizeDocument, projectPublicSiteDocument, projectV2ToLegacyDocument, ProfileEntityV2Schema, type ProfileEntityV2, type SiteDocument, type SiteDocumentV2 } from "@retrodesk/shared";
import { Navigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useThemeView } from "../lib/themeView";
import { MobileScreen } from "../features/site/MobileScreen";
import { VisitorDesktop } from "../features/site/VisitorDesktop";
import { buildProfileDirectory } from "../features/modules/instagram/profileDirectory";

export function PublicSitePage() {
  const { handle = "", profileId, postId } = useParams();
  const username = handle.startsWith("@") ? handle.slice(1) : "";
  const [document, setDocument] = useState<SiteDocument | null>(null);
  const [profiles, setProfiles] = useState<ProfileEntityV2[]>([]);
  const [profileIdsByWindow, setProfileIdsByWindow] = useState<Record<string, string>>({});
  const [profileDirectory, setProfileDirectory] = useState<ReturnType<typeof buildProfileDirectory>>([]);
  const [initialTarget, setInitialTarget] = useState<{ windowId: string; postId?: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;
    let active = true;
    setDocument(null);
    setError("");
    api.publicSite(username)
      .then(({ site }) => {
        if (!active) return;
        const loaded = loadVersionedSiteDocument(site.published_document);
        if (!loaded.ok) throw new Error(loaded.diagnostics[0]?.message ?? "公開文件格式無效");
        let publicV2: SiteDocumentV2 | null = null;
        if (loaded.version === 1 && (profileId || postId)) throw new Error("找不到公開內容");
        if (loaded.version === 2) {
          const scope = loaded.document.entities.profiles[0]?.siteId ?? loaded.document.windows.find((window) => window.type === "instagram")?.content.profileRef.siteId ?? "public-site";
          const projected = projectPublicSiteDocument(loaded.document, scope);
          if (!projected.ok || projected.version !== 2 || projected.document.schemaVersion !== 2) throw new Error("公開角色投影無效");
          publicV2 = projected.document;
        }
        const legacy = loaded.version === 1 ? { ok: true as const, document: normalizeDocument(loaded.document) } : projectV2ToLegacyDocument(publicV2!);
        if (!legacy.ok) throw new Error(legacy.diagnostics[0]?.message ?? "公開角色引用無效");
        let renderedDocument = legacy.document;
        if (loaded.version === 2) {
          const directory = buildProfileDirectory(publicV2!, true);
          const requestedPost = postId ? publicV2!.entities.posts.find((post) => post.id === postId) : undefined;
          const requestedProfileId = profileId ?? requestedPost?.authorProfileId;
          if ((profileId && !publicV2!.entities.profiles.some((profile) => profile.id === profileId)) || (postId && !requestedPost)) throw new Error("找不到公開內容");
          const idsByWindow = Object.fromEntries(publicV2!.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : []));
          if (requestedProfileId) {
            let targetWindow = publicV2!.windows.find((window) => window.type === "instagram" && window.content.profileRef.id === requestedProfileId)?.id;
            if (!targetWindow) {
              const entry = directory.find((candidate) => candidate.id === requestedProfileId);
              if (!entry) throw new Error("找不到公開內容");
              const viewer = makeWindow("instagram", renderedDocument.windows.length);
              if (viewer.type !== "instagram") throw new Error("無法建立公開檢視器");
              viewer.id = `viewer:${requestedProfileId}`;
              viewer.title = `${entry.profile.name || entry.profile.username}.exe`;
              viewer.defaultOpen = false;
              viewer.content = { ...viewer.content, profile: entry.profile, images: entry.posts };
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
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "找不到網站"); });
    return () => { active = false; };
  }, [username, profileId, postId]);

  if (!username) return <Navigate to="/" replace />;
  if (error) return <main className="not-found"><div><h1>找不到這個桌面</h1><p>{error}</p></div></main>;
  if (!document) return <div className="boot-screen">Loading desktop...</div>;

  return <PublishedDesktop key={`${username}:${profileId ?? ""}:${postId ?? ""}`} document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialTarget={initialTarget} shareBaseUrl={`${window.location.origin}/@${encodeURIComponent(username)}`} siteHandle={username} />;
}

function PublishedDesktop({ document, profiles, profileIdsByWindow, profileDirectory, initialTarget, shareBaseUrl, siteHandle }: { document: SiteDocument; profiles: ProfileEntityV2[]; profileIdsByWindow: Record<string, string>; profileDirectory: ReturnType<typeof buildProfileDirectory>; initialTarget: { windowId: string; postId?: string } | null; shareBaseUrl: string; siteHandle: string }) {
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
      <VisitorDesktop document={document} profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialOpenId={initialTarget?.windowId} initialPostId={initialTarget?.postId} publicShareBaseUrl={shareBaseUrl} siteHandle={siteHandle} />

      <MobileScreen document={document} mode="visitor" profiles={profiles} profileIdsByWindow={profileIdsByWindow} profileDirectory={profileDirectory} initialOpenId={initialTarget?.windowId} initialPostId={initialTarget?.postId} publicShareBaseUrl={shareBaseUrl} siteHandle={siteHandle} />
    </main>
  );
}
