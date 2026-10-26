import { Hono, type Context } from "hono";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { audioBytesMatchMime, extensionForMime, imageBytesMatchMime, normalizeAudioMime } from "../lib/upload";
import { collectAssetReferences, createAssetReference, normalizeAssetId, parseSiteDocument, replaceExactStrings } from "@retrodesk/shared";
import { requireSiteRole, SiteAccessError, type SiteAccess, type SiteAction } from "../lib/access";
import { respondWithR2Object } from "../lib/r2-response";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_AUDIO_REQUEST_BYTES = 18 * 1024 * 1024;
const MAX_SITE_AUDIO_BYTES = 100 * 1024 * 1024;
const ASSET_KINDS = new Set(["image", "icon", "audio"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const assets = new Hono<{ Bindings: Env }>();

async function loadAssetAccess(
  c: Context<{ Bindings: Env }>,
  client: ReturnType<typeof serviceClient>,
  userId: string,
  action: SiteAction
): Promise<SiteAccess | Response> {
  try {
    return await requireSiteRole(client, c.req.param("siteId") ?? "", userId, action);
  } catch (error) {
    if (error instanceof SiteAccessError) return jsonError(c, error.status, error.code, error.message);
    throw error;
  }
}

function containsExactString(value: unknown, candidates: ReadonlySet<string>): boolean {
  if (typeof value === "string") return candidates.has(value);
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, candidates));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsExactString(item, candidates));
  return false;
}

assets.post("/sites/:siteId/assets", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const supabase = serviceClient(c.env);
  const access = await loadAssetAccess(c, supabase, user.id, "assets_write");
  if (access instanceof Response) return access;

  const declaredLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_REQUEST_BYTES) {
    return jsonError(c, 413, "file_too_large", "Upload must be 16 MB or smaller");
  }
  const body = await c.req.parseBody();
  const file = body.file;
  const kind = typeof body.kind === "string" && body.kind ? body.kind : "image";
  if (!ASSET_KINDS.has(kind)) return jsonError(c, 400, "invalid_kind", "kind must be 'image', 'icon', or 'audio'");
  const name = (typeof body.name === "string" ? body.name : file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "").trim().slice(0, 120);
  if (!(file instanceof File)) return jsonError(c, 400, "missing_file", "Upload one file as field 'file'");
  const isAudio = kind === "audio";
  const normalizedMime = isAudio ? normalizeAudioMime(file.type) : ALLOWED_IMAGE_TYPES.has(file.type) ? file.type : null;
  if (!normalizedMime) return jsonError(c, 415, "unsupported_media", isAudio ? "Only MP3, Ogg, and WAV are allowed" : "Only JPEG, PNG, WebP and GIF are allowed");
  const maxBytes = isAudio ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) return jsonError(c, 413, "file_too_large", isAudio ? "Audio must be 16 MB or smaller" : "Image must be 8 MB or smaller");

  if (isAudio) {
    const { data: audioRows, error: quotaError } = await supabase.from("site_assets").select("size_bytes").eq("site_id", siteId).eq("owner_id", access.ownerId).eq("kind", "audio");
    if (quotaError) return jsonError(c, 500, "db_error", "Could not verify audio quota");
    const used = (audioRows ?? []).reduce((total, row) => total + Number(row.size_bytes ?? 0), 0);
    if (used + file.size > MAX_SITE_AUDIO_BYTES) return jsonError(c, 413, "site_audio_quota_exceeded", "This site can store up to 100 MB of audio");
  }

  const bytes = await file.arrayBuffer();
  const validBytes = isAudio ? audioBytesMatchMime(new Uint8Array(bytes), normalizedMime) : imageBytesMatchMime(new Uint8Array(bytes), normalizedMime);
  if (!validBytes) {
    return jsonError(c, 415, isAudio ? "invalid_audio_bytes" : "invalid_image_bytes", `File contents do not match the declared ${isAudio ? "audio" : "image"} type`);
  }

  const extension = extensionForMime(normalizedMime);
  if (!extension) return jsonError(c, 415, "unsupported_media", "Unsupported file type");
  const assetId = crypto.randomUUID();
  const key = `draft/users/${access.ownerId}/sites/${siteId}/${assetId}.${extension}`;
  await c.env.ASSETS.put(key, bytes, {
    httpMetadata: { contentType: normalizedMime, cacheControl: "private, no-store" },
    customMetadata: { ownerId: access.ownerId, siteId }
  });

  const reference = createAssetReference(assetId);
  const { error: insertError } = await supabase.from("site_assets").insert({ id: assetId, site_id: siteId, owner_id: access.ownerId, object_key: key, mime_type: normalizedMime, size_bytes: file.size, public_url: reference, storage_scope: "draft_private", migration_status: "not_required", kind, name });
  if (insertError) {
    await c.env.ASSETS.delete(key);
    return jsonError(c, 500, "db_error", "Could not save asset");
  }
  return c.json({ asset: { id: assetId, url: reference, mimeType: normalizedMime, size: file.size, kind, name } }, 201);
});

assets.get("/sites/:siteId/assets", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const kind = c.req.query("kind");
  if (kind !== undefined && !ASSET_KINDS.has(kind)) return jsonError(c, 400, "invalid_kind", "kind must be 'image', 'icon', or 'audio'");

  const supabase = serviceClient(c.env);
  const access = await loadAssetAccess(c, supabase, user.id, "read");
  if (access instanceof Response) return access;
  let query = supabase
    .from("site_assets")
    .select("id,public_url,mime_type,size_bytes,kind,name,created_at,storage_scope,migration_status")
    .eq("site_id", siteId)
    .eq("owner_id", access.ownerId);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) return jsonError(c, 500, "db_error", "Could not list assets");
  c.header("Cache-Control", "private, no-store");
  return c.json({
    assets: (data ?? []).map((row) => ({ id: row.id, url: row.public_url, mimeType: row.mime_type, size: row.size_bytes, kind: row.kind, name: row.name, createdAt: row.created_at, storageScope: row.storage_scope, migrationStatus: row.migration_status, migrationRequired: row.storage_scope === "legacy_public" || row.migration_status === "pending", publicCopyRemaining: row.migration_status === "pending" }))
  });
});

assets.on(["GET", "HEAD"], "/sites/:siteId/assets/:assetId/content", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const assetId = c.req.param("assetId");
  const supabase = serviceClient(c.env);
  const access = await loadAssetAccess(c, supabase, user.id, "read");
  if (access instanceof Response) return access;
  const { data: asset, error } = await supabase.from("site_assets").select("id,object_key,storage_scope").eq("id", assetId).eq("site_id", siteId).eq("owner_id", access.ownerId).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load asset");
  if (!asset) return jsonError(c, 404, "not_found", "Asset not found");
  const privatePrefix = `draft/users/${access.ownerId}/sites/${siteId}/`;
  const legacyPrefix = `users/${access.ownerId}/sites/${siteId}/`;
  const allowed = asset.storage_scope === "draft_private" ? asset.object_key.startsWith(privatePrefix) : asset.object_key.startsWith(legacyPrefix);
  if (!allowed) return jsonError(c, 404, "not_found", "Asset not found");
  return await respondWithR2Object(c.env.ASSETS, asset.object_key, c.req.raw, "private, no-store") ?? c.notFound();
});

assets.post("/sites/:siteId/assets/migrate", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const body = await c.req.json().catch(() => null) as { expectedVersion?: number } | null;
  const expectedVersion = body?.expectedVersion;
  if (!body || !Number.isInteger(expectedVersion) || (expectedVersion as number) < 0) return jsonError(c, 400, "invalid_migration", "expectedVersion is required");
  const version = expectedVersion as number;
  const supabase = serviceClient(c.env);
  const access = await loadAssetAccess(c, supabase, user.id, "publish");
  if (access instanceof Response) return access;
  const { data: site, error: siteError } = await supabase.from("sites").select("id,draft_document,draft_version,published_document,username").eq("id", siteId).maybeSingle();
  if (siteError) return jsonError(c, 500, "db_error", "Could not load site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  if (site.draft_version !== version) return jsonError(c, 409, "version_conflict", "Save the latest draft before migrating assets", { currentVersion: site.draft_version });
  const { data: rows, error: assetsError } = await supabase.from("site_assets").select("id,object_key,public_url,mime_type,size_bytes,kind,name,storage_scope").eq("site_id", siteId).eq("owner_id", access.ownerId).eq("storage_scope", "legacy_public");
  if (assetsError) return jsonError(c, 500, "db_error", "Could not load legacy assets");
  if (!(rows ?? []).length) return c.json({ version, document: site.draft_document, migratedCount: 0, cleanupWarnings: [] });
  const replacements = new Map<string, string>();
  const updates: Array<Record<string, string>> = [];
  // Deterministic keys are shared by retries and concurrent requests. A failed
  // or unknown RPC cannot prove that another transaction has not committed them.
  // Retain private copies for retry; never roll them back from this request.
  for (const row of rows ?? []) {
    const extension = row.object_key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (!extension || !["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
      return jsonError(c, 400, "asset_migration_failed", `Legacy asset ${row.id} has an unsupported extension`, { assetId: row.id });
    }
    const object = await c.env.ASSETS.get(row.object_key);
    if (!object) {
      return jsonError(c, 400, "asset_migration_failed", `Legacy asset ${row.id} is missing from storage`, { assetId: row.id });
    }
    const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
    const key = `draft/users/${access.ownerId}/sites/${siteId}/${row.id}.${normalizedExtension}`;
    try {
      const created = await c.env.ASSETS.put(key, object.body, {
        onlyIf: new Headers({ "If-None-Match": "*" }),
        httpMetadata: { contentType: row.mime_type, cacheControl: "private, no-store" },
        customMetadata: { ownerId: access.ownerId, siteId }
      });
      if (created === null) {
        const existing = await c.env.ASSETS.head(key);
        // A collision or uncertain identity needs investigation, not an
        // overwrite of bytes that may already have been committed.
        if (!existing || existing.etag !== object.etag || existing.size !== object.size
          || existing.httpMetadata?.contentType !== row.mime_type
          || existing.customMetadata?.ownerId !== access.ownerId || existing.customMetadata?.siteId !== siteId) {
          return jsonError(c, 502, "asset_migration_failed", "Migration destination already exists with a different identity", { assetId: row.id });
        }
      }
    } catch (copyError) {
      return jsonError(c, 502, "asset_migration_failed", copyError instanceof Error ? copyError.message : "Could not copy legacy asset", { assetId: row.id });
    }
    const reference = createAssetReference(row.id);
    replacements.set(row.public_url, reference);
    updates.push({ id: row.id, oldObjectKey: row.object_key, oldPublicUrl: row.public_url, objectKey: key, publicUrl: reference });
  }
  const document = replaceExactStrings(site.draft_document, replacements);
  const parsed = parseSiteDocument(document);
  if (!parsed.ok) {
    return jsonError(c, 400, "invalid_migration", "The migrated draft is invalid", { diagnostics: parsed.code === "invalid" ? parsed.diagnostics : [] });
  }
  const { data: migrated, error: rpcError } = await supabase.rpc("migrate_site_assets_private", { p_site_id: siteId, p_owner_id: access.ownerId, p_expected_version: version, p_document: document, p_asset_updates: updates });
  if (rpcError) {
    if (rpcError.message.includes("version_conflict")) return jsonError(c, 409, "version_conflict", "This draft changed somewhere else");
    return jsonError(c, 500, "asset_migration_failed", "Could not migrate legacy assets");
  }
  const row = Array.isArray(migrated) ? migrated[0] : migrated;
  const cleanupWarnings: string[] = [];
  const publishedText = JSON.stringify(site.published_document ?? null);
  for (const update of updates) {
    if (publishedText.includes(JSON.stringify(update.oldPublicUrl))) { cleanupWarnings.push(String(update.id)); continue; }
    try {
      await c.env.ASSETS.delete(update.oldObjectKey);
      const cleaned = await supabase.from("site_assets").update({ migration_status: "migrated", legacy_object_key: null, legacy_public_url: null }).eq("id", update.id).eq("owner_id", access.ownerId);
      if (cleaned.error) cleanupWarnings.push(String(update.id));
    } catch { cleanupWarnings.push(String(update.id)); }
  }
  return c.json({ version: row?.draft_version ?? version + 1, document: row?.draft_document ?? document, migratedCount: updates.length, cleanupWarnings });
});

assets.delete("/sites/:siteId/assets/:assetId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");

  const supabase = serviceClient(c.env);
  const access = await loadAssetAccess(c, supabase, user.id, "assets_write");
  if (access instanceof Response) return access;
  const assetId = normalizeAssetId(c.req.param("assetId"));
  if (!assetId) return jsonError(c, 400, "invalid_asset_id", "A valid asset UUID is required");
  const { data: asset, error } = await supabase
    .from("site_assets")
    .select("id,object_key,migration_status,legacy_object_key,public_url,legacy_public_url,storage_scope")
    .eq("id", assetId)
    .eq("site_id", siteId)
    .eq("owner_id", access.ownerId)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load asset");
  if (!asset) return jsonError(c, 404, "not_found", "Asset not found");
  if (asset.migration_status === "pending" && asset.legacy_object_key) return jsonError(c, 409, "asset_public_copy_pending", "Republish the site and finish cleaning the old public copy before deleting this asset");
  // Defense in depth: never delete outside this user's own prefix.
  if (!asset.object_key.startsWith(`draft/users/${access.ownerId}/sites/${siteId}/`) && !asset.object_key.startsWith(`users/${access.ownerId}/sites/${siteId}/`)) return jsonError(c, 404, "not_found", "Asset not found");

  const { data: site, error: siteError } = await supabase.from("sites").select("draft_document,published_document").eq("id", siteId).eq("owner_id", access.ownerId).maybeSingle();
  if (siteError) return jsonError(c, 500, "db_error", "Could not verify asset references");
  if (site) {
    const referenced = new Set([...collectAssetReferences(site.draft_document), ...collectAssetReferences(site.published_document)]);
    const legacyUrls = new Set<string>([asset.storage_scope === "legacy_public" ? asset.public_url : null, asset.legacy_public_url]
      .filter((value): value is string => typeof value === "string" && value.length > 0));
    if (referenced.has(assetId) || containsExactString(site.draft_document, legacyUrls) || containsExactString(site.published_document, legacyUrls)) {
      return jsonError(c, 409, "asset_in_use", "Remove this asset from the draft and published site before deleting it");
    }
  }

  await c.env.ASSETS.delete(asset.object_key);
  const { error: deleteError } = await supabase.from("site_assets").delete().eq("id", assetId).eq("owner_id", access.ownerId);
  if (deleteError) return jsonError(c, 500, "db_error", "Could not delete asset");
  return c.body(null, 204);
});

assets.on(["GET", "HEAD"], "/assets/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/assets\//, "");
  if (!key.startsWith("published/") && !key.startsWith("users/")) return c.notFound();
  return await respondWithR2Object(c.env.ASSETS, key, c.req.raw, "public, max-age=31536000, immutable") ?? c.notFound();
});
