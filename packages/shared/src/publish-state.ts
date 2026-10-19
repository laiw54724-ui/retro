import { parseAssetReference } from "./asset-reference";
import { projectPublicSiteDocument } from "./public-projection";
import { migrateSiteDocumentV2, parseSiteDocument, sameDocumentContent } from "./site-versioning";

export type PublishComparisonInput = {
  siteId: string;
  /** How the API names published assets for this site; see {@link PublishedAssetMapping}. */
  assets: PublishedAssetMapping;
  /** Legacy render projection of the current draft, and of the published copy (null when never published). */
  draftLegacy: unknown;
  publishedLegacy: unknown | null;
  /** Canonical v2 draft (the document the API receives). Missing only for a v1 draft that was never migrated. */
  draftCanonical?: unknown | null;
  /** The published document exactly as stored (any version), or null when unknown. */
  publishedRaw?: unknown | null;
};

/** Extensions the API writes for published assets (`published/<username>/assets/<id>.<ext>`). */
const PUBLISHED_ASSET_EXTENSIONS = new Set(["jpg", "png", "webp", "gif", "mp3", "ogg", "wav"]);

export type PublishedAssetMapping = {
  /** The site's username: published assets live under `published/<username>/assets/`. */
  username: string;
  /**
   * Trusted base URLs the API publishes assets under (its `PUBLIC_ASSET_BASE_URL`). Only a URL that starts with one of
   * these, followed by exactly `/published/<username>/assets/<id>.<ext>`, counts as the published form of a reference.
   */
  trustedAssetBaseUrls: readonly string[];
};

function publishedFormOfReference(reference: string, published: string, mapping: PublishedAssetMapping): boolean {
  const id = parseAssetReference(reference);
  if (!id || !mapping.username) return false;
  for (const base of mapping.trustedAssetBaseUrls) {
    const prefix = `${base.replace(/\/+$/, "")}/published/${mapping.username}/assets/${id}.`;
    if (published.startsWith(prefix) && PUBLISHED_ASSET_EXTENSIONS.has(published.slice(prefix.length))) return true;
  }
  return false;
}

/**
 * Structural equality between what publishing would store (draft side) and the stored published copy. Object key order
 * and `undefined` members are ignored; arrays are ordered; strings must be identical, except at a position where the
 * draft holds `retro-asset:<id>`: there the stored copy holds the URL the API wrote for that exact asset, site and
 * trusted base. No string is ever rewritten, so ordinary text and foreign URLs can never be mistaken for assets.
 */
function equalAsPublished(draft: unknown, published: unknown, mapping: PublishedAssetMapping): boolean {
  if (typeof draft === "string") return typeof published === "string" && (draft === published || publishedFormOfReference(draft, published, mapping));
  if (Array.isArray(draft)) return Array.isArray(published) && draft.length === published.length && draft.every((item, index) => equalAsPublished(item, published[index], mapping));
  if (draft && typeof draft === "object") {
    if (!published || typeof published !== "object" || Array.isArray(published)) return false;
    const left = Object.entries(draft as Record<string, unknown>).filter(([, value]) => value !== undefined);
    const right = published as Record<string, unknown>;
    const rightKeys = Object.entries(right).filter(([, value]) => value !== undefined).map(([key]) => key);
    return left.length === rightKeys.length && left.every(([key, value]) => Object.prototype.hasOwnProperty.call(right, key) && equalAsPublished(value, right[key], mapping));
  }
  return draft === published;
}

/** What publishing would store for a draft, expressed in draft vocabulary (assets as references). Null when it cannot be published. */
function comparablePublicDocument(raw: unknown, siteId: string): { version: 1 | 2; document: unknown } | null {
  const projected = projectPublicSiteDocument(raw, siteId);
  return projected.ok ? { version: projected.version, document: projected.document } : null;
}

/** A published copy as a canonical v2 document, migrating a v1 copy the same way the draft was migrated. */
function publishedAsV2(raw: unknown, siteId: string): unknown | null {
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return null;
  if (parsed.version === 2) return parsed.document;
  // A v1 copy was published before canonical data existed. Migrate it as the draft was migrated, then take its public
  // projection so both sides pass through the same publish semantics (e.g. canonical highlight ids replace legacy ones).
  const migrated = migrateSiteDocumentV2(parsed.document, { siteId });
  if (!migrated.ok || migrated.version !== 2) return null;
  const projected = projectPublicSiteDocument(migrated.document, siteId);
  return projected.ok ? projected.document : null;
}

/**
 * Whether publishing now would change the public result. It compares like with like: the draft's *public projection*
 * (the same function the API uses, so private characters, posts, collections and folders are excluded) against the
 * stored published copy, with the asset URLs the API wrote mapped back to asset references. Public filtering is never
 * relaxed, and edits that only touch private content do not count as unpublished changes.
 *
 * The legacy render projection drops canonical-only data, so it only decides when no canonical draft exists.
 */
export function hasUnpublishedChanges(input: PublishComparisonInput): boolean {
  if (input.publishedLegacy == null) return true;
  if (input.draftCanonical != null && input.publishedRaw != null) {
    const draft = comparablePublicDocument(input.draftCanonical, input.siteId);
    if (draft && draft.version === 2) {
      const published = publishedAsV2(input.publishedRaw, input.siteId);
      // A published copy that cannot be read counts as different: republishing is the way to repair it.
      return !published || !equalAsPublished(draft.document, published, input.assets);
    }
  }
  return !sameDocumentContent(input.draftLegacy, input.publishedLegacy);
}
