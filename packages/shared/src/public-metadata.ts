import { projectPublicSiteDocument } from "./public-projection";
import type { SiteDocumentV2, VersionedSiteDocument } from "./site-versioning";

export type PublicEntityTarget = { kind: "oc" | "post"; id: string };
export type PublicMetadata = {
  title: string;
  description: string;
  image: string;
  canonicalPath: string;
  robots: "index,follow" | "noindex,nofollow";
  publishedVersion: number;
  cacheKey: string;
};
export type PublicMetadataResult = { ok: true; metadata: PublicMetadata } | { ok: false; code: "not_found" | "invalid_document" };

const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const truncate = (value: string, max: number) => {
  const points = Array.from(compact(value));
  return points.length <= max ? points.join("") : `${points.slice(0, Math.max(1, max - 1)).join("")}…`;
};
const publicImage = (value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
const profileName = (profile: SiteDocumentV2["entities"]["profiles"][number]) => profile.displayName || profile.name || profile.handle || profile.username;
const profileImage = (profile: SiteDocumentV2["entities"]["profiles"][number]) => publicImage(profile.avatar);

function siteDescription(document: VersionedSiteDocument) {
  if (document.schemaVersion === 2) {
    const profile = document.entities.profiles[0];
    if (profile?.bio) return profile.bio;
  }
  const about = document.windows.find((window) => window.type === "about");
  if (about?.type === "about" && about.content.bio) return about.content.bio;
  return `${document.siteName} 的 Retro Desktop。`;
}

export function buildPublicMetadata(input: {
  siteId: string;
  username: string;
  siteName: string;
  publishedVersion: number;
  document: unknown;
  target?: PublicEntityTarget;
}): PublicMetadataResult {
  const projection = projectPublicSiteDocument(input.document, input.siteId);
  if (!projection.ok) return { ok: false, code: "invalid_document" };
  const document = projection.document;
  const basePath = `/@${encodeURIComponent(input.username)}`;
  const indexing = document.schemaVersion === 2 ? document.seo.indexing : true;
  let title = `${input.siteName} — Retro Desktop`;
  let description = siteDescription(document);
  let image = "";
  let canonicalPath = basePath;

  if (input.target) {
    if (document.schemaVersion !== 2) return { ok: false, code: "not_found" };
    if (input.target.kind === "oc") {
      const profile = document.entities.profiles.find((item) => item.id === input.target!.id);
      if (!profile) return { ok: false, code: "not_found" };
      const name = profileName(profile);
      title = `${name} — ${input.siteName}`;
      description = profile.bio || `${name} 的 OC 個人頁。`;
      image = profileImage(profile);
      canonicalPath = `${basePath}/oc/${encodeURIComponent(profile.id)}`;
    } else {
      const post = document.entities.posts.find((item) => item.id === input.target!.id);
      if (!post) return { ok: false, code: "not_found" };
      const author = document.entities.profiles.find((item) => item.id === post.authorProfileId);
      if (!author) return { ok: false, code: "not_found" };
      const authorName = profileName(author);
      title = `${post.title || "貼文"} — ${authorName}`;
      description = post.caption || `${authorName} 的公開貼文。`;
      image = publicImage(post.media[0]?.src) || profileImage(author);
      canonicalPath = `${basePath}/post/${encodeURIComponent(post.id)}`;
    }
  } else if (document.schemaVersion === 2) {
    image = document.entities.profiles.map(profileImage).find(Boolean) ?? "";
  }

  const targetKey = input.target ? `${input.target.kind}:${input.target.id}` : "site";
  return {
    ok: true,
    metadata: {
      title: truncate(title, 120),
      description: truncate(description, 200),
      image,
      canonicalPath,
      robots: indexing ? "index,follow" : "noindex,nofollow",
      publishedVersion: input.publishedVersion,
      cacheKey: `published:${input.publishedVersion}:${targetKey}`,
    },
  };
}
