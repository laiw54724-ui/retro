import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2 } from "@retrodesk/shared";

const state = { document: null as unknown };
const query = {
  select: () => query,
  eq: () => query,
  maybeSingle: async () => ({ data: { id: "site-a", owner_id: "user-a", draft_version: 1, draft_document: state.document }, error: null }),
  update: () => query
};
vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => ({ from: vi.fn(() => query) }))
}));

const { sites } = await import("../src/routes/sites");

function validV2() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Draft", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  return migrated.document;
}

describe("draft route semantic validation", () => {
  beforeEach(() => { state.document = validV2(); });

  it.each([
    ["duplicate handles", (document: any) => ({ ...document, entities: { ...document.entities, profiles: [{ ...document.entities.profiles[0], id: "profile:copy", handle: document.entities.profiles[0].handle }] } })],
    ["missing profile ref", (document: any) => ({ ...document, windows: document.windows.map((window: any) => window.type === "instagram" ? { ...window, content: { ...window.content, profileRef: { ...window.content.profileRef, id: "missing" } } } : window) })],
    ["cross-site entity scope", (document: any) => ({ ...document, entities: { ...document.entities, profiles: document.entities.profiles.map((profile: any) => ({ ...profile, siteId: "site-other" })) } })]
  ])("rejects %s before writing", async (_label, mutate) => {
    const document = mutate(validV2());
    const response = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) }, {} as never);
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error.code).toBe("invalid_draft");
    expect(body.error.details).toBeDefined();
  });

  it("rejects a self-consistent site-b document submitted to site-a", async () => {
    const migrated = migrateSiteDocumentV2(createStarterDocument("Other", "classic98", "instagram"), { siteId: "site-b" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
    const response = await sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document: migrated.document }) }, {} as never);
    expect(response.status).toBe(400);
    const body = await response.json() as any;
    expect(body.error).toMatchObject({ code: "invalid_draft", message: expect.stringContaining("does not belong") });
    expect(body.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ code: "cross_site" })]));
  });
});
