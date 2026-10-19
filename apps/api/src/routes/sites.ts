import { APPEARANCE_UPGRADE_MESSAGE, appearanceWriteBlocked } from "../lib/appearanceCompatibility";
import { IMAGE_UPGRADE_MESSAGE, IMAGE_WINDOW_WRITE_CONTRACT, imageWriteBlocked } from "../lib/imageCompatibility";
import { Hono, type Context } from "hono";
import { buildPublicMetadata, projectPublicSiteDocument, UsernameSchema, validateSiteDocumentScope } from "@retrodesk/shared";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { CreateSiteSchema, PublishSchema, SaveDraftSchema } from "../lib/site";
import { copyReferencedAssets, promotePublishedAssets, publishedArtifactKey, recordArtifactStatus, writePublishedArtifact, type PublishArtifactResult } from "../lib/publish";
import { requireSiteRole, SiteAccessError, type SiteAction, type SiteAccess } from "../lib/access";

export const sites = new Hono<{ Bindings: Env }>();

async function loadSiteAccess(
  c: Context<{ Bindings: Env }>,
  supabase: ReturnType<typeof serviceClient>,
  userId: string,
  action: SiteAction
): Promise<SiteAccess | Response> {
  try {
    return await requireSiteRole(supabase, c.req.param("siteId") ?? "", userId, action);
  } catch (error) {
    if (error instanceof SiteAccessError) return jsonError(c, error.status, error.code, error.message);
    throw error;
  }
}

function containsExactString(value: unknown, needle: string): boolean {
  if (typeof value === "string") return value === needle;
  if (Array.isArray(value)) return value.some((item) => containsExactString(item, needle));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsExactString(item, needle));
  return false;
}

export async function cleanupPendingLegacyAssets(env: Env, supabase: ReturnType<typeof serviceClient>, siteId: string, ownerId: string, liveDocument: unknown) {
  const result = await supabase.from("site_assets").select("id,legacy_object_key,legacy_public_url").eq("site_id", siteId).eq("owner_id", ownerId).eq("migration_status", "pending");
  if (result.error) return ["inventory-unavailable"];
  const rows = Array.isArray(result.data) ? result.data : [];
  const warnings: string[] = [];
  for (const row of rows) {
    if (!row.legacy_object_key) continue;
    if (row.legacy_public_url && containsExactString(liveDocument, row.legacy_public_url)) { warnings.push(String(row.id)); continue; }
    try {
      await env.ASSETS.delete(row.legacy_object_key);
      const updated = await supabase.from("site_assets").update({ migration_status: "migrated", legacy_object_key: null, legacy_public_url: null }).eq("id", row.id).eq("owner_id", ownerId);
      if (updated.error) warnings.push(String(row.id));
    } catch { warnings.push(String(row.id)); }
  }
  return warnings;
}

sites.get("/usernames/:username/availability", async (c) => {
  const parsed = UsernameSchema.safeParse(c.req.param("username"));
  if (!parsed.success) return c.json({ available: false, reason: parsed.error.issues[0]?.message ?? "invalid" });

  const supabase = serviceClient(c.env);
  const { data, error } = await supabase.from("sites").select("id").eq("username", parsed.data).maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not check username");
  return c.json({ available: !data });
});

sites.get("/sites", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const supabase = serviceClient(c.env);
  const { data: owned, error: ownedError } = await supabase
    .from("sites")
    .select("id,username,site_name,draft_version,published_version,published_at,updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (ownedError) return jsonError(c, 500, "db_error", "Could not load sites");
  const { data: memberships, error: membershipError } = await supabase
    .from("site_memberships")
    .select("site_id,role")
    .eq("user_id", user.id);
  if (membershipError) return jsonError(c, 500, "db_error", "Could not load sites");
  const membershipRows = memberships ?? [];
  const sharedIds = membershipRows.map((membership) => membership.site_id);
  let shared: Array<Record<string, unknown>> = [];
  if (sharedIds.length) {
    const result = await supabase
      .from("sites")
      .select("id,username,site_name,draft_version,published_version,published_at,updated_at")
      .in("id", sharedIds)
      .order("updated_at", { ascending: false });
    if (result.error) return jsonError(c, 500, "db_error", "Could not load sites");
    shared = result.data ?? [];
  }
  const roleBySite = new Map(membershipRows.map((membership) => [membership.site_id, membership.role]));
  const combined: Array<Record<string, unknown>> = [
    ...(owned ?? []).map((site) => ({ ...site, access_role: "owner" as const })),
    ...shared.map((site) => ({ ...site, access_role: roleBySite.get(String(site.id)) }))
  ];
  combined.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return c.json({ sites: combined });
});

sites.post("/sites", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const raw = await c.req.json().catch(() => null);
  if (appearanceWriteBlocked(raw?.document, undefined, raw?.clientAppearanceContract)) return jsonError(c, 426, "client_upgrade_required", APPEARANCE_UPGRADE_MESSAGE);
  if (imageWriteBlocked(raw?.document, undefined, raw?.clientImageWindowContract)) return jsonError(c, 426, "client_upgrade_required", IMAGE_UPGRADE_MESSAGE);
  const body = CreateSiteSchema.safeParse(raw);
  if (!body.success) return jsonError(c, 400, "invalid_site", "Invalid site payload", body.error.flatten());

  const supabase = serviceClient(c.env);
  const { data: existing } = await supabase.from("sites").select("id").eq("username", body.data.username).maybeSingle();
  if (existing) return jsonError(c, 409, "username_taken", "That username is already in use");

  const { data, error } = await supabase
    .from("sites")
    .insert({
      owner_id: user.id,
      username: body.data.username,
      site_name: body.data.siteName,
      draft_document: body.data.document,
      draft_version: 1
    })
    .select("id,username,site_name,draft_document,draft_version,published_document,published_version,published_at,updated_at")
    .single();

  if (error?.code === "23505") return jsonError(c, 409, "username_taken", "That username is already in use");
  if (error) return jsonError(c, 500, "db_error", "Could not create site");
  return c.json({ site: data }, 201);
});

sites.get("/sites/:siteId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const supabase = serviceClient(c.env);
  const access = await loadSiteAccess(c, supabase, user.id, "read");
  if (access instanceof Response) return access;
  const { data, error } = await supabase
    .from("sites")
    .select("id,username,site_name,draft_document,draft_version,published_document,published_version,published_at,updated_at")
    .eq("id", access.siteId)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load site");
  if (!data) return jsonError(c, 404, "not_found", "Site not found");
  c.header("Cache-Control", "private, no-store");
  return c.json({ site: { ...data, access_role: access.role, writeCompatibility: { appearanceP2: 1, imageWindow: IMAGE_WINDOW_WRITE_CONTRACT } } });
});

sites.put("/sites/:siteId/draft", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const raw = await c.req.json().catch(() => null);
  const supabase = serviceClient(c.env);
  const access = await loadSiteAccess(c, supabase, user.id, "write");
  if (access instanceof Response) return access;
  const { data: current, error: readError } = await supabase
    .from("sites")
    .select("id,draft_version,draft_document")
    .eq("id", access.siteId)
    .maybeSingle();
  if (readError) return jsonError(c, 500, "db_error", "Could not load draft");
  if (!current) return jsonError(c, 404, "not_found", "Site not found");
  // This is the same snapshot whose version is retained in the conditional update.
  // Incoming-only detection would allow an old current-version client to strip fields.
  if (appearanceWriteBlocked(raw?.document, current.draft_document, raw?.clientAppearanceContract)) return jsonError(c, 426, "client_upgrade_required", APPEARANCE_UPGRADE_MESSAGE);
  if (imageWriteBlocked(raw?.document, current.draft_document, raw?.clientImageWindowContract)) return jsonError(c, 426, "client_upgrade_required", IMAGE_UPGRADE_MESSAGE);
  const payload = SaveDraftSchema.safeParse(raw);
  if (!payload.success) return jsonError(c, 400, "invalid_draft", "Invalid draft payload", payload.error.flatten());
  const scopeDiagnostics = validateSiteDocumentScope(payload.data.document, current.id);
  if (scopeDiagnostics.length) return jsonError(c, 400, "invalid_draft", "Draft document does not belong to this site", { fieldErrors: scopeDiagnostics });
  if (current.draft_version !== payload.data.expectedVersion) {
    return jsonError(c, 409, "version_conflict", "This draft changed somewhere else", { currentVersion: current.draft_version });
  }

  const nextVersion = current.draft_version + 1;
  const { data, error } = await supabase
    .from("sites")
    .update({
      draft_document: payload.data.document,
      site_name: payload.data.document.siteName,
      draft_version: nextVersion,
      updated_at: new Date().toISOString()
    })
    .eq("id", current.id)
    .eq("draft_version", payload.data.expectedVersion)
    .select("draft_version,updated_at")
    .maybeSingle();

  if (error) return jsonError(c, 500, "db_error", "Could not save draft");
  if (!data) return jsonError(c, 409, "version_conflict", "This draft changed somewhere else");
  return c.json({ version: data.draft_version, updatedAt: data.updated_at });
});

sites.post("/sites/:siteId/publish", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const payload = PublishSchema.safeParse(await c.req.json().catch(() => null));
  if (!payload.success) return jsonError(c, 400, "invalid_publish", "Invalid publish payload", payload.error.flatten());

  const supabase = serviceClient(c.env);
  const access = await loadSiteAccess(c, supabase, user.id, "publish");
  if (access instanceof Response) return access;
  const { data: site, error: readError } = await supabase
    .from("sites")
    .select("id,owner_id,username,site_name,draft_document,draft_version,published_version")
    .eq("id", access.siteId)
    .maybeSingle();
  if (readError) return jsonError(c, 500, "db_error", "Could not load site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  if (site.draft_version !== payload.data.expectedVersion) {
    return jsonError(c, 409, "version_conflict", "Save the latest draft before publishing", { currentVersion: site.draft_version });
  }
  const projection = projectPublicSiteDocument(site.draft_document, site.id);
  if (!projection.ok) {
    return projection.code === "unsupported_version"
      ? jsonError(c, 400, "unsupported_document_version", "This document version cannot be published", { version: projection.version })
      : jsonError(c, 400, "invalid_publish_document", "The draft cannot be published", { diagnostics: projection.diagnostics });
  }
  const assetCopy = await copyReferencedAssets(c.env, supabase, { ownerId: access.ownerId, siteId: site.id, username: site.username, document: projection.document });
  if (!assetCopy.ok) {
    const status = assetCopy.code === "copy_failed" || assetCopy.code === "unavailable" ? 502 : 400;
    return jsonError(c, status, "publish_assets_failed", assetCopy.message, { assetId: assetCopy.assetId, reason: assetCopy.code });
  }
  const rewrittenProjection = projectPublicSiteDocument(assetCopy.document, site.id);
  if (!rewrittenProjection.ok) return jsonError(c, 400, "invalid_publish_document", "The published document is invalid after asset replacement", { diagnostics: rewrittenProjection.code === "invalid" ? rewrittenProjection.diagnostics : [] });
  const { data: committed, error: publishError } = await supabase.rpc("publish_site_atomic", {
    p_site_id: site.id,
    p_owner_id: access.ownerId,
    p_expected_version: payload.data.expectedVersion,
    p_expected_published_version: site.published_version ?? 0,
    p_document: rewrittenProjection.document
  });
  if (publishError) {
    if (publishError.message.includes("published_version_conflict")) return jsonError(c, 409, "version_conflict", "This site was published from the same draft elsewhere");
    if (publishError.message.includes("version_conflict")) return jsonError(c, 409, "version_conflict", "Save the latest draft before publishing");
    if (publishError.message.includes("site_not_found")) return jsonError(c, 404, "not_found", "Site not found");
    return jsonError(c, 500, "db_error", "Could not publish site");
  }
  const row = Array.isArray(committed) ? committed[0] : committed;
  if (!row?.published_version || !row.published_at) return jsonError(c, 500, "db_error", "Publish did not return a committed version");
  const artifact = await syncCommittedPublication(c.env, {
    siteId: site.id,
    username: site.username,
    version: row.published_version,
    document: rewrittenProjection.document,
    publishedAt: row.published_at
  });
  const statusResult = await recordArtifactStatus(supabase, site.id, access.ownerId, row.published_version, artifact.artifactStatus, artifact.error);
  const cleanupWarnings = artifact.artifactStatus === "synced" && statusResult.updated && !statusResult.error
    ? await cleanupPendingLegacyAssets(c.env, supabase, site.id, access.ownerId, rewrittenProjection.document) : ["publication-sync-pending"];
  if (statusResult.error || !statusResult.updated) return c.json({ publishedVersion: row.published_version, publishedAt: row.published_at, url: `/@${site.username}`, ...artifact, artifactStatus: "failed", retryable: true, cleanupWarnings, warning: statusResult.error ? "Published database version is live; artifact status could not be recorded." : "This publication is stale; its synchronization status was not recorded for the current version." });
  return c.json({ publishedVersion: row.published_version, publishedAt: row.published_at, url: `/@${site.username}`, ...artifact, cleanupWarnings });
});

sites.post("/sites/:siteId/publish/retry", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const supabase = serviceClient(c.env);
  const access = await loadSiteAccess(c, supabase, user.id, "publish");
  if (access instanceof Response) return access;
  const { data: site, error } = await supabase
    .from("sites")
    .select("id,owner_id,username,published_document,published_version,published_at")
    .eq("id", access.siteId)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load published site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  if (!site?.published_document || !site.published_version || !site.published_at) return jsonError(c, 409, "not_published", "Publish a version before retrying its artifact");
  const artifact = await syncCommittedPublication(c.env, {
    siteId: site.id,
    username: site.username,
    version: site.published_version,
    document: site.published_document,
    publishedAt: site.published_at
  });
  const statusResult = await recordArtifactStatus(supabase, site.id, access.ownerId, site.published_version, artifact.artifactStatus, artifact.error);
  const cleanupWarnings = artifact.artifactStatus === "synced" && statusResult.updated && !statusResult.error
    ? await cleanupPendingLegacyAssets(c.env, supabase, site.id, access.ownerId, site.published_document) : ["publication-sync-pending"];
  if (statusResult.error || !statusResult.updated) return c.json({ publishedVersion: site.published_version, publishedAt: site.published_at, url: `/@${site.username}`, ...artifact, artifactStatus: "failed", retryable: true, cleanupWarnings, warning: statusResult.error ? "Publication synchronization status could not be recorded." : "This artifact status is stale; retry from the current published version." });
  return c.json({ publishedVersion: site.published_version, publishedAt: site.published_at, url: `/@${site.username}`, ...artifact, cleanupWarnings });
});

async function syncCommittedPublication(
  env: Env,
  input: { siteId: string; username: string; version: number; document: unknown; publishedAt: string }
): Promise<PublishArtifactResult> {
  let artifactKey: string;
  try { artifactKey = publishedArtifactKey(input.username, input.version); }
  catch { return { artifactStatus: "failed", retryable: true, artifactKey: "", error: "Invalid publication storage identity" }; }
  const projection = projectPublicSiteDocument(input.document, input.siteId);
  if (!projection.ok) return { artifactStatus: "failed", retryable: true, artifactKey, error: "Invalid public document" };
  const publicInput = { ...input, document: projection.document };
  const promoted = await promotePublishedAssets(env, publicInput);
  if (!promoted.ok) return { artifactStatus: "failed", retryable: true, artifactKey, error: promoted.message };
  return writePublishedArtifact(env, publicInput);
}

sites.get("/public/sites/:username", async (c) => {
  const parsed = UsernameSchema.safeParse(c.req.param("username"));
  if (!parsed.success) return jsonError(c, 404, "not_found", "Site not found");
  const supabase = serviceClient(c.env);
  const { data, error } = await supabase
    .from("sites")
    .select("id,username,published_document,published_version,published_at")
    .eq("username", parsed.data)
    .not("published_document", "is", null)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load published site");
  if (!data?.published_document) return jsonError(c, 404, "not_found", "Site not found");
  c.header("Cache-Control", "no-store");
  const projection = projectPublicSiteDocument(data.published_document, data.id);
  if (!projection.ok) return jsonError(c, 500, "invalid_public_document", "Published document is invalid");
  // Re-project stored publications as well as new writes; raw authoring text is private.
  return c.json({ site: { username: data.username, published_document: projection.document, published_version: data.published_version, published_at: data.published_at, site_name: projection.document.siteName } });
});

sites.get("/public/sites/:username/metadata", async (c) => {
  const parsed = UsernameSchema.safeParse(c.req.param("username"));
  if (!parsed.success) return jsonError(c, 404, "not_found", "Public page not found");
  const kind = c.req.query("kind");
  const id = c.req.query("id");
  if ((kind || id) && (!id || !["oc", "post"].includes(kind ?? "") || id.length > 160)) return jsonError(c, 404, "not_found", "Public page not found");
  const supabase = serviceClient(c.env);
  const { data, error } = await supabase
    .from("sites")
    .select("id,username,published_document,published_version")
    .eq("username", parsed.data)
    .not("published_document", "is", null)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load public metadata");
  if (!data?.published_document || !data.published_version) return jsonError(c, 404, "not_found", "Public page not found");
  const result = buildPublicMetadata({
    siteId: data.id,
    username: data.username,
    siteName: data.published_document.siteName,
    publishedVersion: data.published_version,
    document: data.published_document,
    target: kind && id ? { kind: kind as "oc" | "post", id } : undefined,
  });
  if (!result.ok) return jsonError(c, result.code === "not_found" ? 404 : 500, result.code, result.code === "not_found" ? "Public page not found" : "Published metadata is invalid");
  c.header("Cache-Control", "no-store");
  c.header("ETag", `W/\"${result.metadata.cacheKey}\"`);
  return c.json({ metadata: result.metadata });
});
