import { describe, expect, it } from "vitest";
import { can, resolveSiteAccess, requireSiteRole, SiteAccessError } from "../src/lib/access";

type Row = Record<string, unknown> | null;

function clientFor(options: {
  site?: Row;
  membership?: Row;
  siteError?: unknown;
  membershipError?: unknown;
}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        calls.push(table);
        const query: any = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => table === "sites"
            ? { data: options.site ?? null, error: options.siteError ?? null }
            : { data: options.membership ?? null, error: options.membershipError ?? null }
        };
        return query;
      }
    } as any
  };
}

describe("request-time site access", () => {
  it("resolves an owner without trusting or querying a membership role", async () => {
    const fake = clientFor({ site: { id: "site-a", owner_id: "user-a" }, membership: { role: "viewer" } });
    await expect(resolveSiteAccess(fake.client, "site-a", "user-a")).resolves.toEqual({ siteId: "site-a", ownerId: "user-a", role: "owner" });
    expect(fake.calls).toEqual(["sites"]);
  });

  it.each(["editor", "viewer"] as const)("resolves a %s from the current membership row", async (role) => {
    const fake = clientFor({ site: { id: "site-a", owner_id: "owner-a" }, membership: { role } });
    await expect(resolveSiteAccess(fake.client, "site-a", "user-a")).resolves.toEqual({ siteId: "site-a", ownerId: "owner-a", role });
  });

  it("returns a non-leaking 404 for missing sites and absent or removed memberships", async () => {
    const missing = clientFor({ site: null });
    await expect(resolveSiteAccess(missing.client, "site-a", "user-a")).rejects.toMatchObject({ status: 404, code: "not_found" });

    const state: { membership: Row } = { membership: { role: "editor" } };
    const dynamicClient: any = {
      from(table: string) {
        const query: any = { select: () => query, eq: () => query, maybeSingle: async () => table === "sites"
          ? { data: { id: "site-a", owner_id: "owner-a" }, error: null }
          : { data: state.membership, error: null } };
        return query;
      }
    };
    await expect(resolveSiteAccess(dynamicClient, "site-a", "user-a")).resolves.toMatchObject({ role: "editor" });
    state.membership = null;
    await expect(resolveSiteAccess(dynamicClient, "site-a", "user-a")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("maps database failures and corrupt roles to 500", async () => {
    await expect(resolveSiteAccess(clientFor({ siteError: { message: "down" } }).client, "site-a", "user-a")).rejects.toMatchObject({ status: 500, code: "db_error" });
    await expect(resolveSiteAccess(clientFor({ site: { id: "site-a", owner_id: "owner-a" }, membershipError: { message: "down" } }).client, "site-a", "user-a")).rejects.toMatchObject({ status: 500, code: "db_error" });
    await expect(resolveSiteAccess(clientFor({ site: { id: "site-a", owner_id: "owner-a" }, membership: { role: "owner" } }).client, "site-a", "user-a")).rejects.toMatchObject({ status: 500, code: "db_error" });
  });
});

describe("role matrix", () => {
  it("allows only the intended actions", () => {
    expect(can("owner", "manage_members")).toBe(true);
    expect(can("owner", "publish")).toBe(true);
    expect(can("editor", "write")).toBe(true);
    expect(can("editor", "assets_write")).toBe(true);
    expect(can("editor", "publish")).toBe(false);
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "write")).toBe(false);
  });

  it("rejects an authenticated member that lacks the requested action", async () => {
    const fake = clientFor({ site: { id: "site-a", owner_id: "owner-a" }, membership: { role: "viewer" } });
    await expect(requireSiteRole(fake.client, "site-a", "user-a", "write")).rejects.toEqual(expect.any(SiteAccessError));
    await expect(requireSiteRole(fake.client, "site-a", "user-a", "write")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
