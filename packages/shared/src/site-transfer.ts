import { z } from "zod";
import { migrateSiteDocumentV2, parseSiteDocument, validateSiteDocumentScope, type VersionedSiteDocument } from "./site-versioning";
import { projectPublicSiteDocument } from "./public-projection";

export const EXPORT_SITE_ID = "export:site";
export const RETRO_EXPORT_FORMAT = "retrodesk-export";
export const RETRO_EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const MediaItemSchema = z.object({
  id: z.string().min(1).max(180),
  documentPath: z.string().min(1).max(1000).startsWith("/").refine((value) => !value.split("/").includes(".."), "Path traversal is not allowed"),
  source: z.string().min(1).max(2048),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  mimeType: z.string().max(120).nullable(),
  rightsNote: z.string().max(1000),
  disposition: z.enum(["external-reference", "private-asset-reference"]),
  included: z.literal(false),
}).strict();
const MissingMediaSchema = z.object({ documentPath: z.string().min(1).max(1000), reason: z.string().min(1).max(300) }).strict();
export const RetroExportPackageSchema = z.object({
  format: z.literal(RETRO_EXPORT_FORMAT),
  formatVersion: z.literal(RETRO_EXPORT_VERSION),
  scope: z.enum(["public", "owner-backup"]),
  exportedAt: z.string().datetime(),
  sourceSite: z.object({ username: z.string().min(1).max(20), siteName: z.string().min(1).max(120) }).strict(),
  document: z.unknown(),
  mediaManifest: z.object({ version: z.literal(1), items: z.array(MediaItemSchema).max(2000), missing: z.array(MissingMediaSchema).max(2000) }).strict(),
  rightsNotice: z.string().min(1).max(2000),
}).strict();
export type RetroExportPackage = z.infer<typeof RetroExportPackageSchema> & { document: VersionedSiteDocument };
export type TransferDiagnostic = { path: string; message: string };
export type ImportPreview = {
  siteName: string;
  sourceUsername: string;
  scope: "public" | "owner-backup";
  schemaVersion: 1 | 2;
  windowCount: number;
  profileCount: number;
  postCount: number;
  mediaCount: number;
  missingMedia: Array<{ documentPath: string; reason: string }>;
};

const rawAuthoringKeys = new Set(["srcUrl", "avatarUrl", "coverUrl", "coverSrcUrl", "imageUrl", "iconUrl"]);
const mediaKeys = new Set(["src", "avatar", "cover", "coverSrc", "image", "wallImage", "asset"]);
const sensitiveQueryKeys = /^(?:token|access_token|auth|authorization|signature|sig|expires|policy|key-pair-id|x-amz-.+|x-goog-.+)$/i;
const tokenShape = /(?:\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsb_secret_[A-Za-z0-9_-]{20,}\b)/;
const pointer = (segments: Array<string | number>) => `/${segments.map((part) => String(part).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;

function cloneWithoutRawAuthoringUrls<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneWithoutRawAuthoringUrls(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rawAuthoringKeys.has(key) && typeof item === "string" ? "" : cloneWithoutRawAuthoringUrls(item)])) as T;
}

function sensitiveStrings(value: unknown, segments: Array<string | number> = [], result: TransferDiagnostic[] = []): TransferDiagnostic[] {
  if (typeof value === "string") {
    if (tokenShape.test(value)) result.push({ path: pointer(segments), message: "Token-shaped content cannot be exported" });
    try {
      const url = new URL(value);
      if ([...url.searchParams.keys()].some((key) => sensitiveQueryKeys.test(key))) result.push({ path: pointer(segments), message: "Signed or credential-bearing URL cannot be exported" });
    } catch { /* Non-URL authored text. */ }
    return result;
  }
  if (Array.isArray(value)) value.forEach((item, index) => sensitiveStrings(item, [...segments, index], result));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => sensitiveStrings(item, [...segments, key], result));
  return result;
}

function inferMime(source: string) {
  try {
    const extension = new URL(source).pathname.split(".").pop()?.toLowerCase();
    return extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : extension === "gif" ? "image/gif" : extension === "mp3" ? "audio/mpeg" : extension === "ogg" ? "audio/ogg" : extension === "wav" ? "audio/wav" : null;
  } catch { return null; }
}

function collectMedia(value: unknown) {
  const items: z.infer<typeof MediaItemSchema>[] = [];
  const missing: z.infer<typeof MissingMediaSchema>[] = [];
  const walk = (current: unknown, segments: Array<string | number>, inheritedRights = "") => {
    if (Array.isArray(current)) { current.forEach((item, index) => walk(item, [...segments, index], inheritedRights)); return; }
    if (!current || typeof current !== "object") return;
    const record = current as Record<string, unknown>;
    const rights = typeof record.rightsNote === "string" && record.rightsNote.trim() ? record.rightsNote.trim() : inheritedRights;
    for (const [key, item] of Object.entries(record)) {
      const path = [...segments, key];
      if (mediaKeys.has(key) && typeof item === "string" && (/^https?:\/\//i.test(item) || /^retro-asset:/i.test(item))) {
        const privateReference = item.startsWith("retro-asset:");
        items.push({ id: `media:${items.length + 1}`, documentPath: pointer(path), source: item, sha256: null, mimeType: privateReference ? null : inferMime(item), rightsNote: rights || "User-supplied media; verify redistribution rights before sharing.", disposition: privateReference ? "private-asset-reference" : "external-reference", included: false });
        if (privateReference) missing.push({ documentPath: pointer(path), reason: "Private asset bytes are not included in JSON export v1; re-upload after import." });
      }
      walk(item, path, rights);
    }
  };
  walk(value, []);
  return { items, missing };
}

export function remapDocumentSiteId<T>(document: T, fromSiteId: string, toSiteId: string): T {
  if (Array.isArray(document)) return document.map((item) => remapDocumentSiteId(item, fromSiteId, toSiteId)) as T;
  if (!document || typeof document !== "object") return document;
  return Object.fromEntries(Object.entries(document).map(([key, value]) => [key, key === "siteId" && value === fromSiteId ? toSiteId : remapDocumentSiteId(value, fromSiteId, toSiteId)])) as T;
}

export function createRetroExport(input: { scope: "public" | "owner-backup"; siteId: string; username: string; siteName: string; document: unknown; exportedAt?: string }): { ok: true; value: RetroExportPackage } | { ok: false; code: "invalid_document" | "sensitive_content"; diagnostics: TransferDiagnostic[] } {
  const projected = input.scope === "public" ? projectPublicSiteDocument(input.document, input.siteId) : parseSiteDocument(input.document);
  if (!projected.ok) return { ok: false, code: "invalid_document", diagnostics: [{ path: "/document", message: "Document is invalid or unsupported" }] };
  const stripped = cloneWithoutRawAuthoringUrls(projected.document);
  const diagnostics = sensitiveStrings(stripped);
  if (diagnostics.length) return { ok: false, code: "sensitive_content", diagnostics };
  const exportedDocument = remapDocumentSiteId(stripped, input.siteId, EXPORT_SITE_ID);
  const scopeDiagnostics = validateSiteDocumentScope(exportedDocument, EXPORT_SITE_ID);
  if (scopeDiagnostics.length) return { ok: false, code: "invalid_document", diagnostics: scopeDiagnostics.map((item) => ({ path: pointer(item.path), message: item.message })) };
  const mediaManifest = collectMedia(exportedDocument);
  const value = {
    format: RETRO_EXPORT_FORMAT,
    formatVersion: RETRO_EXPORT_VERSION,
    scope: input.scope,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    sourceSite: { username: input.username, siteName: input.siteName },
    document: exportedDocument,
    mediaManifest: { version: 1 as const, ...mediaManifest },
    rightsNotice: "This JSON contains site structure and external/private media references only. It does not grant redistribution rights or include media bytes.",
  };
  return { ok: true, value: value as RetroExportPackage };
}

export function inspectRetroImport(raw: unknown): { ok: true; value: RetroExportPackage; preview: ImportPreview } | { ok: false; code: "unsupported_format" | "invalid_package"; diagnostics: TransferDiagnostic[] } {
  const parsed = RetroExportPackageSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "unsupported_format", diagnostics: parsed.error.issues.slice(0, 20).map((item) => ({ path: pointer(item.path.map((part) => typeof part === "symbol" ? String(part) : part)), message: item.message })) };
  let document = parseSiteDocument(parsed.data.document);
  if (!document.ok) return { ok: false, code: "invalid_package", diagnostics: [{ path: "/document", message: "Exported document is invalid or unsupported" }] };
  // Older v1 exporters left one source-site scope on local Explorer/music refs.
  // Repair only a single coherent scope whose targets survive semantic migration.
  // Mixed scopes or dangling targets are rejected, never silently removed.
  if (document.version === 1) {
    const scopes = new Set<string>();
    for (const window of document.document.windows) {
      if (window.type === "explorer") for (const shortcut of window.content.shortcuts) scopes.add(shortcut.target.siteId);
      if (window.type === "music") for (const track of window.content.tracks) if (track.characterRef) scopes.add(track.characterRef.siteId);
    }
    const oldScope = [...scopes][0];
    if (scopes.size === 1 && oldScope !== EXPORT_SITE_ID) {
      const candidate = remapDocumentSiteId(document.document, oldScope, EXPORT_SITE_ID);
      const semantic = migrateSiteDocumentV2(candidate, { siteId: EXPORT_SITE_ID });
      if (!semantic.ok) return { ok: false, code: "invalid_package", diagnostics: [{ path: "/document/windows", message: "Legacy references cannot be safely remapped; repair the targets and export again." }] };
      document = { ...document, document: candidate };
    }
  }
  const scopeDiagnostics = validateSiteDocumentScope(document.document, EXPORT_SITE_ID);
  if (scopeDiagnostics.length) return { ok: false, code: "invalid_package", diagnostics: scopeDiagnostics.slice(0, 20).map((item) => ({ path: pointer(item.path), message: item.message })) };
  const value = { ...parsed.data, document: document.document } as RetroExportPackage;
  return {
    ok: true,
    value,
    preview: {
      siteName: parsed.data.sourceSite.siteName,
      sourceUsername: parsed.data.sourceSite.username,
      scope: parsed.data.scope,
      schemaVersion: document.version,
      windowCount: document.document.windows.length,
      profileCount: document.version === 2 ? document.document.entities.profiles.length : 0,
      postCount: document.version === 2 ? document.document.entities.posts.length : 0,
      mediaCount: parsed.data.mediaManifest.items.length,
      missingMedia: parsed.data.mediaManifest.missing,
    },
  };
}
