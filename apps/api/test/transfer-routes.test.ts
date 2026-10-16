import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRetroExport, createStarterDocument, migrateSiteDocumentV2, validateSiteDocumentScope } from "@retrodesk/shared";

const migrated = migrateSiteDocumentV2(createStarterDocument("Demo", "classic98", "instagram"), { siteId: "site-a" });
if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
const exported = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "demo", siteName: "Demo", document: migrated.document, exportedAt: "2026-10-17T00:00:00.000Z" });
if (!exported.ok) throw new Error("fixture export failed");

let selectedRow: Record<string, unknown> | null;
let inserted: Record<string, any> | null;

function client() {
  const query: any = {
    select: () => query,
    eq: () => query,
    not: () => query,
    maybeSingle: async () => ({ data: selectedRow, error: null }),
    insert: (value: Record<string, unknown>) => {
      inserted = value;
      return { select: () => ({ single: async () => ({ data: { id: value.id, username: value.username, site_name: value.site_name, draft_version: 1 }, error: null }) }) };
    },
  };
  return { from: vi.fn(() => query) };
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => client()),
}));
vi.mock("../src/lib/access", () => ({
  SiteAccessError: class SiteAccessError extends Error {},
  requireSiteRole: vi.fn(async () => ({ siteId: "site-a", ownerId: "user-a", role: "owner" })),
}));

const { transfer } = await import("../src/routes/transfer");
const env = {} as never;
const jsonRequest = (path: string, body: unknown) => transfer.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);

describe("export and controlled import routes", () => {
  beforeEach(() => {
    inserted = null;
    selectedRow = { id: "site-a", username: "demo", site_name: "Demo", draft_document: migrated.document, published_document: migrated.document };
  });

  it("separates public export from clearly named owner backup", async () => {
    const publicResponse = await transfer.request("/public/sites/demo/export", {}, env);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("content-disposition")).toContain("published");
    expect(await publicResponse.json()).toMatchObject({ format: "retrodesk-export", scope: "public" });

    const privateResponse = await transfer.request("/sites/site-a/export?scope=draft", {}, env);
    expect(privateResponse.status).toBe(200);
    expect(privateResponse.headers.get("content-disposition")).toContain("private-backup");
    expect(await privateResponse.json()).toMatchObject({ scope: "owner-backup" });
  });

  it("requires an unchanged preview and creates a new remapped desktop", async () => {
    const previewResponse = await jsonRequest("/imports/preview", exported.value);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as { digest: string };
    const tampered = await jsonRequest(`/imports/confirm?digest=${"0".repeat(64)}&username=copy-demo&siteName=Copy`, exported.value);
    expect(tampered.status).toBe(409);
    expect(inserted).toBeNull();

    const confirmed = await jsonRequest(`/imports/confirm?digest=${preview.digest}&username=copy-demo&siteName=Copy`, exported.value);
    expect(confirmed.status).toBe(201);
    expect(inserted?.id).not.toBe("site-a");
    expect(inserted?.owner_id).toBe("user-a");
    expect(inserted?.draft_version).toBe(1);
    expect(validateSiteDocumentScope(inserted?.draft_document, inserted?.id)).toEqual([]);
  });

  it("rejects archives and declared oversized bodies before parsing", async () => {
    const archive = await transfer.request("/imports/preview", { method: "POST", headers: { "Content-Type": "application/zip" }, body: "PK" }, env);
    expect(archive.status).toBe(415);
    const oversized = await transfer.request("/imports/preview", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": String(2 * 1024 * 1024 + 1) }, body: "{}" }, env);
    expect(oversized.status).toBe(413);
  });
});
