import type { serviceClient } from "./supabase";

export type SiteRole = "owner" | "editor" | "viewer";
export type SiteAction = "read" | "write" | "assets_write" | "publish" | "manage_members";
export type SiteAccess = { siteId: string; ownerId: string; role: SiteRole };

type ServiceClient = ReturnType<typeof serviceClient>;

const permissions: Record<SiteRole, readonly SiteAction[]> = {
  owner: ["read", "write", "assets_write", "publish", "manage_members"],
  editor: ["read", "write", "assets_write"],
  viewer: ["read"]
};

export class SiteAccessError extends Error {
  constructor(
    public readonly status: 403 | 404 | 500,
    public readonly code: "forbidden" | "not_found" | "db_error",
    message: string
  ) {
    super(message);
    this.name = "SiteAccessError";
  }
}

export function can(role: SiteRole, action: SiteAction): boolean {
  return permissions[role].includes(action);
}

export async function resolveSiteAccess(
  client: ServiceClient,
  siteId: string,
  userId: string
): Promise<SiteAccess> {
  const { data: site, error: siteError } = await client
    .from("sites")
    .select("id,owner_id")
    .eq("id", siteId)
    .maybeSingle();

  if (siteError) throw new SiteAccessError(500, "db_error", "Could not load site access");
  if (!site) throw new SiteAccessError(404, "not_found", "Site not found");
  if (site.owner_id === userId) return { siteId: site.id, ownerId: site.owner_id, role: "owner" };

  const { data: membership, error: membershipError } = await client
    .from("site_memberships")
    .select("role")
    .eq("site_id", site.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) throw new SiteAccessError(500, "db_error", "Could not load site access");
  if (!membership) throw new SiteAccessError(404, "not_found", "Site not found");
  if (membership.role !== "editor" && membership.role !== "viewer") {
    throw new SiteAccessError(500, "db_error", "Invalid site access role");
  }
  return { siteId: site.id, ownerId: site.owner_id, role: membership.role };
}

export async function requireSiteRole(
  client: ServiceClient,
  siteId: string,
  userId: string,
  action: SiteAction
): Promise<SiteAccess> {
  const access = await resolveSiteAccess(client, siteId, userId);
  if (!can(access.role, action)) throw new SiteAccessError(403, "forbidden", "You do not have permission for this action");
  return access;
}
