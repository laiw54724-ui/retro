import { z } from "zod";
import {
  AboutFieldSchema,
  DocumentBlockSchema,
  GalleryImageSchema,
  IgCommentSchema,
  IgExtraImageSchema,
  IgHighlightSchema,
  IgPostSchema,
  ImageCropSchema,
  InstagramProfileSchema,
  LinkItemSchema,
  SiteDocumentSchema,
  SafeUrlSchema,
  ImageUrlSchema,
  SocialLinkSchema,
  ThemeSchema,
  WindowAppearanceSchema,
  WindowLayoutSchema,
  type DesktopWindow,
  type SiteDocument,
} from "./site";

const BoundedId = z.string().trim().min(1).max(160);
/** Canonical OC handles are URL-safe, lower-case labels. Display names remain unrestricted. */
export const ProfileHandleSchema = z.string().trim().toLowerCase().min(1, "Handle is required").max(64, "Handle must be 64 characters or fewer").regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, or hyphens");
export type ProfileHandle = z.infer<typeof ProfileHandleSchema>;
export const ProfileCustomFieldSchema = z.object({ key: z.string().trim().min(1).max(80), value: z.string().max(500) }).strict();
export const ProfileThemeOverrideSchema = z.object({ accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), background: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict();
export const EntityKindSchema = z.enum(["window", "profile", "post"]);
export type EntityKind = z.infer<typeof EntityKindSchema>;
export const VisibilitySchema = z.enum(["published", "draft"]);
export type Visibility = z.infer<typeof VisibilitySchema>;
export const EntityRefSchema = z.object({ siteId: BoundedId, id: BoundedId, kind: EntityKindSchema }).strict();
export type EntityRef = z.infer<typeof EntityRefSchema>;

const StrictDocumentBlockSchema = z.discriminatedUnion("kind", [
  z.object({ id: BoundedId, kind: z.literal("heading"), text: z.string().max(500) }).strict(),
  z.object({ id: BoundedId, kind: z.literal("text"), text: z.string().max(10_000), align: z.enum(["left", "center", "right"]).default("left"), bold: z.boolean().default(false), italic: z.boolean().default(false) }).strict(),
  z.object({ id: BoundedId, kind: z.literal("image"), src: ImageUrlSchema.nullable(), srcUrl: z.string().max(2048).default(""), alt: z.string().max(300).default("") }).strict(),
  z.object({ id: BoundedId, kind: z.literal("button"), text: z.string().max(200), url: SafeUrlSchema }).strict(),
  z.object({ id: BoundedId, kind: z.literal("link"), text: z.string().max(500), url: SafeUrlSchema }).strict(),
  z.object({ id: BoundedId, kind: z.literal("list"), text: z.string().max(10_000) }).strict(),
  z.object({ id: BoundedId, kind: z.literal("divider") }).strict(),
]);
const StrictGalleryImageSchema = z.object({ ...GalleryImageSchema.shape, id: BoundedId }).strict();
const StrictLinkItemSchema = z.object({ ...LinkItemSchema.shape, id: BoundedId }).strict();
const StrictAboutFieldSchema = z.object({ ...AboutFieldSchema.shape, id: BoundedId }).strict();
const StrictSocialLinkSchema = z.object({ ...SocialLinkSchema.shape, id: BoundedId }).strict();
const StrictCommentSchema = z.object({ ...IgCommentSchema.shape, id: BoundedId }).strict();
const StrictExtraImageSchema = z.object({ ...IgExtraImageSchema.shape, id: BoundedId }).strict();
const StrictHighlightSchema = z.object({ ...IgHighlightSchema.shape, id: BoundedId }).strict();
const StrictImageCropSchema = z.object(ImageCropSchema.shape).strict();
const StrictDesktopLayoutSchema = z.object(WindowLayoutSchema.shape.desktop.shape).strict();
const StrictMobileLayoutSchema = z.object(WindowLayoutSchema.shape.mobile.shape).strict();
const StrictWindowLayoutSchema = z.object({ desktop: StrictDesktopLayoutSchema, mobile: StrictMobileLayoutSchema }).strict();
const StrictAppearanceSchema = z.object(WindowAppearanceSchema.shape).strict();
const StrictThemeSchema = z.object(ThemeSchema.shape).strict();
const { highlights: _legacyHighlights, ...ProfileFields } = InstagramProfileSchema.shape;
const { id: _legacyPostId, comments: _legacyComments, extra: _legacyExtra, ...PostFields } = IgPostSchema.shape;
const StrictProfileFields = { ...ProfileFields, avatarCrop: StrictImageCropSchema.optional(), highlights: z.array(StrictHighlightSchema).max(20).default([]) };
const ProfileAuthoringFields = {
  handle: ProfileHandleSchema.optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  pronouns: z.string().max(120).default(""),
  customFields: z.array(ProfileCustomFieldSchema).max(50).default([]),
  worldTags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  themeOverride: ProfileThemeOverrideSchema.optional(),
  legacyUsernameLabel: z.string().max(64).optional(),
  legacyFollowersLabel: z.string().max(32).optional(),
  legacyFollowingLabel: z.string().max(32).optional()
};
const StrictPostFields = { ...PostFields, comments: z.array(StrictCommentSchema).max(200).default([]), extra: z.array(StrictExtraImageSchema).max(9).default([]) };
export const ProfileEntityV2Schema = z.object({
  kind: z.literal("profile"), id: BoundedId, siteId: BoundedId, visibility: VisibilitySchema, ...StrictProfileFields, ...ProfileAuthoringFields
}).strict();
export const PostEntityV2Schema = z.object({
  kind: z.literal("post"), id: BoundedId, siteId: BoundedId, visibility: VisibilitySchema, authorProfileId: BoundedId, ...StrictPostFields
}).strict();
export type ProfileEntityV2 = z.infer<typeof ProfileEntityV2Schema>;
export type PostEntityV2 = z.infer<typeof PostEntityV2Schema>;

const BaseV2Window = z.object({
  id: BoundedId, title: z.string().min(1).max(160), icon: z.string().min(1).max(500), layout: StrictWindowLayoutSchema,
  defaultOpen: z.boolean(), appearance: StrictAppearanceSchema.optional()
}).strict();
const NonInstagramWindowV2Schema = z.discriminatedUnion("type", [
  BaseV2Window.extend({ type: z.literal("document"), content: z.object({ blocks: z.array(StrictDocumentBlockSchema).max(100) }).strict() }),
  BaseV2Window.extend({ type: z.literal("gallery"), content: z.object({ columns: z.number().int().min(1).max(5), images: z.array(StrictGalleryImageSchema).max(200) }).strict() }),
  BaseV2Window.extend({ type: z.literal("links"), content: z.object({ links: z.array(StrictLinkItemSchema).max(100) }).strict() }),
  BaseV2Window.extend({ type: z.literal("about"), content: z.object({
    avatar: ImageUrlSchema.nullable(), avatarCrop: StrictImageCropSchema.optional(), nickname: z.string().max(160), bio: z.string().max(5000),
    banner: z.string().max(500).default(""), quote: z.string().max(500).default(""), detailsTitle: z.string().max(100).default("File Details"),
    avatarUrl: z.string().max(2048).default(""), fields: z.array(StrictAboutFieldSchema).max(50), socials: z.array(StrictSocialLinkSchema).max(50)
  }).strict() })
]);
export const DesktopWindowV2Schema = z.union([
  NonInstagramWindowV2Schema,
  BaseV2Window.extend({ type: z.literal("instagram"), content: z.object({ skin: z.enum(["win98", "modern"]), profileRef: EntityRefSchema.extend({ kind: z.literal("profile") }) }).strict() })
]);
export type DesktopWindowV2 = z.infer<typeof DesktopWindowV2Schema>;

export const SiteDocumentV2Schema = z.object({
  schemaVersion: z.literal(2), siteName: z.string().min(1).max(120), theme: StrictThemeSchema,
  windows: z.array(DesktopWindowV2Schema).max(100), mobileColumns: z.number().int().min(3).max(4).default(4),
  entities: z.object({ profiles: z.array(ProfileEntityV2Schema).max(100), posts: z.array(PostEntityV2Schema).max(500) }).strict()
}).strict();
export type SiteDocumentV2 = z.infer<typeof SiteDocumentV2Schema>;
/** Raw v2 shape accepted by Zod; defaulted fields may be omitted intentionally. */
export type SiteDocumentV2Input = z.input<typeof SiteDocumentV2Schema>;
export type VersionedSiteDocument = SiteDocument | SiteDocumentV2;
export type VersionedSiteDocumentInput = SiteDocument | SiteDocumentV2Input;
export const VersionedSiteDocumentSchema = z.union([SiteDocumentSchema, SiteDocumentV2Schema]);
export type VersionedDocumentLoadResult =
  | { ok: true; version: 1; document: SiteDocument; migrated: false; diagnostics: [] }
  | { ok: true; version: 2; document: SiteDocumentV2Input; migrated: boolean; diagnostics: [] }
  | { ok: false; code: "invalid" | "unsupported_version"; diagnostics: Diagnostic[]; raw: unknown };

export type Diagnostic = { path: (string | number)[]; message: string; code: string };
type InvalidResult = { ok: false; code: "invalid"; raw: unknown; diagnostics: Diagnostic[] };
type UnsupportedResult = { ok: false; code: "unsupported_version"; raw: unknown; version: number };
export type ParseSiteDocumentResult =
  | { ok: true; version: 1; document: SiteDocument }
  | { ok: true; version: 2; document: SiteDocumentV2 }
  | InvalidResult | UnsupportedResult;
export type MigrateSiteDocumentResult =
  | { ok: true; version: 1; document: SiteDocument }
  | { ok: true; version: 2; document: SiteDocumentV2Input }
  | InvalidResult | UnsupportedResult;

/** One boundary for loading API documents. Editor callers opt into v1→v2 migration. */
export function loadVersionedSiteDocument(raw: unknown, options: { siteId?: string; migrateV1?: boolean } = {}): VersionedDocumentLoadResult {
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return parsed.code === "invalid"
    ? { ok: false, code: "invalid", diagnostics: parsed.diagnostics, raw }
    : { ok: false, code: "unsupported_version", diagnostics: [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }], raw };
  if (parsed.version === 1 && options.migrateV1) {
    if (!options.siteId) return { ok: false, code: "invalid", diagnostics: [{ path: ["siteId"], message: "siteId is required to migrate a v1 document", code: "required" }], raw };
    const migrated = migrateSiteDocumentV2(raw, { siteId: options.siteId });
    if (!migrated.ok) return migrated.code === "invalid"
      ? { ok: false, code: "invalid", diagnostics: migrated.diagnostics, raw }
      : { ok: false, code: "unsupported_version", diagnostics: [{ path: ["schemaVersion"], message: `Unsupported document version: ${migrated.version}`, code: "unsupported_version" }], raw };
    if (migrated.version === 2) return { ok: true, version: 2, document: migrated.document, migrated: true, diagnostics: [] };
  }
  return parsed.version === 1
    ? { ok: true, version: 1, document: parsed.document, migrated: false, diagnostics: [] }
    : { ok: true, version: 2, document: raw as SiteDocumentV2Input, migrated: false, diagnostics: [] };
}

/** Converts a validated v2 document only at legacy module/render boundaries. */
export function projectV2ToLegacyDocument(document: SiteDocumentV2Input): { ok: true; document: SiteDocument } | { ok: false; diagnostics: Diagnostic[] } {
  const profiles = new Map(document.entities.profiles.map((profile) => [profile.id, profile]));
  const windows = document.windows.map((window) => {
    if (window.type !== "instagram") return window;
    const profile = profiles.get(window.content.profileRef.id);
    if (!profile || profile.siteId !== window.content.profileRef.siteId) return null;
    const { kind: _kind, id: _id, siteId: _siteId, visibility: _visibility, handle: _handle, displayName: _displayName, pronouns: _pronouns, customFields: _customFields, worldTags: _worldTags, themeOverride: _themeOverride, legacyUsernameLabel: _legacyUsernameLabel, legacyFollowersLabel: _legacyFollowersLabel, legacyFollowingLabel: _legacyFollowingLabel, ...legacyProfile } = profile;
    const posts = document.entities.posts.filter((post) => post.siteId === profile.siteId && post.authorProfileId === profile.id).map(({ kind: _postKind, siteId: _postSiteId, visibility: _postVisibility, authorProfileId: _authorProfileId, ...post }) => post);
    return { ...window, content: { skin: window.content.skin, profile: { ...legacyProfile, username: profile.handle ?? profile.username, name: profile.displayName ?? profile.name }, images: posts } };
  });
  if (windows.some((window) => window === null)) return { ok: false, diagnostics: [{ path: ["windows"], message: "Instagram window references a missing profile", code: "missing_ref" }] };
  const parsed = SiteDocumentSchema.safeParse({ schemaVersion: 1, siteName: document.siteName, theme: document.theme, windows, mobileColumns: document.mobileColumns });
  return parsed.success ? { ok: true, document: parsed.data } : { ok: false, diagnostics: diagnosticsFrom(parsed.error) };
}

/** Applies legacy module edits back onto an existing v2 document without replacing entity IDs. */
export function mergeLegacyDocumentIntoV2(document: SiteDocumentV2Input, legacy: SiteDocument, options: { siteId: string }): SiteDocumentV2Input {
  const next = structuredClone(document);
  const siteId = options.siteId;
  const usedProfileIds = new Set(next.entities.profiles.map((profile) => profile.id));
  const profileEdits = new Set<string>();
  const postEdits = new Set<string>();
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const legacyProfileOf = (profile: ProfileEntityV2) => {
    const { kind: _kind, id: _id, siteId: _siteId, visibility: _visibility, handle: _handle, displayName: _displayName, pronouns: _pronouns, customFields: _customFields, worldTags: _worldTags, themeOverride: _themeOverride, legacyUsernameLabel: _legacyUsernameLabel, legacyFollowersLabel: _legacyFollowersLabel, legacyFollowingLabel: _legacyFollowingLabel, ...legacyProfile } = profile;
    return { ...legacyProfile, username: profile.handle ?? profile.username, name: profile.displayName ?? profile.name };
  };
  // Keep this local helper structurally typed so legacy module edits do not
  // need to know about v2-only authoring fields.
  const profileForLegacy = (legacyProfile: Record<string, unknown>, windowId: string): ProfileEntityV2 | null => {
    const normalized = normalizeProfileHandle(String(legacyProfile.username ?? ""));
    const existing = next.entities.profiles.find((profile) => profile.handle === normalized || profile.username === String(legacyProfile.username ?? ""));
    if (existing) return ProfileEntityV2Schema.safeParse(existing).data ?? null;
    const id = boundedGeneratedId(`profile:${windowId}`, usedProfileIds);
    const parsed = ProfileEntityV2Schema.safeParse({ kind: "profile", id, siteId, visibility: "published", ...legacyProfile, handle: normalized, displayName: String(legacyProfile.name ?? normalized), pronouns: "", customFields: [], worldTags: [], legacyUsernameLabel: String(legacyProfile.username ?? ""), legacyFollowersLabel: String(legacyProfile.followers ?? ""), legacyFollowingLabel: String(legacyProfile.following ?? "") });
    if (!parsed.success) return null;
    next.entities.profiles.push(parsed.data);
    return parsed.data;
  };
  for (const legacyWindow of legacy.windows) {
    const versionedWindow = next.windows.find((window) => window.id === legacyWindow.id);
    if (legacyWindow.type !== "instagram") {
      const index = next.windows.findIndex((window) => window.id === legacyWindow.id);
      if (index >= 0) next.windows[index] = legacyWindow as typeof next.windows[number];
      else next.windows.push(legacyWindow as typeof next.windows[number]);
      continue;
    }
    const profile = versionedWindow?.type === "instagram"
      ? (() => {
        const candidate = next.entities.profiles.find((item) => item.id === versionedWindow.content.profileRef.id && item.siteId === versionedWindow.content.profileRef.siteId);
        return candidate ? ProfileEntityV2Schema.safeParse(candidate).data ?? null : profileForLegacy(legacyWindow.content.profile as unknown as Record<string, unknown>, legacyWindow.id);
      })()
      : profileForLegacy(legacyWindow.content.profile as unknown as Record<string, unknown>, legacyWindow.id);
    if (!profile) continue;
    const profileIndex = next.entities.profiles.findIndex((candidate) => candidate.id === profile.id);
    const legacyProfile = legacyWindow.content.profile;
    const profileChanged = !same(legacyProfile, legacyProfileOf(profile));
    if (profileChanged && !profileEdits.has(profile.id)) {
      const patched = ProfileEntityV2Schema.safeParse({ ...profile, ...legacyProfile, handle: profile.handle ?? legacyProfile.username, displayName: String(legacyProfile.name ?? profile.displayName ?? profile.name) });
      if (patched.success) {
        next.entities.profiles[profileIndex] = patched.data;
        profileEdits.add(profile.id);
      }
    }
    const posts = legacyWindow.content.images;
    const existing = next.entities.posts.filter((post) => post.authorProfileId === profile.id);
    const baseline = existing.map(({ kind: _kind, siteId: _siteId, visibility: _visibility, authorProfileId: _authorProfileId, ...post }) => post);
    const postsChanged = !same(posts, baseline);
    if (postsChanged && !postEdits.has(profile.id)) {
      const existingIds = new Set(existing.map((post) => post.id));
      next.entities.posts = next.entities.posts.filter((post) => post.authorProfileId !== profile.id);
      next.entities.posts.push(...posts.map((post) => ({ kind: "post" as const, siteId: profile.siteId, visibility: "published" as const, authorProfileId: profile.id, ...post, id: existingIds.has(post.id) ? post.id : `post:${profile.id}:${post.id}` })));
      postEdits.add(profile.id);
    }
    if (!versionedWindow) {
      const index = next.windows.findIndex((window) => window.id === legacyWindow.id);
      const migratedWindow = { ...legacyWindow, content: { skin: legacyWindow.content.skin, profileRef: { siteId: profile.siteId, id: profile.id, kind: "profile" as const } } };
      if (index >= 0) next.windows[index] = migratedWindow as typeof next.windows[number];
      else next.windows.push(migratedWindow as typeof next.windows[number]);
    }
  }
  // Window deletion is authoritative for the window list, while profiles and
  // posts remain site-level entities so deleting one view cannot destroy a
  // profile still shared by another view.
  next.windows = next.windows.filter((window) => legacy.windows.some((candidate) => candidate.id === window.id));
  return next;
}

export function normalizeProfileHandle(value: string): string {
  return value.trim().toLowerCase();
}

export function profileHandleKey(value: string): string {
  return normalizeProfileHandle(value);
}

function legacyHandle(value: string, fallback: string): string {
  const normalized = normalizeProfileHandle(value).replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const candidate = normalized || `profile-${fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "oc"}`;
  const bounded = candidate.slice(0, 64).replace(/-+$/g, "");
  return ProfileHandleSchema.safeParse(bounded).success ? bounded : "oc";
}

function uniqueProfileHandle(base: string, used: Set<string>): string {
  const root = legacyHandle(base, "oc");
  let candidate = root;
  let suffix = 2;
  while (used.has(profileHandleKey(candidate))) {
    const tail = `-${suffix++}`;
    candidate = `${root.slice(0, Math.max(1, 64 - tail.length))}${tail}`;
  }
  used.add(profileHandleKey(candidate));
  return candidate;
}

function diagnosticsFrom(error: z.ZodError): Diagnostic[] {
  return error.issues.map((issue) => ({ path: issue.path.map((part) => typeof part === "symbol" ? String(part) : part), message: issue.message, code: issue.code }));
}
function invalid(raw: unknown, diagnostics: Diagnostic[]): InvalidResult { return { ok: false, code: "invalid", raw, diagnostics }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function semanticDiagnostics(document: SiteDocumentV2): Diagnostic[] {
  const out: Diagnostic[] = [], windowIds = new Set<string>(), profileIds = new Set<string>(), postIds = new Set<string>();
  const scopeSites = new Set<string>([...document.entities.profiles, ...document.entities.posts].map((e) => e.siteId));
  for (const window of document.windows) if (window.type === "instagram") scopeSites.add(window.content.profileRef.siteId);
  const mixedSiteScope = scopeSites.size > 1;
  if (mixedSiteScope) out.push({ path: ["entities"], message: "Mixed site scope", code: "cross_site" });
  for (const [i, window] of document.windows.entries()) {
    if (windowIds.has(window.id)) out.push({ path: ["windows", i, "id"], message: "Duplicate window id", code: "duplicate_id" });
    windowIds.add(window.id);
    if (window.type === "instagram") {
      const ref = window.content.profileRef;
      if (!document.entities.profiles.some((p) => p.id === ref.id && p.siteId === ref.siteId)) out.push({ path: ["windows", i, "content", "profileRef"], message: "Missing profile", code: "missing_ref" });
    }
  }
  const handles = new Map<string, number>();
  for (const [i, profile] of document.entities.profiles.entries()) {
    if (profileIds.has(profile.id)) out.push({ path: ["entities", "profiles", i, "id"], message: "Duplicate entity id", code: "duplicate_id" }); profileIds.add(profile.id);
    if (profile.handle !== undefined) {
      const parsedHandle = ProfileHandleSchema.safeParse(profile.handle);
      if (!parsedHandle.success) out.push(...diagnosticsFrom(parsedHandle.error).map((issue) => ({ ...issue, path: ["entities", "profiles", i, "handle", ...issue.path] })));
      const key = profileHandleKey(profile.handle);
      if (handles.has(key)) out.push({ path: ["entities", "profiles", i, "handle"], message: "Duplicate profile handle", code: "duplicate_handle" });
      handles.set(key, i);
    }
  }
  for (const [i, post] of document.entities.posts.entries()) {
    if (postIds.has(post.id)) out.push({ path: ["entities", "posts", i, "id"], message: "Duplicate entity id", code: "duplicate_id" }); postIds.add(post.id);
    if (!document.entities.profiles.some((p) => p.id === post.authorProfileId && p.siteId === post.siteId)) out.push({ path: ["entities", "posts", i, "authorProfileId"], message: mixedSiteScope ? "Cross-site author profile" : "Missing author profile", code: mixedSiteScope ? "cross_site" : "missing_ref" });
  }
  return out;
}

export function parseSiteDocument(raw: unknown): ParseSiteDocumentResult {
  if (!isRecord(raw) || typeof raw.schemaVersion !== "number" || !Number.isInteger(raw.schemaVersion)) return invalid(raw, [{ path: ["schemaVersion"], message: "schemaVersion must be an integer", code: "invalid_type" }]);
  const version = raw.schemaVersion;
  if (version !== 1 && version !== 2) return { ok: false, code: "unsupported_version", raw, version };
  if (version === 1) { const parsed = SiteDocumentSchema.safeParse(raw); return parsed.success ? { ok: true, version: 1, document: parsed.data } : invalid(raw, diagnosticsFrom(parsed.error)); }
  const parsed = SiteDocumentV2Schema.safeParse(raw);
  if (!parsed.success) return invalid(raw, diagnosticsFrom(parsed.error));
  const semantic = semanticDiagnostics(parsed.data);
  return semantic.length ? invalid(raw, semantic) : { ok: true, version: 2, document: parsed.data };
}

/** Validates that a document's entity/reference scope belongs to the requested site. */
export function validateSiteDocumentScope(raw: unknown, siteId: string): Diagnostic[] {
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return parsed.code === "invalid" ? parsed.diagnostics : [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }];
  if (parsed.version === 1) return [];
  const scope = documentSiteScope(parsed.document);
  return [...scope].filter((value) => value !== siteId).map((value) => ({ path: ["entities"], message: `Document scope ${value} does not match site ${siteId}`, code: "cross_site" }));
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(36).padStart(7, "0");
}
function boundedGeneratedId(base: string, used: Set<string>): string {
  const fit = (value: string) => value.length <= 160 ? value : `${value.slice(0, Math.max(1, 160 - 8))}:${stableHash(value)}`;
  let id = fit(base), n = 2;
  while (used.has(id)) { const suffix = `:${n++}`; id = fit(`${base.slice(0, Math.max(1, 160 - suffix.length))}${suffix}`); }
  used.add(id); return id;
}
export function migrateSiteDocumentV2(raw: unknown, options: { siteId: string }): MigrateSiteDocumentResult {
  if (!BoundedId.safeParse(options.siteId).success) return invalid(raw, [{ path: ["siteId"], message: "siteId must be a non-empty bounded string", code: "invalid" }]);
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return parsed;
  if (parsed.version === 2) {
    // Structural parsing may materialize Zod defaults. Migration of an already
    // v2 document is intentionally a validation-only operation: preserve the
    // caller's exact object and identity after validation succeeds.
    return { ok: true, version: 2, document: raw as SiteDocumentV2Input };
  }
  const source = parsed.document, profiles: ProfileEntityV2[] = [], posts: PostEntityV2[] = [], profileIds = new Set<string>(), postIds = new Set<string>(), windowIds = new Set<string>(), profileHandles = new Set<string>();
  if (new Set(source.windows.map((w) => w.id)).size !== source.windows.length) return invalid(raw, [{ path: ["windows"], message: "Duplicate window id", code: "duplicate_id" }]);
  const windowIdMap = new Map<string, string>();
  for (const window of source.windows) windowIdMap.set(window.id, boundedGeneratedId(window.id, windowIds));
  // Legacy documents are compared using the canonical handle policy during
  // migration, while an already-valid v2 raw document keeps validation-only
  // identity semantics above. Validate every converted window without letting
  // an adversarial but v1-valid nested identifier throw from `.parse()`.
  const windows: DesktopWindowV2[] = [];
  for (const window of source.windows) {
    const windowId = windowIdMap.get(window.id)!;
    if (window.type !== "instagram") {
      const normalized = window.type === "links"
        ? { ...window, id: windowId, content: { ...window.content, links: window.content.links.map((link) => ({ ...link, windowId: link.windowId ? (windowIdMap.get(link.windowId) ?? link.windowId) : "" })) } }
        : { ...window, id: windowId };
      const parsedWindow = DesktopWindowV2Schema.safeParse(normalized);
      if (!parsedWindow.success) return invalid(raw, diagnosticsFrom(parsedWindow.error));
      windows.push(parsedWindow.data);
      continue;
    }
    const profileId = boundedGeneratedId(`profile:${windowId}`, profileIds);
    const legacy = window.content.profile;
    const handle = uniqueProfileHandle(legacy.username, profileHandles);
    profiles.push({ kind: "profile", id: profileId, siteId: options.siteId, visibility: "published", ...legacy, handle, displayName: legacy.name || handle, pronouns: "", customFields: [], worldTags: [], legacyUsernameLabel: legacy.username, legacyFollowersLabel: legacy.followers, legacyFollowingLabel: legacy.following });
    for (const post of window.content.images) {
      const postId = boundedGeneratedId(`post:${windowId}:${post.id}`, postIds);
      posts.push({ kind: "post", siteId: options.siteId, visibility: "published", authorProfileId: profileId, ...post, id: postId });
    }
    const migratedWindow = DesktopWindowV2Schema.safeParse({ ...window, id: windowId, content: { skin: window.content.skin, profileRef: { siteId: options.siteId, id: profileId, kind: "profile" } } });
    if (!migratedWindow.success) return invalid(raw, diagnosticsFrom(migratedWindow.error));
    windows.push(migratedWindow.data);
  }
  const migrated: SiteDocumentV2 = { schemaVersion: 2, siteName: source.siteName, theme: source.theme, windows, mobileColumns: source.mobileColumns, entities: { profiles, posts } };
  const validated = parseSiteDocument(migrated);
  if (validated.ok && validated.version === 2) return validated;
  if (!validated.ok && validated.code === "invalid") return invalid(raw, validated.diagnostics);
  return invalid(raw, [{ path: [], message: "Unexpected migration version", code: "invalid" }]);
}

export type ResolveResult<T> = { ok: true; value: T } | { ok: false; reason: "cross_site" | "missing" };
export function resolveEntityRef(document: SiteDocumentV2Input, ref: EntityRef, currentSiteId: string): ResolveResult<SiteDocumentV2Input["entities"]["profiles"][number] | SiteDocumentV2Input["entities"]["posts"][number] | SiteDocumentV2Input["windows"][number]> {
  if (ref.siteId !== currentSiteId) return { ok: false, reason: "cross_site" };
  const value = ref.kind === "profile" ? document.entities.profiles.find((entity) => entity.id === ref.id && entity.siteId === currentSiteId) : ref.kind === "post" ? document.entities.posts.find((entity) => entity.id === ref.id && entity.siteId === currentSiteId) : document.windows.find((window) => window.id === ref.id);
  return value ? { ok: true, value } : { ok: false, reason: "missing" };
}
export type EntityReferrer = { kind: "window"; windowId: string } | { kind: "post"; postId: string; field: "authorProfileId" };
export function collectEntityReferrers(document: SiteDocumentV2Input, ref: EntityRef, currentSiteId: string): EntityReferrer[] {
  if (ref.siteId !== currentSiteId || ref.kind !== "profile") return [];
  const out: EntityReferrer[] = [];
  for (const window of document.windows) if (window.type === "instagram" && window.content.profileRef.siteId === ref.siteId && window.content.profileRef.id === ref.id) out.push({ kind: "window", windowId: window.id });
  for (const post of document.entities.posts) if (post.siteId === currentSiteId && post.authorProfileId === ref.id) out.push({ kind: "post", postId: post.id, field: "authorProfileId" });
  return out;
}

export type ProfileDiagnostic = Diagnostic;
export type ProfileOperationResult =
  | { ok: true; document: SiteDocumentV2Input; profile: ProfileEntityV2 }
  | { ok: false; code: "invalid"; diagnostics: ProfileDiagnostic[] };
export type ProfileReferenceReport = {
  profileId: string;
  referrers: EntityReferrer[];
  postIds: string[];
  windowIds: string[];
};

function profileError(path: (string | number)[], message: string, code: string): ProfileOperationResult & { ok: false } {
  return { ok: false, code: "invalid", diagnostics: [{ path, message, code }] };
}

function validDocument(document: SiteDocumentV2Input): ProfileDiagnostic[] {
  const parsed = parseSiteDocument(document);
  if (parsed.ok && parsed.version === 2) return [];
  if (parsed.ok) return [{ path: ["schemaVersion"], message: "Profile operations require a v2 document", code: "unsupported_version" }];
  return parsed.code === "invalid" ? parsed.diagnostics : [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }];
}

function validatedOutput(document: SiteDocumentV2Input): ProfileDiagnostic[] {
  return validDocument(document);
}

function documentSiteScope(document: SiteDocumentV2Input): Set<string> {
  const sites = new Set<string>([...document.entities.profiles, ...document.entities.posts].map((entity) => entity.siteId));
  for (const window of document.windows) if (window.type === "instagram") sites.add(window.content.profileRef.siteId);
  return sites;
}

function profileInput(input: Record<string, unknown>, siteId: string, id: string, visibility: Visibility = "draft"): ProfileEntityV2 | ProfileDiagnostic[] {
  const candidate = {
    ...input,
    kind: "profile", id, siteId, visibility,
    username: typeof input.username === "string" ? input.username : String(input.handle ?? ""),
    avatar: input.avatar ?? null,
    name: typeof input.name === "string" ? input.name : String(input.displayName ?? ""),
    alt: typeof input.alt === "string" ? input.alt : "",
    bio: typeof input.bio === "string" ? input.bio : "",
    followers: typeof input.followers === "string" ? input.followers : "0",
    following: typeof input.following === "string" ? input.following : "0",
    followedBy: typeof input.followedBy === "string" ? input.followedBy : "",
    handle: input.handle,
    displayName: input.displayName ?? input.name ?? input.handle,
  };
  const parsed = ProfileEntityV2Schema.safeParse(candidate);
  return parsed.success ? parsed.data : diagnosticsFrom(parsed.error);
}

function profileHandleDiagnostics(document: SiteDocumentV2Input, handle: unknown, excludeId?: string): ProfileDiagnostic[] {
  const parsed = ProfileHandleSchema.safeParse(handle);
  if (!parsed.success) return diagnosticsFrom(parsed.error).map((diagnostic) => ({ ...diagnostic, path: ["handle", ...diagnostic.path] }));
  const duplicate = document.entities.profiles.find((profile) => profile.id !== excludeId && profile.handle !== undefined && profileHandleKey(profile.handle) === profileHandleKey(parsed.data));
  return duplicate ? [{ path: ["handle"], message: "Duplicate profile handle", code: "duplicate_handle" }] : [];
}

export function inspectProfileReferences(document: SiteDocumentV2Input, profileId: string, siteId: string): ProfileReferenceReport {
  const ref = { siteId, id: profileId, kind: "profile" as const };
  const referrers = collectEntityReferrers(document, ref, siteId);
  return { profileId, referrers, postIds: referrers.filter((item) => item.kind === "post").map((item) => item.postId), windowIds: referrers.filter((item) => item.kind === "window").map((item) => item.windowId) };
}

export function createProfile(document: SiteDocumentV2Input, input: Record<string, unknown>, options: { siteId: string; id?: string } ): ProfileOperationResult {
  const diagnostics = validDocument(document);
  if (diagnostics.length) return { ok: false, code: "invalid", diagnostics };
  const scope = documentSiteScope(document);
  if (scope.size > 0 && !scope.has(options.siteId)) return profileError(["siteId"], "Profile site does not match document scope", "cross_site");
  const id = options.id ?? `profile:${crypto.randomUUID()}`;
  if (document.entities.profiles.some((profile) => profile.id === id)) return profileError(["entities", "profiles"], "Profile id already exists", "duplicate_id");
  const handleDiagnostics = profileHandleDiagnostics(document, input.handle);
  if (handleDiagnostics.length) return { ok: false, code: "invalid", diagnostics: handleDiagnostics };
  const profile = profileInput(input, options.siteId, id);
  if (Array.isArray(profile)) return { ok: false, code: "invalid", diagnostics: profile };
  const next = structuredClone(document);
  next.entities.profiles = [...next.entities.profiles, profile];
  const outputDiagnostics = validatedOutput(next);
  if (outputDiagnostics.length) return { ok: false, code: "invalid", diagnostics: outputDiagnostics };
  return { ok: true, document: next, profile: structuredClone(profile) };
}

export function updateProfile(document: SiteDocumentV2Input, profileId: string, patch: Record<string, unknown>, options: { siteId: string }): ProfileOperationResult {
  const diagnostics = validDocument(document);
  if (diagnostics.length) return { ok: false, code: "invalid", diagnostics };
  const index = document.entities.profiles.findIndex((profile) => profile.id === profileId && profile.siteId === options.siteId);
  if (index < 0) return profileError(["entities", "profiles"], "Profile not found", "missing");
  const handleDiagnostics = patch.handle === undefined ? [] : profileHandleDiagnostics(document, patch.handle, profileId);
  if (handleDiagnostics.length) return { ok: false, code: "invalid", diagnostics: handleDiagnostics };
  const candidate = { ...document.entities.profiles[index], ...patch, id: profileId, siteId: options.siteId, kind: "profile" };
  const parsed = ProfileEntityV2Schema.safeParse(candidate);
  if (!parsed.success) return { ok: false, code: "invalid", diagnostics: diagnosticsFrom(parsed.error) };
  const next = structuredClone(document); next.entities.profiles[index] = parsed.data;
  const outputDiagnostics = validatedOutput(next);
  if (outputDiagnostics.length) return { ok: false, code: "invalid", diagnostics: outputDiagnostics };
  return { ok: true, document: next, profile: structuredClone(parsed.data) };
}

export function duplicateProfile(document: SiteDocumentV2Input, profileId: string, options: { siteId: string; id?: string; handle?: string }): ProfileOperationResult {
  const diagnostics = validDocument(document);
  if (diagnostics.length) return { ok: false, code: "invalid", diagnostics };
  const source = document.entities.profiles.find((profile) => profile.id === profileId && profile.siteId === options.siteId);
  if (!source) return profileError(["entities", "profiles"], "Profile not found", "missing");
  const handle = options.handle ?? `${source.handle ?? source.username}-copy`;
  return createProfile(document, { ...structuredClone(source), id: undefined, handle, displayName: source.displayName ?? source.name, legacyUsernameLabel: undefined, legacyFollowersLabel: undefined, legacyFollowingLabel: undefined }, { siteId: options.siteId, id: options.id });
}

export function deleteOrRetargetProfile(document: SiteDocumentV2Input, profileId: string, options: { siteId: string; retargetProfileId?: string }): ProfileOperationResult {
  const diagnostics = validDocument(document);
  if (diagnostics.length) return { ok: false, code: "invalid", diagnostics };
  const source = document.entities.profiles.find((profile) => profile.id === profileId && profile.siteId === options.siteId);
  if (!source) return profileError(["entities", "profiles"], "Profile not found", "missing");
  const report = inspectProfileReferences(document, profileId, options.siteId);
  if (report.referrers.length && !options.retargetProfileId) return profileError(["entities", "profiles", profileId], "Profile is still referenced", "delete_blocked");
  if (options.retargetProfileId) {
    if (options.retargetProfileId === profileId || !document.entities.profiles.some((profile) => profile.id === options.retargetProfileId && profile.siteId === options.siteId)) return profileError(["retargetProfileId"], "Retarget profile not found", "missing");
  }
  const next = structuredClone(document);
  if (options.retargetProfileId) {
    next.windows = next.windows.map((window) => window.type === "instagram" && window.content.profileRef.id === profileId ? { ...window, content: { ...window.content, profileRef: { ...window.content.profileRef, id: options.retargetProfileId! } } } : window);
    next.entities.posts = next.entities.posts.map((post) => post.authorProfileId === profileId ? { ...post, authorProfileId: options.retargetProfileId! } : post);
  }
  next.entities.profiles = next.entities.profiles.filter((profile) => profile.id !== profileId);
  const outputDiagnostics = validatedOutput(next);
  if (outputDiagnostics.length) return { ok: false, code: "invalid", diagnostics: outputDiagnostics };
  return { ok: true, document: next, profile: structuredClone(ProfileEntityV2Schema.parse(source)) };
}

export const createProfileEntity = createProfile;
export const updateProfileEntity = updateProfile;
export const duplicateProfileEntity = duplicateProfile;
