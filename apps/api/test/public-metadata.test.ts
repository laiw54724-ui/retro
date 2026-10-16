import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2 } from "@retrodesk/shared";

const legacy = createStarterDocument("Demo", "classic98", "instagram");
const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
const profile = migrated.document.entities.profiles[0];

let row: Record<string, unknown> | null = {
  id: "site-a",
  username: "demo",
  site_name: "Demo",
  published_document: migrated.document,
  published_version: 4,
};

function fakeQuery() {
  const query = { select: () => query, eq: () => query, not: () => query, maybeSingle: async () => ({ data: row, error: null }) };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(),
  serviceClient: vi.fn(() => ({ from: vi.fn(() => fakeQuery()) })),
}));

const { sites } = await import("../src/routes/sites");

describe("public metadata route", () => {
  beforeEach(() => {
    row = { id: "site-a", username: "demo", site_name: "Demo", published_document: migrated.document, published_version: 4 };
  });

  it("returns version-keyed metadata with no-store caching", async () => {
    const response = await sites.request(`/public/sites/demo/metadata?kind=oc&id=${encodeURIComponent(profile.id)}`, {}, {} as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toContain("published:4:oc:");
    expect(await response.json()).toMatchObject({ metadata: { publishedVersion: 4, canonicalPath: `/@demo/oc/${encodeURIComponent(profile.id)}` } });
  });

  it("uses the same generic 404 for bad, missing, and draft entity IDs", async () => {
    for (const path of ["/public/sites/demo/metadata?kind=post&id=missing", "/public/sites/demo/metadata?kind=bad&id=x"]) {
      const response = await sites.request(path, {}, {} as never);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: "not_found", message: "Public page not found" } });
    }
    row = null;
    const missing = await sites.request("/public/sites/demo/metadata", {}, {} as never);
    expect(missing.status).toBe(404);
  });
});
