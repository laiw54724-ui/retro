import { Hono, type Context } from "hono";
import type { Env } from "../env";
import { requireSiteRole, SiteAccessError, type SiteAccess } from "../lib/access";
import { jsonError } from "../lib/http";
import { createInviteToken, digestInviteToken } from "../lib/invites";
import { AcceptInviteSchema, CreateInviteSchema, UpdateMemberSchema } from "../lib/site";
import { requireUser, serviceClient } from "../lib/supabase";

export const collaboration = new Hono<{ Bindings: Env }>();

collaboration.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store");
});

async function requireManager(
  c: Context<{ Bindings: Env }>,
  client: ReturnType<typeof serviceClient>,
  userId: string
): Promise<SiteAccess | Response> {
  try {
    return await requireSiteRole(client, c.req.param("siteId") ?? "", userId, "manage_members");
  } catch (error) {
    if (error instanceof SiteAccessError) return jsonError(c, error.status, error.code, error.message);
    throw error;
  }
}

function rpcFailure(c: Context<{ Bindings: Env }>, error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("collaboration_forbidden")) return jsonError(c, 403, "forbidden", "Only the site owner can manage collaborators");
  if (message.includes("member_not_found")) return jsonError(c, 404, "not_found", "Member not found");
  if (message.includes("invite_expired")) return jsonError(c, 409, "invite_expired", "This invitation has expired");
  if (message.includes("invite_revoked")) return jsonError(c, 409, "invite_revoked", "This invitation was revoked");
  if (message.includes("invite_used")) return jsonError(c, 409, "invite_used", "This invitation was already used");
  if (message.includes("invite_email_mismatch")) return jsonError(c, 403, "invite_email_mismatch", "Sign in with the email address that received this invitation");
  if (message.includes("owner_cannot_join")) return jsonError(c, 409, "owner_cannot_join", "The site owner cannot join as a member");
  if (message.includes("invalid_invite")) return jsonError(c, 404, "invalid_invite", "Invitation not found");
  return jsonError(c, 500, "db_error", "Could not update collaboration access");
}

collaboration.get("/sites/:siteId/members", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const { data, error } = await client.from("site_memberships").select("user_id,email,role,created_at,updated_at").eq("site_id", access.siteId).order("created_at");
  if (error) return jsonError(c, 500, "db_error", "Could not load members");
  return c.json({ members: data ?? [] });
});

collaboration.get("/sites/:siteId/invites", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const { data, error } = await client.from("site_invites").select("id,email,role,expires_at,accepted_at,revoked_at,created_at").eq("site_id", access.siteId).order("created_at", { ascending: false });
  if (error) return jsonError(c, 500, "db_error", "Could not load invitations");
  return c.json({ invites: data ?? [] });
});

collaboration.post("/sites/:siteId/invites", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const body = CreateInviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "invalid_invite", "Invalid invitation", body.error.flatten());
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const token = createInviteToken();
  const digest = await digestInviteToken(token);
  const expiresAt = new Date(Date.now() + body.data.expiryHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.rpc("create_site_invite", {
    p_site_id: access.siteId,
    p_actor_id: user.id,
    p_email: body.data.email,
    p_role: body.data.role,
    p_token_digest: digest,
    p_expires_at: expiresAt
  });
  if (error) return rpcFailure(c, error);
  const invite = Array.isArray(data) ? data[0] : data;
  return c.json({ invite, token }, 201);
});

collaboration.delete("/sites/:siteId/invites/:inviteId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const { error } = await client.rpc("revoke_site_invite", { p_site_id: access.siteId, p_invite_id: c.req.param("inviteId"), p_actor_id: user.id });
  if (error) return rpcFailure(c, error);
  return c.body(null, 204);
});

collaboration.put("/sites/:siteId/members/:userId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const body = UpdateMemberSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 400, "invalid_role", "Invalid member role", body.error.flatten());
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const { error } = await client.rpc("update_site_member_role", { p_site_id: access.siteId, p_user_id: c.req.param("userId"), p_actor_id: user.id, p_role: body.data.role });
  if (error) return rpcFailure(c, error);
  return c.json({ ok: true });
});

collaboration.delete("/sites/:siteId/members/:userId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const client = serviceClient(c.env);
  const access = await requireManager(c, client, user.id);
  if (access instanceof Response) return access;
  const { error } = await client.rpc("remove_site_member", { p_site_id: access.siteId, p_user_id: c.req.param("userId"), p_actor_id: user.id });
  if (error) return rpcFailure(c, error);
  return c.body(null, 204);
});

collaboration.post("/invites/accept", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  if (!user.email) return jsonError(c, 403, "verified_email_required", "A verified email address is required");
  const body = AcceptInviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return jsonError(c, 404, "invalid_invite", "Invitation not found");
  const digest = await digestInviteToken(body.data.token);
  const client = serviceClient(c.env);
  const { data, error } = await client.rpc("accept_site_invite", { p_token_digest: digest, p_user_id: user.id, p_email: user.email.trim().toLowerCase() });
  if (error) return rpcFailure(c, error);
  const membership = Array.isArray(data) ? data[0] : data;
  return c.json({ membership });
});
