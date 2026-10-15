import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { imageBytesMatchMime } from "../lib/upload";
import { createAssetReference, replaceExactStrings } from "@retrodesk/shared";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ASSET_KINDS = new Set(["image", "icon"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const assets = new Hono<{ Bindings: Env }>();

assets.post("/sites/:siteId/assets", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const supabase = serviceClient(c.env);
  const { data: site, error } = await supabase.from("sites").select("id").eq("id", siteId).eq("owner_id", user.id).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not validate site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");

  const body = await c.req.parseBody();
  const file = body.file;
  const kind = typeof body.kind === "string" && body.kind ? body.kind : "image";
  if (!ASSET_KINDS.has(kind)) return jsonError(c, 400, "invalid_kind", "kind must be 'image' or 'icon'");
  const name = (typeof body.name === "string" ? body.name : file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "").trim().slice(0, 120);
  if (!(file instanceof File)) return jsonError(c, 400, "missing_file", "Upload one image as field 'file'");
  if (!ALLOWED_TYPES.has(file.type)) return jsonError(c, 415, "unsupported_media", "Only JPEG, PNG, WebP and GIF are allowed");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(c, 413, "file_too_large", "Image must be 8 MB or smaller");

  const bytes = await file.arrayBuffer();
  if (!imageBytesMatchMime(new Uint8Array(bytes), file.type)) {
    return jsonError(c, 415, "invalid_image_bytes", "File contents do not match the declared image type");
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const assetId = crypto.randomUUID();
  const key = `draft/users/${user.id}/sites/${siteId}/${assetId}.${extension}`;
  await c.env.ASSETS.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: "private, no-store" },
    customMetadata: { ownerId: user.id, siteId }
  });

  const reference = createAssetReference(assetId);
  const { error: insertError } = await supabase.from("site_assets").insert({ id: assetId, site_id: siteId, owner_id: user.id, object_key: key, mime_type: file.type, size_bytes: file.size, public_url: reference, storage_scope: "draft_private", migration_status: "not_required", kind, name });
  if (insertError) {
    await c.env.ASSETS.delete(key);
    return jsonError(c, 500, "db_error", "Could not save asset");
  }
  return c.json({ asset: { id: assetId, url: reference, mimeType: file.type, size: file.size, kind, name } }, 201);
});

assets.get("/sites/:siteId/assets", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const kind = c.req.query("kind");
  if (kind !== undefined && !ASSET_KINDS.has(kind)) return jsonError(c, 400, "invalid_kind", "kind must be 'image' or 'icon'");

  const supabase = serviceClient(c.env);
  let query = supabase
    .from("site_assets")
    .select("id,public_url,mime_type,size_bytes,kind,name,created_at,storage_scope,migration_status")
    .eq("site_id", siteId)
    .eq("owner_id", user.id);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) return jsonError(c, 500, "db_error", "Could not list assets");
  return c.json({
    assets: (data ?? []).map((row) => ({ id: row.id, url: row.public_url, mimeType: row.mime_type, size: row.size_bytes, kind: row.kind, name: row.name, createdAt: row.created_at, storageScope: row.storage_scope, migrationStatus: row.migration_status, migrationRequired: row.storage_scope === "legacy_public" }))
  });
});

assets.get("/sites/:siteId/assets/:assetId/content", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const assetId = c.req.param("assetId");
  const supabase = serviceClient(c.env);
  const { data: asset, error } = await supabase.from("site_assets").select("id,object_key,storage_scope").eq("id", assetId).eq("site_id", siteId).eq("owner_id", user.id).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load asset");
  if (!asset) return jsonError(c, 404, "not_found", "Asset not found");
  const privatePrefix = `draft/users/${user.id}/sites/${siteId}/`;
  const legacyPrefix = `users/${user.id}/sites/${siteId}/`;
  const allowed = asset.storage_scope === "draft_private" ? asset.object_key.startsWith(privatePrefix) : asset.object_key.startsWith(legacyPrefix);
  if (!allowed) return jsonError(c, 404, "not_found", "Asset not found");
  const object = await c.env.ASSETS.get(asset.object_key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

assets.post("/sites/:siteId/assets/migrate", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const body = await c.req.json().catch(() => null) as { expectedVersion?: number; document?: unknown } | null;
  const expectedVersion = body?.expectedVersion;
  if (!body || !Number.isInteger(expectedVersion) || (expectedVersion as number) < 0 || body.document === undefined) return jsonError(c, 400, "invalid_migration", "expectedVersion and document are required");
  const version = expectedVersion as number;
  const supabase = serviceClient(c.env);
  const { data: site, error: siteError } = await supabase.from("sites").select("id,draft_document,draft_version,username").eq("id", siteId).eq("owner_id", user.id).maybeSingle();
  if (siteError) return jsonError(c, 500, "db_error", "Could not load site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  if (site.draft_version !== version) return jsonError(c, 409, "version_conflict", "Save the latest draft before migrating assets", { currentVersion: site.draft_version });
  const { data: rows, error: assetsError } = await supabase.from("site_assets").select("id,object_key,public_url,mime_type,size_bytes,kind,name,storage_scope").eq("site_id", siteId).eq("owner_id", user.id).eq("storage_scope", "legacy_public");
  if (assetsError) return jsonError(c, 500, "db_error", "Could not load legacy assets");
  const replacements = new Map<string, string>();
  const updates: Array<Record<string, string>> = [];
  const copiedKeys: string[] = [];
  for (const row of rows ?? []) {
    const extension = row.object_key.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (!extension || !["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) continue;
    const object = await c.env.ASSETS.get(row.object_key);
    if (!object) return jsonError(c, 400, "asset_migration_failed", `Legacy asset ${row.id} is missing from storage`, { assetId: row.id });
    const normalizedExtension = extension === "jpeg" ? "jpg" : extension;
    const key = `draft/users/${user.id}/sites/${siteId}/${row.id}.${normalizedExtension}`;
    try {
      await c.env.ASSETS.put(key, object.body, { httpMetadata: { contentType: row.mime_type, cacheControl: "private, no-store" }, customMetadata: { ownerId: user.id, siteId } });
    } catch (copyError) {
      for (const copied of copiedKeys) await c.env.ASSETS.delete(copied);
      return jsonError(c, 502, "asset_migration_failed", copyError instanceof Error ? copyError.message : "Could not copy legacy asset", { assetId: row.id });
    }
    copiedKeys.push(key);
    const reference = createAssetReference(row.id);
    replacements.set(row.public_url, reference);
    updates.push({ id: row.id, oldObjectKey: row.object_key, oldPublicUrl: row.public_url, objectKey: key, publicUrl: reference });
  }
  const document = replaceExactStrings(body.document, replacements);
  const { data: migrated, error: rpcError } = await supabase.rpc("migrate_site_assets_private", { p_site_id: siteId, p_owner_id: user.id, p_expected_version: version, p_document: document, p_asset_updates: updates });
  if (rpcError) {
    for (const copied of copiedKeys) await c.env.ASSETS.delete(copied);
    if (rpcError.message.includes("version_conflict")) return jsonError(c, 409, "version_conflict", "This draft changed somewhere else");
    return jsonError(c, 500, "asset_migration_failed", "Could not migrate legacy assets");
  }
  const row = Array.isArray(migrated) ? migrated[0] : migrated;
  const cleanupWarnings: string[] = [];
  for (const update of updates) {
    try { await c.env.ASSETS.delete(update.oldObjectKey); } catch { cleanupWarnings.push(String(update.id)); }
  }
  return c.json({ version: row?.draft_version ?? version + 1, document: row?.draft_document ?? document, migratedCount: updates.length, cleanupWarnings });
});

assets.delete("/sites/:siteId/assets/:assetId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const siteId = c.req.param("siteId");
  const assetId = c.req.param("assetId");

  const supabase = serviceClient(c.env);
  const { data: asset, error } = await supabase
    .from("site_assets")
    .select("id,object_key")
    .eq("id", assetId)
    .eq("site_id", siteId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load asset");
  if (!asset) return jsonError(c, 404, "not_found", "Asset not found");
  // Defense in depth: never delete outside this user's own prefix.
  if (!asset.object_key.startsWith(`draft/users/${user.id}/sites/${siteId}/`) && !asset.object_key.startsWith(`users/${user.id}/sites/${siteId}/`)) return jsonError(c, 404, "not_found", "Asset not found");

  await c.env.ASSETS.delete(asset.object_key);
  const { error: deleteError } = await supabase.from("site_assets").delete().eq("id", assetId).eq("owner_id", user.id);
  if (deleteError) return jsonError(c, 500, "db_error", "Could not delete asset");
  return c.body(null, 204);
});

assets.get("/assets/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/assets\//, "");
  if (!key.startsWith("published/") && !key.startsWith("users/")) return c.notFound();
  const object = await c.env.ASSETS.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});
