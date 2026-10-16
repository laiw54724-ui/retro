import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2 } from "@retrodesk/shared";

const migrated = migrateSiteDocumentV2(createStarterDocument("Shared", "classic98", "instagram"), { siteId: "site-a" });
if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");

const state: { role: "editor" | "viewer" | null; userId: string; updates: unknown[] } = {
  role: "editor",
  userId: "member-a",
  updates: []
};

const site = {
  id: "site-a",
  owner_id: "owner-a",
  username: "shared",
  site_name: "Shared",
  draft_document: migrated.document,
  draft_version: 1,
  published_document: null,
  published_version: null,
  published_at: null,
  updated_at: "2026-10-16T00:00:00.000Z"
};

function queryFor(table: string) {
  let updateMode = false;
  const query: any = {
    select: () => query,
    eq: () => query,
    update: (value: unknown) => { updateMode = true; state.updates.push(value); return query; },
    maybeSingle: async () => {
      if (table === "site_memberships") return { data: state.role ? { role: state.role } : null, error: null };
      if (table === "sites") return { data: updateMode ? { draft_version: 2, updated_at: site.updated_at } : site, error: null };
      return { data: null, error: null };
    }
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: state.userId, email: "member@example.com" })),
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => queryFor(table)) }))
}));

const { sites } = await import("../src/routes/sites");

describe("shared site route permissions", () => {
  beforeEach(() => { state.role = "editor"; state.userId = "member-a"; state.updates.length = 0; });

  it.each(["editor", "viewer"] as const)("allows a %s to read and returns the authoritative role", async (role) => {
    state.role = role;
    const response = await sites.request("/sites/site-a", {}, {} as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ site: { id: "site-a", access_role: role } });
  });

  it("allows an editor to save but never publish", async () => {
    const save = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document: migrated.document }) }, {} as never);
    expect(save.status).toBe(200);
    expect(state.updates).toHaveLength(1);

    const publish = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) }, { ASSETS: { put: vi.fn() } } as never);
    expect(publish.status).toBe(403);
  });

  it("keeps a viewer read-only", async () => {
    state.role = "viewer";
    const response = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document: migrated.document }) }, {} as never);
    expect(response.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it("revokes access on the next request after membership removal", async () => {
    expect((await sites.request("/sites/site-a", {}, {} as never)).status).toBe(200);
    state.role = null;
    expect((await sites.request("/sites/site-a", {}, {} as never)).status).toBe(404);
  });
});
