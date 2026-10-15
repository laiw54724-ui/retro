import {
  parseSiteDocument,
  type SiteDocumentV2,
  type VersionedSiteDocument
} from "./site-versioning";

export type ProjectionDiagnostic = { path: (string | number)[]; message: string; code: string };
export type PublicProjectionResult =
  | { ok: true; version: 1 | 2; document: VersionedSiteDocument }
  | { ok: false; code: "invalid"; diagnostics: ProjectionDiagnostic[] }
  | { ok: false; code: "unsupported_version"; version: number };

/**
 * Builds the only document shape that may be published. This boundary is
 * deliberately pure: callers can safely pass the draft object and retain it
 * for editing or retrying a publication.
 */
export function projectPublicSiteDocument(raw: unknown, currentSiteId: string): PublicProjectionResult {
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) {
    return parsed.code === "invalid"
      ? { ok: false, code: "invalid", diagnostics: parsed.diagnostics }
      : parsed;
  }
  if (parsed.version === 1) return { ok: true, version: 1, document: parsed.document };

  const document = projectV2(parsed.document, currentSiteId);
  const validated = parseSiteDocument(document);
  if (!validated.ok) {
    return validated.code === "invalid"
      ? { ok: false, code: "invalid", diagnostics: validated.diagnostics }
      : validated;
  }
  return { ok: true, version: 2, document: validated.document };
}

function projectV2(document: SiteDocumentV2, currentSiteId: string): SiteDocumentV2 {
  const profiles = document.entities.profiles.filter((profile) => profile.siteId === currentSiteId && profile.visibility === "published");
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const posts = document.entities.posts.filter((post) => post.siteId === currentSiteId && post.visibility === "published" && profileIds.has(post.authorProfileId));
  const retainedWindows = document.windows
    .filter((window) => window.type !== "instagram" || (window.content.profileRef.siteId === currentSiteId && profileIds.has(window.content.profileRef.id)));
  const retainedWindowIds = new Set(retainedWindows.map((window) => window.id));
  const windows = retainedWindows
    .map((window) => {
      if (window.type !== "links") return window;
      return {
        ...window,
        content: {
          ...window.content,
          links: window.content.links.filter((link) => !(link.target === "window" && link.windowId && !retainedWindowIds.has(link.windowId)))
        }
      };
    });
  return { ...document, windows, entities: { profiles, posts } };
}
