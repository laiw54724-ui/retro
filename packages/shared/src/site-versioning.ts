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
const StrictPostFields = { ...PostFields, comments: z.array(StrictCommentSchema).max(200).default([]), extra: z.array(StrictExtraImageSchema).max(9).default([]) };
export const ProfileEntityV2Schema = z.object({
  kind: z.literal("profile"), id: BoundedId, siteId: BoundedId, visibility: VisibilitySchema, ...StrictProfileFields
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
export const VersionedSiteDocumentSchema = z.union([SiteDocumentSchema, SiteDocumentV2Schema]);

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
  for (const [i, profile] of document.entities.profiles.entries()) { if (profileIds.has(profile.id)) out.push({ path: ["entities", "profiles", i, "id"], message: "Duplicate entity id", code: "duplicate_id" }); profileIds.add(profile.id); }
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
  const source = parsed.document, profiles: ProfileEntityV2[] = [], posts: PostEntityV2[] = [], profileIds = new Set<string>(), postIds = new Set<string>(), windowIds = new Set<string>();
  if (new Set(source.windows.map((w) => w.id)).size !== source.windows.length) return invalid(raw, [{ path: ["windows"], message: "Duplicate window id", code: "duplicate_id" }]);
  const windowIdMap = new Map<string, string>();
  for (const window of source.windows) windowIdMap.set(window.id, boundedGeneratedId(window.id, windowIds));
  const windows = source.windows.map((window): DesktopWindowV2 => {
    const windowId = windowIdMap.get(window.id)!;
    if (window.type !== "instagram") {
      const normalized = window.type === "links"
        ? { ...window, id: windowId, content: { ...window.content, links: window.content.links.map((link) => ({ ...link, windowId: link.windowId ? (windowIdMap.get(link.windowId) ?? link.windowId) : "" })) } }
        : { ...window, id: windowId };
      return DesktopWindowV2Schema.parse(normalized);
    }
    const profileId = boundedGeneratedId(`profile:${windowId}`, profileIds);
    profiles.push({ kind: "profile", id: profileId, siteId: options.siteId, visibility: "published", ...window.content.profile });
    for (const post of window.content.images) {
      const postId = boundedGeneratedId(`post:${windowId}:${post.id}`, postIds);
      posts.push({ kind: "post", siteId: options.siteId, visibility: "published", authorProfileId: profileId, ...post, id: postId });
    }
    return { ...window, id: windowId, content: { skin: window.content.skin, profileRef: { siteId: options.siteId, id: profileId, kind: "profile" } } };
  });
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
