import {
  loadVersionedSiteDocument,
  normalizeDocument,
  ProfileEntityV2Schema,
  projectPublicSiteDocument,
  projectV2ToLegacyDocument,
  type ProfileEntityV2,
  type SiteDocument,
  type SiteDocumentV2
} from "@retrodesk/shared";
import { buildProfileDirectory } from "../modules/instagram/profileDirectory";
import type { ProfileDirectoryEntry } from "../modules/types";

/**
 * Where a preview's data comes from. The renderers are shared, the data is not:
 * - `sample`      a built-in read-only example (home page); no site, no URL.
 * - `draft`       the private working draft, including content marked as draft (owner and authorised collaborators).
 * - `publishable` what publishing the draft *now* would put online: the draft through the same public projection the
 *                 publish API applies. Not online yet.
 * - `published`   the stored public snapshot that visitors actually get.
 * Only `published` and `publishable` pass through the public projection, so owner-only content never reaches them.
 */
export type PreviewSource = "sample" | "draft" | "publishable" | "published";

export type PreviewModel = {
  source: PreviewSource;
  /** Legacy render document the layout renderers consume. */
  document: SiteDocument;
  profiles: ProfileEntityV2[];
  profileIdsByWindow: Record<string, string>;
  profileDirectory: ProfileDirectoryEntry[];
};

const parsedProfiles = (document: SiteDocumentV2): ProfileEntityV2[] => document.entities.profiles.flatMap((profile) => {
  const parsed = ProfileEntityV2Schema.safeParse(profile);
  return parsed.success ? [parsed.data] : [];
});

const profileIdsByWindow = (document: SiteDocumentV2): Record<string, string> => Object.fromEntries(
  document.windows.flatMap((window) => window.type === "instagram" ? [[window.id, window.content.profileRef.id] as const] : [])
);

export function buildSampleModel(document: SiteDocument): PreviewModel {
  return { source: "sample", document, profiles: [], profileIdsByWindow: {}, profileDirectory: [] };
}

/** Returns null when the document cannot be read or projected (the caller shows nothing rather than guessing). */
export function buildPreviewModel(source: Exclude<PreviewSource, "sample">, raw: unknown, siteId: string): PreviewModel | null {
  const publicView = source !== "draft";
  const loaded = loadVersionedSiteDocument(raw, { siteId, migrateV1: !publicView });
  if (!loaded.ok) return null;
  if (loaded.version === 1) return { source, document: normalizeDocument(loaded.document), profiles: [], profileIdsByWindow: {}, profileDirectory: [] };

  let v2: SiteDocumentV2 = loaded.document as SiteDocumentV2;
  if (publicView) {
    const projected = projectPublicSiteDocument(loaded.document, siteId);
    if (!projected.ok || projected.version !== 2 || projected.document.schemaVersion !== 2) return null;
    v2 = projected.document;
  }
  const legacy = projectV2ToLegacyDocument(v2);
  if (!legacy.ok) return null;
  return {
    source,
    document: legacy.document,
    profiles: parsedProfiles(v2),
    profileIdsByWindow: profileIdsByWindow(v2),
    profileDirectory: buildProfileDirectory(v2, publicView)
  };
}

/** Characters and posts that exist in the stored public snapshot: the only ones a share link can point at. */
export type ShareableEntities = { profileIds: ReadonlySet<string>; postIds: ReadonlySet<string> };

export function shareableEntities(publishedRaw: unknown | null, siteId: string): ShareableEntities {
  const empty = { profileIds: new Set<string>(), postIds: new Set<string>() };
  if (publishedRaw == null) return empty;
  const model = buildPreviewModel("published", publishedRaw, siteId);
  if (!model) return empty;
  return {
    profileIds: new Set(model.profileDirectory.map((entry) => entry.id)),
    postIds: new Set(model.profileDirectory.flatMap((entry) => entry.posts.map((post) => post.id)))
  };
}
