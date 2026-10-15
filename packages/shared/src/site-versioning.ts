import { z } from "zod";
import {
  AboutFieldSchema,
  DesktopWindowSchema,
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
export const EntityRefSchema = z.object({ siteId: BoundedId, id: BoundedId, kind: z.enum(["window", "profile", "post"]) }).strict();
export type EntityRef = z.infer<typeof EntityRefSchema>;
export type EntityKind = EntityRef["kind"];

const Visibility = z.enum(["published", "draft"]);
const ProfileFields = InstagramProfileSchema.shape;
const { id: _legacyPostId, ...PostFields } = IgPostSchema.shape;
export const ProfileEntityV2Schema = z.object({
  kind: z.literal("profile"), id: BoundedId, siteId: BoundedId, visibility: Visibility, ...ProfileFields
}).strict();
export const PostEntityV2Schema = z.object({
  kind: z.literal("post"), id: BoundedId, siteId: BoundedId, visibility: Visibility, authorProfileId: BoundedId,
  ...PostFields
}).strict();
export type ProfileEntityV2 = z.infer<typeof ProfileEntityV2Schema>;
export type PostEntityV2 = z.infer<typeof PostEntityV2Schema>;

const BaseV2Window = z.object({
  id: BoundedId, title: z.string().min(1).max(160), icon: z.string().min(1).max(500), layout: WindowLayoutSchema,
  defaultOpen: z.boolean(), appearance: WindowAppearanceSchema.optional()
}).strict();
const NonInstagramWindowV2Schema = z.discriminatedUnion("type", [
  BaseV2Window.extend({ type: z.literal("document"), content: z.object({ blocks: z.array(DocumentBlockSchema).max(100) }).strict() }),
  BaseV2Window.extend({ type: z.literal("gallery"), content: z.object({ columns: z.number().int().min(1).max(5), images: z.array(GalleryImageSchema).max(200) }).strict() }),
  BaseV2Window.extend({ type: z.literal("links"), content: z.object({ links: z.array(LinkItemSchema).max(100) }).strict() }),
  BaseV2Window.extend({ type: z.literal("about"), content: z.object({
    avatar: z.union([z.string().url(), z.null()]), avatarCrop: ImageCropSchema.optional(), nickname: z.string().max(160), bio: z.string().max(5000),
    banner: z.string().max(500).default(""), quote: z.string().max(500).default(""), detailsTitle: z.string().max(100).default("File Details"),
    avatarUrl: z.string().max(2048).default(""), fields: z.array(AboutFieldSchema).max(50), socials: z.array(SocialLinkSchema).max(50)
  }).strict() })
]);
export const DesktopWindowV2Schema = z.union([
  NonInstagramWindowV2Schema,
  BaseV2Window.extend({ type: z.literal("instagram"), content: z.object({ skin: z.enum(["win98", "modern"]), profileRef: EntityRefSchema }).strict() })
]);
export type DesktopWindowV2 = z.infer<typeof DesktopWindowV2Schema>;

export const SiteDocumentV2Schema = z.object({
  schemaVersion: z.literal(2), siteName: z.string().min(1).max(120), theme: ThemeSchema,
  windows: z.array(DesktopWindowV2Schema).max(100), mobileColumns: z.number().int().min(3).max(4).default(4),
  profiles: z.array(ProfileEntityV2Schema).max(100), posts: z.array(PostEntityV2Schema).max(500)
}).strict();
export type SiteDocumentV2 = z.infer<typeof SiteDocumentV2Schema>;
export type VersionedSiteDocument = SiteDocument | SiteDocumentV2;

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
  for (const [i, window] of document.windows.entries()) {
    if (windowIds.has(window.id)) out.push({ path: ["windows", i, "id"], message: "Duplicate window id", code: "duplicate_id" });
    windowIds.add(window.id);
    if (window.type === "instagram") {
      const ref = window.content.profileRef;
      if (ref.siteId !== firstSite(document, ref.siteId) || document.profiles.some((p) => p.id === ref.id && p.siteId !== ref.siteId)) out.push({ path: ["windows", i, "content", "profileRef", "siteId"], message: "Cross-site reference", code: "cross_site" });
      if (!document.profiles.some((p) => p.id === ref.id && p.siteId === ref.siteId)) out.push({ path: ["windows", i, "content", "profileRef"], message: "Missing profile", code: "missing_ref" });
    }
  }
  for (const [i, profile] of document.profiles.entries()) { if (profileIds.has(profile.id)) out.push({ path: ["profiles", i, "id"], message: "Duplicate entity id", code: "duplicate_id" }); profileIds.add(profile.id); }
  for (const [i, post] of document.posts.entries()) {
    if (postIds.has(post.id)) out.push({ path: ["posts", i, "id"], message: "Duplicate entity id", code: "duplicate_id" }); postIds.add(post.id);
    if (document.profiles.some((p) => p.id === post.authorProfileId && p.siteId !== post.siteId)) out.push({ path: ["posts", i, "authorProfileId"], message: "Cross-site reference", code: "cross_site" });
    else if (!document.profiles.some((p) => p.id === post.authorProfileId && p.siteId === post.siteId)) out.push({ path: ["posts", i, "authorProfileId"], message: "Missing author profile", code: "missing_ref" });
  }
  return out;
}
function firstSite(document: SiteDocumentV2, siteId: string): string { return document.profiles[0]?.siteId ?? document.posts[0]?.siteId ?? siteId; }

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
  const parsed = parseSiteDocument(raw);
  if (!parsed.ok) return parsed;
  if (parsed.version === 2) return parsed;
  const source = parsed.document, profiles: ProfileEntityV2[] = [], posts: PostEntityV2[] = [], profileIds = new Set<string>(), postIds = new Set<string>();
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
  const migrated: SiteDocumentV2 = { schemaVersion: 2, siteName: source.siteName, theme: source.theme, windows, mobileColumns: source.mobileColumns, profiles, posts };
  return { ok: true, version: 2, document: migrated };
}

export type ResolveResult<T> = { ok: true; value: T } | { ok: false; code: "cross_site" | "missing" };
export function resolveEntityRef(document: SiteDocumentV2, ref: EntityRef): ResolveResult<SiteDocumentV2["profiles"][number] | SiteDocumentV2["posts"][number] | SiteDocumentV2["windows"][number]> {
  const siteIds = new Set([...document.profiles, ...document.posts].map((entity) => entity.siteId));
  if (siteIds.size && !siteIds.has(ref.siteId)) return { ok: false, code: "cross_site" };
  const value = ref.kind === "profile" ? document.profiles.find((entity) => entity.id === ref.id && entity.siteId === ref.siteId) : ref.kind === "post" ? document.posts.find((entity) => entity.id === ref.id && entity.siteId === ref.siteId) : document.windows.find((window) => window.id === ref.id);
  return value ? { ok: true, value } : { ok: false, code: "missing" };
}
export type EntityReferrer = { kind: "window"; windowId: string } | { kind: "post"; postId: string; field: "authorProfileId" };
export function collectEntityReferrers(document: SiteDocumentV2, ref: EntityRef): EntityReferrer[] {
  const out: EntityReferrer[] = [];
  for (const window of document.windows) if (window.type === "instagram" && window.content.profileRef.siteId === ref.siteId && window.content.profileRef.id === ref.id) out.push({ kind: "window", windowId: window.id });
  for (const post of document.posts) if (post.siteId === ref.siteId && post.authorProfileId === ref.id) out.push({ kind: "post", postId: post.id, field: "authorProfileId" });
  return out;
}
