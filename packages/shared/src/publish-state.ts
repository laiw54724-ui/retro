import { ASSET_REFERENCE_PREFIX } from "./asset-reference";
import { projectPublicSiteDocument } from "./public-projection";
import { migrateSiteDocumentV2, parseSiteDocument, sameDocumentContent } from "./site-versioning";

export type PublishComparisonInput = {
  siteId: string;
  /** Legacy render projection of the current draft, and of the published copy (null when never published). */
  draftLegacy: unknown;
  publishedLegacy: unknown | null;
  /** Canonical v2 draft (the document the API receives). Missing only for a v1 draft that was never migrated. */
  draftCanonical?: unknown | null;
  /** The published document exactly as stored (any version), or null when unknown. */
  publishedRaw?: unknown | null;
};

const PUBLISHED_ASSET_URL = /\/published\/[^/]+\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(?:jpg|png|webp|gif|mp3|ogg|wav)$/i;

/** Publishing replaces `retro-asset:<id>` with a public URL; map those URLs back so both sides name assets the same way. */
function normalizePublishedAssetUrls<T>(value: T): T {
  const visit = (node: unknown): unknown => {
    if (typeof node === "string") {
      const match = PUBLISHED_ASSET_URL.exec(node);
      return match ? `${ASSET_REFERENCE_PREFIX}${match[1].toLowerCase()}` : node;
    }
    if (Array.isArray(node)) return node.map(visit);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([key, item]) => [key, visit(item)]));
    return node;
  };
  return visit(value) as T;
}

/** What publishing would store for a draft, expressed in draft vocabulary (assets as references). Null when it cannot be published. */
function comparablePublicDocument(raw: unknown, siteId: string): { version: 1 | 2; document: unknown } | null {
  const projected = projectPublicSiteDocument(raw, siteId);
  return projected.ok ? { version: projected.version, document: normalizePublishedAssetUrls(projected.document) } : null;
}

/** A published copy as a canonical v2 document, migrating a v1 copy the same way the draft was migrated. */
function publishedAsV2(raw: unknown, siteId: string): unknown | null {
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return null;
  if (parsed.version === 2) return normalizePublishedAssetUrls(parsed.document);
  // A v1 copy was published before canonical data existed. Migrate it as the draft was migrated, then take its public
  // projection so both sides pass through the same publish semantics (e.g. canonical highlight ids replace legacy ones).
  const migrated = migrateSiteDocumentV2(parsed.document, { siteId });
  if (!migrated.ok || migrated.version !== 2) return null;
  const projected = projectPublicSiteDocument(migrated.document, siteId);
  return projected.ok ? normalizePublishedAssetUrls(projected.document) : null;
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
      return !published || !sameDocumentContent(draft.document, published);
    }
  }
  return !sameDocumentContent(input.draftLegacy, input.publishedLegacy);
}
