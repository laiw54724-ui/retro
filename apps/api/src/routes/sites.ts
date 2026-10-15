import { Hono } from "hono";
import { UsernameSchema } from "@retrodesk/shared";
import type { Env } from "../env";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";
import { CreateSiteSchema, PublishSchema, SaveDraftSchema } from "../lib/site";

export const sites = new Hono<{ Bindings: Env }>();

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

  const nextPublishedVersion = (site.published_version ?? 0) + 1;
  const now = new Date().toISOString();
  const { error: versionError } = await supabase.from("site_versions").insert({
    site_id: site.id,
    version: nextPublishedVersion,
    document: site.draft_document,
    created_by: user.id
  });
  if (versionError) return jsonError(c, 500, "db_error", "Could not create published version");

  const { error } = await supabase
    .from("sites")
    .update({ published_document: site.draft_document, published_version: nextPublishedVersion, published_at: now, updated_at: now })
    .eq("id", site.id)
    .eq("owner_id", user.id);
  if (error) return jsonError(c, 500, "db_error", "Could not publish site");

  const publishedJson = JSON.stringify({ username: site.username, version: nextPublishedVersion, document: site.draft_document, publishedAt: now });
  await c.env.ASSETS.put(`published/${site.username}/site.json`, publishedJson, {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "public, max-age=60" }
  });

  return c.json({ publishedVersion: nextPublishedVersion, publishedAt: now, url: `/@${site.username}` });
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
