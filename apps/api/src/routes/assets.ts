import { Hono } from "hono";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { imageBytesMatchMime } from "../lib/upload";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
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
  if (!(file instanceof File)) return jsonError(c, 400, "missing_file", "Upload one image as field 'file'");
  if (!ALLOWED_TYPES.has(file.type)) return jsonError(c, 415, "unsupported_media", "Only JPEG, PNG, WebP and GIF are allowed");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(c, 413, "file_too_large", "Image must be 8 MB or smaller");

  const bytes = await file.arrayBuffer();
  if (!imageBytesMatchMime(new Uint8Array(bytes), file.type)) {
    return jsonError(c, 415, "invalid_image_bytes", "File contents do not match the declared image type");
  }

  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const assetId = crypto.randomUUID();
  const key = `users/${user.id}/sites/${siteId}/${assetId}.${extension}`;
  await c.env.ASSETS.put(key, bytes, {
    httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { ownerId: user.id, siteId }
  });

  const base = c.env.PUBLIC_ASSET_BASE_URL.replace(/\/$/, "");
  const url = `${base}/${key}`;
  await supabase.from("site_assets").insert({ id: assetId, site_id: siteId, owner_id: user.id, object_key: key, mime_type: file.type, size_bytes: file.size, public_url: url });
  return c.json({ asset: { id: assetId, url, mimeType: file.type, size: file.size } }, 201);
});

assets.get("/assets/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/assets\//, "");
  const object = await c.env.ASSETS.get(key);
  if (!object) return c.notFound();
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
});
