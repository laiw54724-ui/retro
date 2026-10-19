import { APPEARANCE_UPGRADE_MESSAGE, APPEARANCE_WRITE_CONTRACT } from "../lib/appearanceCompatibility";
import { Hono, type Context } from "hono";
import { createRetroExport, EXPORT_SITE_ID, inspectRetroImport, MAX_IMPORT_BYTES, remapDocumentSiteId, UsernameSchema } from "@retrodesk/shared";
import type { Env } from "../env";
import { requireUser, serviceClient } from "../lib/supabase";
import { requireSiteRole, SiteAccessError } from "../lib/access";
import { jsonError } from "../lib/http";

export const transfer = new Hono<{ Bindings: Env }>();

async function boundedJson(c: Context<{ Bindings: Env }>): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (!(c.req.header("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return { ok: false, response: jsonError(c, 415, "unsupported_import", "Only Retro JSON export files are supported") };
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_IMPORT_BYTES) return { ok: false, response: jsonError(c, 413, "import_too_large", "Import JSON must be 2 MB or smaller") };
  const text = await c.req.text();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return { ok: false, response: jsonError(c, 413, "import_too_large", "Import JSON must be 2 MB or smaller") };
  try { return { ok: true, value: JSON.parse(text) }; }
  catch { return { ok: false, response: jsonError(c, 415, "unsupported_import", "Only a valid Retro JSON export is supported; ZIP and executable files are rejected") }; }
}

async function digestPackage(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exportResponse(username: string, scope: "public" | "owner-backup", value: unknown) {
  const filename = `retro-${username}-${scope === "public" ? "published" : "private-backup"}.json`;
  return new Response(JSON.stringify(value, null, 2), { headers: { "Content-Type": "application/json; charset=UTF-8", "Content-Disposition": `attachment; filename=\"${filename}\"`, "Cache-Control": "no-store" } });
}

function exportFailure(c: Context<{ Bindings: Env }>, result: Extract<ReturnType<typeof createRetroExport>, { ok: false }>) {
  const status = result.code === "sensitive_content" ? 409 : 500;
  return jsonError(c, status, result.code, result.code === "sensitive_content" ? "Export stopped because a token-shaped value or signed URL was found" : "The site cannot be exported", { diagnostics: result.diagnostics });
}

transfer.get("/public/sites/:username/export", async (c) => {
  const username = UsernameSchema.safeParse(c.req.param("username"));
  if (!username.success) return jsonError(c, 404, "not_found", "Published site not found");
  const supabase = serviceClient(c.env);
  const { data, error } = await supabase.from("sites").select("id,username,published_document").eq("username", username.data).not("published_document", "is", null).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load published export");
  if (!data?.published_document) return jsonError(c, 404, "not_found", "Published site not found");
  const result = createRetroExport({ scope: "public", siteId: data.id, username: data.username, siteName: data.published_document.siteName, document: data.published_document });
  return result.ok ? exportResponse(data.username, "public", result.value) : exportFailure(c, result);
});

transfer.get("/sites/:siteId/export", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const supabase = serviceClient(c.env);
  try { await requireSiteRole(supabase, c.req.param("siteId"), user.id, "manage_members"); }
  catch (error) { return error instanceof SiteAccessError ? jsonError(c, error.status, error.code, error.message) : jsonError(c, 500, "db_error", "Could not authorize export"); }
  const scope = c.req.query("scope") === "published" ? "published" : "draft";
  const { data, error } = await supabase.from("sites").select("id,username,site_name,draft_document,published_document").eq("id", c.req.param("siteId")).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load export");
  if (!data) return jsonError(c, 404, "not_found", "Site not found");
  const document = scope === "published" ? data.published_document : data.draft_document;
  if (!document) return jsonError(c, 409, "not_published", "Publish this desktop before exporting its public version");
  const exportScope = scope === "published" ? "public" : "owner-backup";
  const result = createRetroExport({ scope: exportScope, siteId: data.id, username: data.username, siteName: scope === "published" ? document.siteName : data.site_name, document });
  return result.ok ? exportResponse(data.username, exportScope, result.value) : exportFailure(c, result);
});

transfer.post("/imports/preview", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  // Require every import client: a legacy parser may already have removed P2 keys.
  if (c.req.query("clientAppearanceContract") !== String(APPEARANCE_WRITE_CONTRACT)) return jsonError(c, 426, "client_upgrade_required", APPEARANCE_UPGRADE_MESSAGE);
  const body = await boundedJson(c);
  if (!body.ok) return body.response;
  const inspected = inspectRetroImport(body.value);
  if (!inspected.ok) return jsonError(c, 400, inspected.code, "Import package validation failed", { diagnostics: inspected.diagnostics });
  return c.json({ preview: inspected.preview, digest: await digestPackage(inspected.value) });
});

transfer.post("/imports/confirm", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  // Require every import client: a legacy parser may already have removed P2 keys.
  if (c.req.query("clientAppearanceContract") !== String(APPEARANCE_WRITE_CONTRACT)) return jsonError(c, 426, "client_upgrade_required", APPEARANCE_UPGRADE_MESSAGE);
  const body = await boundedJson(c);
  if (!body.ok) return body.response;
  const inspected = inspectRetroImport(body.value);
  if (!inspected.ok) return jsonError(c, 400, inspected.code, "Import package validation failed", { diagnostics: inspected.diagnostics });
  const digest = c.req.query("digest") ?? "";
  if (!/^[a-f0-9]{64}$/.test(digest) || digest !== await digestPackage(inspected.value)) return jsonError(c, 409, "preview_changed", "Preview this exact file again before importing");
  if (inspected.preview.missingMedia.length && c.req.query("allowMissingMedia") !== "true") return jsonError(c, 409, "missing_media_confirmation", "Confirm that private media must be re-uploaded after import", { missingMedia: inspected.preview.missingMedia });
  const username = UsernameSchema.safeParse(c.req.query("username"));
  const siteName = (c.req.query("siteName") ?? inspected.preview.siteName).trim();
  if (!username.success || !siteName || siteName.length > 120) return jsonError(c, 400, "invalid_site", "Choose a valid new URL and desktop name");
  const siteId = crypto.randomUUID();
  const document = remapDocumentSiteId(inspected.value.document, EXPORT_SITE_ID, siteId);
  document.siteName = siteName;
  const supabase = serviceClient(c.env);
  const { data, error } = await supabase.from("sites").insert({ id: siteId, owner_id: user.id, username: username.data, site_name: siteName, draft_document: document, draft_version: 1 }).select("id,username,site_name,draft_version").single();
  if (error?.code === "23505") return jsonError(c, 409, "username_taken", "That URL is already in use");
  if (error || !data) return jsonError(c, 500, "db_error", "Could not create imported desktop");
  return c.json({ site: data, missingMedia: inspected.preview.missingMedia }, 201);
});
