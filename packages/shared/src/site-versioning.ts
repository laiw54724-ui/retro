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

const StrictDocumentBlockSchema = z.discriminatedUnion("kind", DocumentBlockSchema.options.map((option) => z.object(option.shape).strict()) as any);
const StrictGalleryImageSchema = z.object(GalleryImageSchema.shape).strict();
const StrictLinkItemSchema = z.object(LinkItemSchema.shape).strict();
const StrictAboutFieldSchema = z.object(AboutFieldSchema.shape).strict();
const StrictSocialLinkSchema = z.object(SocialLinkSchema.shape).strict();
const StrictCommentSchema = z.object(IgCommentSchema.shape).strict();
const StrictExtraImageSchema = z.object(IgExtraImageSchema.shape).strict();
const StrictHighlightSchema = z.object(IgHighlightSchema.shape).strict();
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
    avatar: z.union([z.string().max(2048).refine((value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }), z.null()]), avatarCrop: StrictImageCropSchema.optional(), nickname: z.string().max(160), bio: z.string().max(5000),
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
export type VersionedSiteDocument = SiteDocument | SiteDocumentV2;
export const VersionedSiteDocumentSchema = z.union([SiteDocumentSchema, SiteDocumentV2Schema]);

export type Diagnostic = { path: (string | number)[]; message: string; code: string };
type InvalidResult = { ok: false; code: "invalid"; raw: unknown; diagnostics: Diagnostic[] };
type UnsupportedResult = { ok: false; code: "unsupported_version"; raw: unknown; version: number };
export type ParseSiteDocumentResult =
  | { ok: true; version: 1; document: SiteDocument }
  | { ok: true; version: 2; document: SiteDocumentV2 }
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
  if (!isRecord(raw) || !Number.isInteger(raw.schemaVersion)) return invalid(raw, [{ path: ["schemaVersion"], message: "schemaVersion must be an integer", code: "invalid_type" }]);
  const version = raw.schemaVersion as number;
  if (version !== 1 && version !== 2) return { ok: false, code: "unsupported_version", raw, version };
  if (version === 1) { const parsed = SiteDocumentSchema.safeParse(raw); return parsed.success ? { ok: true, version: 1, document: parsed.data } : invalid(raw, diagnosticsFrom(parsed.error)); }
  const parsed = SiteDocumentV2Schema.safeParse(raw);
  if (!parsed.success) return invalid(raw, diagnosticsFrom(parsed.error));
  const semantic = semanticDiagnostics(parsed.data);
  return semantic.length ? invalid(raw, semantic) : { ok: true, version: 2, document: parsed.data };
}

function uniqueId(base: string, used: Set<string>): string { let id = base, n = 2; while (used.has(id)) id = `${base}:${n++}`; used.add(id); return id; }
export function migrateSiteDocumentV2(raw: unknown, options: { siteId: string }): ParseSiteDocumentResult {
  if (!BoundedId.safeParse(options.siteId).success) return invalid(raw, [{ path: ["siteId"], message: "siteId must be a non-empty bounded string", code: "invalid" }]);
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return parsed;
  if (parsed.version === 2) return parsed;
  const source = parsed.document, profiles: ProfileEntityV2[] = [], posts: PostEntityV2[] = [], profileIds = new Set<string>(), postIds = new Set<string>();
  if (new Set(source.windows.map((w) => w.id)).size !== source.windows.length) return invalid(raw, [{ path: ["windows"], message: "Duplicate window id", code: "duplicate_id" }]);
  const windows = source.windows.map((window): DesktopWindowV2 => {
    if (window.type !== "instagram") return window as DesktopWindowV2;
    const profileId = uniqueId(`profile:${window.id}`, profileIds);
    profiles.push({ kind: "profile", id: profileId, siteId: options.siteId, visibility: "published", ...window.content.profile });
    for (const post of window.content.images) {
      const postId = uniqueId(`post:${window.id}:${post.id}`, postIds);
      posts.push({ kind: "post", siteId: options.siteId, visibility: "published", authorProfileId: profileId, ...post, id: postId });
    }
    return { ...window, content: { skin: window.content.skin, profileRef: { siteId: options.siteId, id: profileId, kind: "profile" } } };
  });
  const migrated: SiteDocumentV2 = { schemaVersion: 2, siteName: source.siteName, theme: source.theme, windows, mobileColumns: source.mobileColumns, entities: { profiles, posts } };
  return { ok: true, version: 2, document: migrated };
}

export type ResolveResult<T> = { ok: true; value: T } | { ok: false; reason: "cross_site" | "missing" };
export function resolveEntityRef(document: SiteDocumentV2, ref: EntityRef, currentSiteId: string): ResolveResult<SiteDocumentV2["entities"]["profiles"][number] | SiteDocumentV2["entities"]["posts"][number] | SiteDocumentV2["windows"][number]> {
  if (ref.siteId !== currentSiteId) return { ok: false, reason: "cross_site" };
  const value = ref.kind === "profile" ? document.entities.profiles.find((entity) => entity.id === ref.id && entity.siteId === currentSiteId) : ref.kind === "post" ? document.entities.posts.find((entity) => entity.id === ref.id && entity.siteId === currentSiteId) : document.windows.find((window) => window.id === ref.id);
  return value ? { ok: true, value } : { ok: false, reason: "missing" };
}
export type EntityReferrer = { kind: "window"; windowId: string } | { kind: "post"; postId: string; field: "authorProfileId" };
export function collectEntityReferrers(document: SiteDocumentV2, ref: EntityRef, currentSiteId: string): EntityReferrer[] {
  if (ref.siteId !== currentSiteId || ref.kind !== "profile") return [];
  const out: EntityReferrer[] = [];
  for (const window of document.windows) if (window.type === "instagram" && window.content.profileRef.siteId === ref.siteId && window.content.profileRef.id === ref.id) out.push({ kind: "window", windowId: window.id });
  for (const post of document.entities.posts) if (post.siteId === currentSiteId && post.authorProfileId === ref.id) out.push({ kind: "post", postId: post.id, field: "authorProfileId" });
  return out;
}
