import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRetroExport, createStarterDocument, makeWindow, migrateSiteDocumentV2, validateSiteDocumentScope } from "@retrodesk/shared";

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
const jsonRequest = (path: string, body: unknown) => transfer.request(path + (path.includes("?") ? "&" : "?") + "clientAppearanceContract=1", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, env);

describe("export and controlled import routes", () => {
  beforeEach(() => {
    inserted = null;
    selectedRow = { id: "site-a", username: "demo", site_name: "Demo", draft_document: migrated.document, published_document: migrated.document };
  });

  it.each(["preview", "confirm"])("rejects an unverified import %s even after all appearance fields were stripped", async (endpoint) => {
    for (const marker of ["", "?clientAppearanceContract=2", "?clientAppearanceContract=01"]) {
      const response = await transfer.request(`/imports/${endpoint}${marker}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exported.value) }, env);
      expect(response.status).toBe(426);
      expect(await response.json()).toMatchObject({ error: { code: "client_upgrade_required" } });
      expect(inserted).toBeNull();
    }
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

  it("rebinds legacy Explorer shortcuts to the new imported site before migration", async () => {
    const legacy = createStarterDocument("Legacy", "classic98", "blank");
    const gallery = makeWindow("gallery", 0);
    const explorer = makeWindow("explorer", 1);
    if (explorer.type !== "explorer") throw new Error("Explorer fixture");
    explorer.content.shortcuts = [{ id: "shortcut", label: "Gallery", icon: "pixelart:heart", parentId: null, order: 0, visibility: "published", target: { siteId: "site-a", kind: "window", id: gallery.id } }];
    legacy.windows = [gallery, explorer];
    const packageResult = createRetroExport({ scope: "owner-backup", siteId: "site-a", username: "demo", siteName: "Legacy", document: legacy });
    if (!packageResult.ok) throw new Error("legacy export");
    const previewResponse = await jsonRequest("/imports/preview", packageResult.value);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json() as { digest: string };
    const confirmed = await jsonRequest(`/imports/confirm?digest=${preview.digest}&username=legacy-copy&siteName=Copy`, packageResult.value);
    expect(confirmed.status).toBe(201);
    expect(inserted?.draft_document.windows[1].content.shortcuts[0]).toMatchObject({ icon: "pixelart:heart", target: { siteId: inserted?.id, id: gallery.id } });
    expect(validateSiteDocumentScope(inserted?.draft_document, inserted?.id)).toEqual([]);
    expect(migrateSiteDocumentV2(inserted?.draft_document, { siteId: inserted?.id })).toMatchObject({ ok: true });
  });

  it("requires re-upload acknowledgement for private icons even when the package hides missing media", async () => {
    const value = structuredClone(exported.value);
    const reference = "retro-asset:22222222-2222-4222-8222-222222222222";
    value.document.windows[0].icon = reference;
    value.mediaManifest.items = [];
    value.mediaManifest.missing = [];
    const response = await jsonRequest("/imports/preview", value);
    expect(response.status).toBe(200);
    const preview = await response.json() as { digest: string; preview: { missingMedia: unknown[] } };
    expect(preview.preview.missingMedia).toHaveLength(1);
    const url = `/imports/confirm?digest=${preview.digest}&username=icon-copy&siteName=Icons`;
    const denied = await jsonRequest(url, value);
    expect(denied.status).toBe(409);
    expect(await denied.json()).toMatchObject({ error: { code: "missing_media_confirmation" } });
    expect(inserted).toBeNull();
    const accepted = await jsonRequest(`${url}&allowMissingMedia=true`, value);
    expect(accepted.status).toBe(201);
    expect(inserted?.draft_document.windows[0].icon).toBe(reference);
    // Confirmation acknowledges missing bytes; it never copies or publishes a private asset.
    expect(inserted?.published_document).toBeUndefined();
  });

  it("rejects archives and declared oversized bodies before parsing", async () => {
    const archive = await transfer.request("/imports/preview?clientAppearanceContract=1", { method: "POST", headers: { "Content-Type": "application/zip" }, body: "PK" }, env);
    expect(archive.status).toBe(415);
    const oversized = await transfer.request("/imports/preview?clientAppearanceContract=1", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": String(2 * 1024 * 1024 + 1) }, body: "{}" }, env);
    expect(oversized.status).toBe(413);
  });
});
