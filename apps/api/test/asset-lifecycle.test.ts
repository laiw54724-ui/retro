import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, makeWindow } from "@retrodesk/shared";

const ownerId = "owner-local";
const siteId = "site-local";
const assetId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const oldKey = `users/${ownerId}/sites/${siteId}/${assetId}.png`;
const privateKey = `draft/${oldKey}`;
const oldUrl = `https://assets.example.invalid/${oldKey}`;
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
type Asset = Record<string, any>;
type Stored = { bytes: Uint8Array; contentType: string; ownerId?: string; siteId?: string };
let site: Record<string, any>;
let rows: Asset[];
let objects: Map<string, Stored>;
let deletedKeys: string[];
let rpc: ReturnType<typeof vi.fn>;
let copyFailureKey: string | undefined;

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  let operation = "read";
  let patch: Record<string, unknown> = {};
  let fields: string[] | undefined;
  const matches = (row: Record<string, unknown>) => filters.every(([key, value]) => row[key] === value);
  const selected = (row: Record<string, unknown>) => fields ? Object.fromEntries(fields.map((key) => [key, row[key]])) : row;
  const execute = () => {
    const found = (table === "sites" ? [site] : table === "site_assets" ? rows : []).filter(matches);
    if (operation === "update") found.forEach((row) => Object.assign(row, patch));
    if (operation === "delete") rows = rows.filter((row) => !found.includes(row));
    return { data: structuredClone(found.map(selected)), error: null };
  };
  const q = {
    select(value: string) { fields = value.split(","); return q; },
    eq(key: string, value: unknown) { filters.push([key, value]); return q; },
    update(value: Record<string, unknown>) { operation = "update"; patch = value; return q; },
    delete() { operation = "delete"; return q; },
    async maybeSingle() { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(execute()).then(resolve, reject); }
  };
  return q;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: ownerId })),
  serviceClient: vi.fn(() => ({ from: query, rpc: (...args: unknown[]) => rpc(...args) }))
}));
const { assets } = await import("../src/routes/assets");
const env = { ASSETS: {
  async head(key: string) {
    const object = objects.get(key);
    return object ? {
      size: object.bytes.length, etag: Array.from(object.bytes).join("-"),
      httpMetadata: { contentType: object.contentType }, customMetadata: { ownerId: object.ownerId, siteId: object.siteId }
    } : null;
  },
  async get(key: string) {
    const object = objects.get(key);
    return object ? {
      body: object.bytes.slice(), size: object.bytes.length, etag: Array.from(object.bytes).join("-"),
      httpMetadata: { contentType: object.contentType }, customMetadata: { ownerId: object.ownerId, siteId: object.siteId }
    } : null;
  },
  async put(key: string, value: Uint8Array, options: { onlyIf?: Headers; httpMetadata: { contentType: string }; customMetadata: { ownerId: string; siteId: string } }) {
    if (key === copyFailureKey) throw new Error("synthetic copy failure");
    if (options.onlyIf?.get("If-None-Match") === "*" && objects.has(key)) return null;
    objects.set(key, { bytes: value.slice(), contentType: options.httpMetadata.contentType, ...options.customMetadata });
    return {};
  },
  async delete(key: string) { deletedKeys.push(key); objects.delete(key); }
} } as never;

function commitMigration(args: any) {
  site.draft_version++;
  site.draft_document = args.p_document;
  for (const update of args.p_asset_updates) {
    Object.assign(rows.find((row) => row.id === update.id)!, {
      object_key: update.objectKey, public_url: update.publicUrl, storage_scope: "draft_private",
      migration_status: "pending", legacy_object_key: update.oldObjectKey, legacy_public_url: update.oldPublicUrl
    });
  }
  return { data: [{ draft_version: site.draft_version, draft_document: site.draft_document }], error: null };
}
function migrate(version = 1) {
  return assets.request(`/sites/${siteId}/assets/migrate`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: version })
  }, env);
}
function remove(id = assetId, targetSite = siteId) {
  return assets.request(`/sites/${targetSite}/assets/${id}`, { method: "DELETE" }, env);
}

beforeEach(() => {
  const document = createStarterDocument("Synthetic migration", "classic98", "blank");
  const about = makeWindow("about");
  if (about.type === "about") about.content.avatar = oldUrl;
  document.windows = [about];
  site = { id: siteId, owner_id: ownerId, draft_version: 1, draft_document: document, published_document: null, username: "local-review" };
  rows = [{ id: assetId, site_id: siteId, owner_id: ownerId, object_key: oldKey, public_url: oldUrl,
    mime_type: "image/png", size_bytes: bytes.length, kind: "image", storage_scope: "legacy_public",
    migration_status: "not_required", legacy_object_key: null, legacy_public_url: null }];
  objects = new Map([[oldKey, { bytes, contentType: "image/png" }]]);
  deletedKeys = [];
  copyFailureKey = undefined;
  rpc = vi.fn(async (_name, args) => commitMigration(args));
});

describe("migration copy ownership", () => {
  it("retains the committed copy when another same-version migration loses", async () => {
    let calls = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    rpc = vi.fn(async (_name, args) => {
      const order = ++calls;
      if (order === 2) release();
      await barrier;
      return order === 1 ? commitMigration(args) : { data: null, error: { message: "version_conflict" } };
    });
    const responses = await Promise.all([migrate(), migrate()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(rows[0].object_key).toBe(privateKey);
    expect(objects.get(privateKey)?.bytes).toEqual(bytes);
    expect(deletedKeys).not.toContain(privateKey);
  });

  it.each(["error", "throw"])("retains bytes if commit succeeds but RPC response is lost (%s)", async (mode) => {
    rpc = vi.fn(async (_name, args) => {
      commitMigration(args);
      if (mode === "throw") throw new Error("synthetic response loss");
      return { data: null, error: { message: "synthetic response loss" } };
    });
    expect((await migrate()).status).toBe(500);
    expect(rows[0].object_key).toBe(privateKey);
    expect(objects.has(privateKey)).toBe(true);
    expect(deletedKeys).toEqual([]);
  });

  it.each(["missing", "extension", "copy"])("retains earlier copies when a later asset fails (%s), then supports retry", async (failure) => {
    const secondKey = `users/${ownerId}/sites/${siteId}/${secondId}.png`;
    rows.push({ ...rows[0], id: secondId, object_key: failure === "extension" ? `${secondKey}.invalid` : secondKey, public_url: `${oldUrl}/second` });
    if (failure === "copy") {
      objects.set(secondKey, { bytes, contentType: "image/png" });
      copyFailureKey = `draft/${secondKey}`;
    }
    expect((await migrate()).status).toBe(failure === "copy" ? 502 : 400);
    expect(rpc).not.toHaveBeenCalled();
    expect(objects.get(privateKey)?.bytes).toEqual(bytes);
    expect(deletedKeys).toEqual([]);
    rows[1].object_key = secondKey;
    objects.set(secondKey, { bytes, contentType: "image/png" });
    copyFailureKey = undefined;
    expect((await migrate()).status).toBe(200);
    expect(objects.get(privateKey)?.bytes).toEqual(bytes);
  });

  it("does not overwrite or adopt an occupied destination containing different bytes", async () => {
    const other = new Uint8Array([1, 2, 3]);
    objects.set(privateKey, { bytes: other, contentType: "image/png", ownerId, siteId });
    expect((await migrate()).status).toBe(502);
    expect(objects.get(privateKey)?.bytes).toEqual(other);
    expect(objects.has(oldKey)).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(deletedKeys).toEqual([]);
  });

  it("rejects a stale version before copying", async () => {
    expect((await migrate(0)).status).toBe(409);
    expect(objects.has(privateKey)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retains a published legacy copy and reports cleanup as pending", async () => {
    site.published_document = structuredClone(site.draft_document);
    const response = await migrate();
    expect(response.status).toBe(200);
    expect((await response.json()).cleanupWarnings).toEqual([assetId]);
    expect(objects.has(oldKey)).toBe(true);
    expect(objects.has(privateKey)).toBe(true);
  });
});

describe("legacy URL deletion guard", () => {
  it.each(["draft", "published", "both"])("rejects exact legacy URL references in %s without deleting bytes or metadata", async (where) => {
    const document = site.draft_document;
    site.draft_document = where === "published" ? {} : document;
    site.published_document = where === "draft" ? null : document;
    const response = await remove();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "asset_in_use" } });
    expect(deletedKeys).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("also guards a retained legacy URL after the metadata has migrated", async () => {
    Object.assign(rows[0], { object_key: privateKey, storage_scope: "draft_private", public_url: `retro-asset:${assetId}`, legacy_public_url: oldUrl });
    objects.set(privateKey, { bytes, contentType: "image/png", ownerId, siteId });
    expect((await remove()).status).toBe(409);
    expect(deletedKeys).toEqual([]);
  });

  it.each([{}, { caption: `prefix ${oldUrl} suffix` }, { nested: [`${oldUrl}?other=1`] }])("allows unreferenced bytes but does not use substring matching (%j)", async (document) => {
    site.draft_document = document;
    expect((await remove()).status).toBe(204);
    expect(deletedKeys).toEqual([oldKey]);
    expect(rows).toEqual([]);
  });

  it("retains retro-asset reference and pending-public-copy guards", async () => {
    site.draft_document = { nested: [`retro-asset:${assetId}`] };
    expect((await remove()).status).toBe(409);
    site.draft_document = {};
    Object.assign(rows[0], { migration_status: "pending", legacy_object_key: oldKey });
    expect((await remove()).status).toBe(409);
    expect(deletedKeys).toEqual([]);
  });

  it("refuses another site's asset", async () => {
    expect((await remove(assetId, "unrelated-site")).status).toBe(404);
    expect(deletedKeys).toEqual([]);
  });
});
