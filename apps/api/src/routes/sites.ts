import { Hono } from "hono";
import { projectPublicSiteDocument, UsernameSchema } from "@retrodesk/shared";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { CreateSiteSchema, PublishSchema, SaveDraftSchema } from "../lib/site";
import { copyReferencedAssets, publishedArtifactKey, recordArtifactStatus, writePublishedArtifact } from "../lib/publish";

export const sites = new Hono<{ Bindings: Env }>();

async function cleanupPendingLegacyAssets(env: Env, supabase: ReturnType<typeof serviceClient>, siteId: string, ownerId: string) {
  const result = await supabase.from("site_assets").select("id,legacy_object_key").eq("site_id", siteId).eq("owner_id", ownerId).eq("migration_status", "pending");
  if (result.error) return ["inventory-unavailable"];
  const rows = Array.isArray(result.data) ? result.data : [];
  const warnings: string[] = [];
  for (const row of rows) {
    if (!row.legacy_object_key) continue;
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
  const { data, error } = await supabase
    .from("sites")
    .select("id,username,site_name,draft_version,published_version,published_at,updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });
  if (error) return jsonError(c, 500, "db_error", "Could not load sites");
  return c.json({ sites: data ?? [] });
});

sites.post("/sites", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const body = CreateSiteSchema.safeParse(await c.req.json().catch(() => null));
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
  const { data, error } = await supabase
    .from("sites")
    .select("id,username,site_name,draft_document,draft_version,published_document,published_version,published_at,updated_at")
    .eq("id", c.req.param("siteId"))
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load site");
  if (!data) return jsonError(c, 404, "not_found", "Site not found");
  return c.json({ site: data });
});

sites.put("/sites/:siteId/draft", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const payload = SaveDraftSchema.safeParse(await c.req.json().catch(() => null));
  if (!payload.success) return jsonError(c, 400, "invalid_draft", "Invalid draft payload", payload.error.flatten());

  const supabase = serviceClient(c.env);
  const { data: current, error: readError } = await supabase
    .from("sites")
    .select("id,draft_version")
    .eq("id", c.req.param("siteId"))
    .eq("owner_id", user.id)
    .maybeSingle();
  if (readError) return jsonError(c, 500, "db_error", "Could not load draft");
  if (!current) return jsonError(c, 404, "not_found", "Site not found");
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
    .eq("owner_id", user.id)
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
  const { data: site, error: readError } = await supabase
    .from("sites")
    .select("id,owner_id,username,site_name,draft_document,draft_version,published_version")
    .eq("id", c.req.param("siteId"))
    .eq("owner_id", user.id)
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
  const assetCopy = await copyReferencedAssets(c.env, supabase, { ownerId: user.id, siteId: site.id, username: site.username, document: projection.document });
  if (!assetCopy.ok) {
    const status = assetCopy.code === "copy_failed" || assetCopy.code === "unavailable" ? 502 : 400;
    return jsonError(c, status, "publish_assets_failed", assetCopy.message, { assetId: assetCopy.assetId, reason: assetCopy.code });
  }
  const rewrittenProjection = projectPublicSiteDocument(assetCopy.document, site.id);
  if (!rewrittenProjection.ok) return jsonError(c, 400, "invalid_publish_document", "The published document is invalid after asset replacement", { diagnostics: rewrittenProjection.code === "invalid" ? rewrittenProjection.diagnostics : [] });
  const { data: committed, error: publishError } = await supabase.rpc("publish_site_atomic", {
    p_site_id: site.id,
    p_owner_id: user.id,
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
  const artifact = await writePublishedArtifact(c.env, {
    username: site.username,
    version: row.published_version,
    document: rewrittenProjection.document,
    publishedAt: row.published_at,
    artifactKey: row.artifact_key ?? publishedArtifactKey(site.username, row.published_version)
  });
  const statusResult = await recordArtifactStatus(supabase, site.id, user.id, row.published_version, artifact.artifactStatus, artifact.error);
  const cleanupWarnings = await cleanupPendingLegacyAssets(c.env, supabase, site.id, user.id);
  if (statusResult.error || !statusResult.updated) return c.json({ publishedVersion: row.published_version, publishedAt: row.published_at, url: `/@${site.username}`, ...artifact, artifactStatus: "failed", retryable: true, cleanupWarnings, warning: statusResult.error ? "Published database version is live; artifact status could not be recorded." : "This publication is stale; the artifact was written but its status was not recorded for the current version." });
  return c.json({ publishedVersion: row.published_version, publishedAt: row.published_at, url: `/@${site.username}`, ...artifact, cleanupWarnings });
});

sites.post("/sites/:siteId/publish/retry", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const supabase = serviceClient(c.env);
  const { data: site, error } = await supabase
    .from("sites")
    .select("id,owner_id,username,published_document,published_version,published_at,published_artifact_key")
    .eq("id", c.req.param("siteId"))
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load published site");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  if (!site?.published_document || !site.published_version || !site.published_at) return jsonError(c, 409, "not_published", "Publish a version before retrying its artifact");
  const artifact = await writePublishedArtifact(c.env, {
    username: site.username,
    version: site.published_version,
    document: site.published_document,
    publishedAt: site.published_at,
    artifactKey: site.published_artifact_key ?? publishedArtifactKey(site.username, site.published_version)
  });
  const statusResult = await recordArtifactStatus(supabase, site.id, user.id, site.published_version, artifact.artifactStatus, artifact.error);
  const cleanupWarnings = await cleanupPendingLegacyAssets(c.env, supabase, site.id, user.id);
  if (statusResult.error || !statusResult.updated) return c.json({ publishedVersion: site.published_version, publishedAt: site.published_at, url: `/@${site.username}`, ...artifact, artifactStatus: "failed", retryable: true, cleanupWarnings, warning: statusResult.error ? "Artifact was written but status could not be recorded." : "This artifact status is stale; retry from the current published version." });
  return c.json({ publishedVersion: site.published_version, publishedAt: site.published_at, url: `/@${site.username}`, ...artifact, cleanupWarnings });
});

sites.get("/public/sites/:username", async (c) => {
  const parsed = UsernameSchema.safeParse(c.req.param("username"));
  if (!parsed.success) return jsonError(c, 404, "not_found", "Site not found");
  const supabase = serviceClient(c.env);
  const { data, error } = await supabase
    .from("sites")
    .select("username,site_name,published_document,published_version,published_at")
    .eq("username", parsed.data)
    .not("published_document", "is", null)
    .maybeSingle();
  if (error) return jsonError(c, 500, "db_error", "Could not load published site");
  if (!data?.published_document) return jsonError(c, 404, "not_found", "Site not found");
  c.header("Cache-Control", "no-store");
  return c.json({ site: data });
});
