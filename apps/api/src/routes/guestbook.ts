import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { requireSiteRole, SiteAccessError } from "../lib/access";
import { jsonError } from "../lib/http";
import { requireUser, serviceClient } from "../lib/supabase";

export const guestbook = new Hono<{ Bindings: Env }>();

const SubmissionSchema = z.object({ displayName: z.string().trim().min(1).max(40), body: z.string().trim().min(1).max(1000), requestId: z.string().uuid() }).strict();
const ReportSchema = z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(1).max(200).default("visitor_report") }).strict();
const ModerationSchema = z.object({ status: z.enum(["approved", "rejected"]) }).strict();

type ServiceClient = ReturnType<typeof serviceClient>;

function enabled(document: unknown) {
  if (!document || typeof document !== "object") return false;
  const windows = (document as { windows?: unknown }).windows;
  return Array.isArray(windows) && windows.some((window) => !!window && typeof window === "object" && (window as any).type === "guestbook" && (window as any).content?.enabled === true);
}

async function abuseKey(c: Context<{ Bindings: Env }>) {
  const address = (c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0] || "unknown").trim();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(c.env.SUPABASE_SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`guestbook:${address}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function row(entry: any) {
  const reports = Array.isArray(entry.guestbook_reports) ? entry.guestbook_reports : [];
  return { id: entry.id, displayName: entry.display_name, body: entry.body, status: entry.status, createdAt: entry.created_at, reportCount: reports.length, openReportCount: reports.filter((report: any) => report.status === "open").length };
}

async function publicSite(client: ServiceClient, username: string) {
  return client.from("sites").select("id,published_document").eq("username", username).not("published_document", "is", null).maybeSingle();
}

async function owner(c: Context<{ Bindings: Env }>, client: ServiceClient) {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  try { return await requireSiteRole(client, c.req.param("siteId") ?? "", user.id, "manage_members"); }
  catch (reason) {
    if (reason instanceof SiteAccessError) return jsonError(c, reason.status, reason.code, reason.message);
    throw reason;
  }
}

guestbook.get("/public/sites/:username/guestbook", async (c) => {
  const client = serviceClient(c.env);
  const { data: site, error } = await publicSite(client, c.req.param("username"));
  if (error) return jsonError(c, 500, "db_error", "Could not load guestbook");
  if (!site || !enabled(site.published_document)) return jsonError(c, 404, "guestbook_disabled", "Guestbook is not accepting entries");
  const result = await client.from("guestbook_entries").select("id,display_name,body,status,created_at").eq("site_id", site.id).eq("status", "approved").order("created_at", { ascending: false }).limit(100);
  if (result.error) return jsonError(c, 500, "db_error", "Could not load guestbook");
  c.header("Cache-Control", "no-store");
  return c.json({ entries: (result.data ?? []).map(row) });
});

guestbook.post("/public/sites/:username/guestbook", async (c) => {
  const payload = SubmissionSchema.safeParse(await c.req.json().catch(() => null));
  if (!payload.success) return jsonError(c, 400, "invalid_guestbook_entry", "Nickname, message, or request identifier is invalid");
  const client = serviceClient(c.env);
  const { data: site, error } = await publicSite(client, c.req.param("username"));
  if (error) return jsonError(c, 500, "db_error", "Could not submit guestbook entry");
  if (!site) return jsonError(c, 404, "not_found", "Site not found");
  const result = await client.rpc("submit_guestbook_entry", { p_site_id: site.id, p_display_name: payload.data.displayName, p_body: payload.data.body, p_request_id: payload.data.requestId, p_abuse_key: await abuseKey(c) });
  if (result.error) {
    if (result.error.message.includes("guestbook_disabled")) return jsonError(c, 403, "guestbook_disabled", "Guestbook is not accepting entries");
    if (result.error.message.includes("guestbook_rate_limited")) return jsonError(c, 429, "rate_limited", "Too many guestbook entries");
    return jsonError(c, 500, "db_error", "Could not submit guestbook entry");
  }
  const entry = Array.isArray(result.data) ? result.data[0] : result.data;
  c.header("Cache-Control", "no-store");
  return c.json({ entry: row(entry) }, 202);
});

guestbook.post("/public/sites/:username/guestbook/:entryId/reports", async (c) => {
  const payload = ReportSchema.safeParse(await c.req.json().catch(() => null));
  const entryId = z.string().uuid().safeParse(c.req.param("entryId"));
  if (!payload.success || !entryId.success) return jsonError(c, 400, "invalid_guestbook_report", "Report is invalid");
  const client = serviceClient(c.env);
  const { data: site, error } = await publicSite(client, c.req.param("username"));
  if (error) return jsonError(c, 500, "db_error", "Could not report guestbook entry");
  if (!site || !enabled(site.published_document)) return jsonError(c, 404, "not_found", "Guestbook entry not found");
  const result = await client.rpc("report_guestbook_entry", { p_site_id: site.id, p_entry_id: entryId.data, p_request_id: payload.data.requestId, p_abuse_key: await abuseKey(c), p_reason: payload.data.reason });
  if (result.error) {
    if (result.error.message.includes("rate_limited")) return jsonError(c, 429, "rate_limited", "Too many reports");
    if (result.error.message.includes("duplicate")) return c.json({ accepted: true });
    if (result.error.message.includes("not_found")) return jsonError(c, 404, "not_found", "Guestbook entry not found");
    return jsonError(c, 500, "db_error", "Could not report guestbook entry");
  }
  return c.json({ accepted: true }, 202);
});

guestbook.get("/sites/:siteId/guestbook", async (c) => {
  const client = serviceClient(c.env);
  const access = await owner(c, client);
  if (access instanceof Response) return access;
  const result = await client.from("guestbook_entries").select("id,display_name,body,status,created_at,guestbook_reports(status)").eq("site_id", access.siteId).order("created_at", { ascending: false }).limit(500);
  if (result.error) return jsonError(c, 500, "db_error", "Could not load moderation queue");
  c.header("Cache-Control", "private, no-store");
  return c.json({ entries: (result.data ?? []).map(row) });
});

guestbook.put("/sites/:siteId/guestbook/:entryId", async (c) => {
  const payload = ModerationSchema.safeParse(await c.req.json().catch(() => null));
  const entryId = z.string().uuid().safeParse(c.req.param("entryId"));
  if (!payload.success || !entryId.success) return jsonError(c, 400, "invalid_moderation", "Moderation request is invalid");
  const client = serviceClient(c.env);
  const access = await owner(c, client);
  if (access instanceof Response) return access;
  const result = await client.from("guestbook_entries").update({ status: payload.data.status, reviewed_at: new Date().toISOString(), reviewed_by: access.ownerId }).eq("id", entryId.data).eq("site_id", access.siteId).select("id,display_name,body,status,created_at").maybeSingle();
  if (result.error) return jsonError(c, 500, "db_error", "Could not moderate guestbook entry");
  if (!result.data) return jsonError(c, 404, "not_found", "Guestbook entry not found");
  return c.json({ entry: row(result.data) });
});

guestbook.delete("/sites/:siteId/guestbook/:entryId", async (c) => {
  const entryId = z.string().uuid().safeParse(c.req.param("entryId"));
  if (!entryId.success) return jsonError(c, 404, "not_found", "Guestbook entry not found");
  const client = serviceClient(c.env);
  const access = await owner(c, client);
  if (access instanceof Response) return access;
  const result = await client.from("guestbook_entries").delete().eq("id", entryId.data).eq("site_id", access.siteId).select("id");
  if (result.error) return jsonError(c, 500, "db_error", "Could not delete guestbook entry");
  if (!result.data?.length) return jsonError(c, 404, "not_found", "Guestbook entry not found");
  return c.body(null, 204);
});

guestbook.post("/sites/:siteId/guestbook/:entryId/reports/resolve", async (c) => {
  const entryId = z.string().uuid().safeParse(c.req.param("entryId"));
  if (!entryId.success) return jsonError(c, 404, "not_found", "Guestbook entry not found");
  const client = serviceClient(c.env);
  const access = await owner(c, client);
  if (access instanceof Response) return access;
  const result = await client.from("guestbook_reports").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: access.ownerId }).eq("entry_id", entryId.data).eq("site_id", access.siteId).eq("status", "open").select("id");
  if (result.error) return jsonError(c, 500, "db_error", "Could not resolve guestbook reports");
  return c.json({ resolved: result.data?.length ?? 0 });
});
