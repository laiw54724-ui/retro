import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createStarterDocument, migrateSiteDocumentV2, projectPublicSiteDocument } from "@retrodesk/shared";
import { publishedArtifactKey } from "../src/lib/publish";

// Query-local filters and column selection are deliberate: an omitted site/owner
// predicate or accidental draft selection must change the observed test result.
type Row = Record<string, any>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, writes: [] as string[] }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, options: any) => ({
    auth: { getUser: async () => {
      const token = options.global?.headers.Authorization?.replace(/^Bearer /, "");
      const id = ["owner-a", "editor-a", "viewer-a", "owner-b"].includes(token) ? token : null;
      return { data: { user: id ? { id, email: `${id}@example.invalid` } : null }, error: null };
    } },
    from: (table: string) => {
      const predicates: Array<(row: Row) => boolean> = [];
      let columns = "*";
      let update: Row | undefined;
      let insertion: Row | undefined;
      let deleting = false;
      const execute = () => {
        const rows = state.tables[table] ?? [];
        if (insertion) { rows.push(structuredClone(insertion)); state.writes.push(`insert:${table}`); }
        const matches = rows.filter((row) => predicates.every((predicate) => predicate(row)));
        if (update) { matches.forEach((row) => Object.assign(row, structuredClone(update))); state.writes.push(`update:${table}`); }
        if (deleting) { state.tables[table] = rows.filter((row) => !matches.includes(row)); state.writes.push(`delete:${table}`); }
        return { data: matches.map((row) => columns === "*" ? structuredClone(row) : Object.fromEntries(columns.split(",").map((key) => [key, structuredClone(row[key])]))), error: null };
      };
      const query: any = {
        select: (value: string) => { columns = value; return query; },
        eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
        not: (key: string, _operator: string, value: unknown) => { predicates.push((row) => row[key] !== value); return query; },
        order: () => query,
        limit: () => query,
        update: (value: Row) => { update = value; return query; },
        insert: (value: Row) => { insertion = value; return query; },
        delete: () => { deleting = true; return query; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        then: (resolve: (result: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
    rpc: vi.fn(async (name: string, args: Row) => {
      state.writes.push(`rpc:${name}`);
      if (name !== "publish_site_atomic") throw new Error(`Unexpected fixture RPC: ${name}`);
      const site = state.tables.sites.find((row) => row.id === args.p_site_id && row.owner_id === args.p_owner_id);
      if (!site) return { data: null, error: { message: "site_not_found" } };
      if (site.draft_version !== args.p_expected_version) return { data: null, error: { message: "version_conflict" } };
      site.published_document = structuredClone(args.p_document);
      site.published_version = (site.published_version ?? 0) + 1;
      site.published_at = "2026-10-18T00:00:00.000Z";
      return { data: [{ published_version: site.published_version, published_at: site.published_at }], error: null };
    }),
  }),
}));

const { sites } = await import("../src/routes/sites");
const { assets } = await import("../src/routes/assets");
const { collaboration } = await import("../src/routes/collaboration");
const { transfer } = await import("../src/routes/transfer");
const routes = new Hono().route("/", sites).route("/", assets).route("/", collaboration).route("/", transfer);
const app = new Hono().route("/api", routes);
const assetId = "11111111-1111-4111-8111-111111111111";
const privateName = "UNPUBLISHED-NAME-ONLY-IN-DRAFT";
const publishedName = "Published desktop";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const objects = new Map<string, Uint8Array>();
function storedObject(key: string) {
  const bytes = objects.get(key);
  return bytes ? { body: new Blob([bytes]).stream(), size: bytes.length, httpEtag: '"fixture"', writeHttpMetadata(headers: Headers) { headers.set("Content-Type", "image/png"); } } : null;
}
const storage = {
  get: vi.fn(async (key: string) => storedObject(key)),
  head: vi.fn(async (key: string) => storedObject(key)),
  put: vi.fn(async (key: string, body: BodyInit, options: R2PutOptions = {}) => {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    if (options.onlyIf instanceof Headers && options.onlyIf.get("If-None-Match") === "*" && objects.has(key)) return null;
    objects.set(key, bytes);
    return storedObject(key);
  }),
  delete: vi.fn(async (key: string) => { objects.delete(key); }),
};
const env = { SUPABASE_URL: "https://db.example.invalid", SUPABASE_ANON_KEY: "fixture-anon", SUPABASE_SERVICE_ROLE_KEY: "fixture-service", ASSETS: storage, PUBLIC_ASSET_BASE_URL: "https://assets.example.invalid" } as never;

function request(path: string, identity: string | null = null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (identity) headers.set("Authorization", `Bearer ${identity}`);
  return app.request(`/api${path}`, { ...init, headers }, env);
}

function draft(version: 1 | 2 = 2) {
  const v1 = createStarterDocument(publishedName, "classic98", "instagram");
  if (version === 1) return v1;
  const migrated = migrateSiteDocumentV2(v1, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  return migrated.document;
}

beforeEach(() => {
  vi.clearAllMocks();
  objects.clear();
  objects.set(`draft/users/owner-a/sites/site-a/${assetId}.png`, png);
  const document = draft();
  const projected = projectPublicSiteDocument(document, "site-a");
  if (!projected.ok) throw new Error("fixture projection failed");
  state.tables = {
    sites: [{ id: "site-a", owner_id: "owner-a", username: "demo", site_name: publishedName, draft_document: document, draft_version: 1, published_document: projected.document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" },
      { id: "site-b", owner_id: "owner-b", username: "other", site_name: "Other draft", draft_document: createStarterDocument("Other draft", "classic98", "blank"), draft_version: 1, published_document: null }],
    site_memberships: [{ site_id: "site-a", user_id: "editor-a", role: "editor" }, { site_id: "site-a", user_id: "viewer-a", role: "viewer" }],
    site_assets: [{ id: assetId, site_id: "site-a", owner_id: "owner-a", object_key: `draft/users/owner-a/sites/site-a/${assetId}.png`, public_url: `retro-asset:${assetId}`, mime_type: "image/png", size_bytes: png.length, kind: "image", storage_scope: "draft_private", migration_status: "not_required" }],
    site_invites: [],
  };
  state.writes.length = 0;
});

describe("published snapshot name isolation", () => {
  it.each([1, 2] as const)("isolates every public name surface for stored v%s snapshots", async (version) => {
    const document = draft(version);
    state.tables.sites[0].published_document = document;
    state.tables.sites[0].site_name = privateName;
    for (const path of ["/public/sites/demo", "/public/sites/demo/metadata", "/public/sites/demo/export", "/sites/site-a/export?scope=published"]) {
      const response = await request(path, path.startsWith("/sites/") ? "owner-a" : null);
      expect(response.status, path).toBe(200);
      expect.soft(await response.text(), path).not.toContain(privateName);
    }
  });

  it.each([1, 2] as const)("keeps saved v%s draft names out of public JSON, metadata and export until publish", async (version) => {
    const document = draft(version);
    state.tables.sites[0].draft_document = structuredClone(document);
    const projected = projectPublicSiteDocument(document, "site-a");
    if (!projected.ok) throw new Error("fixture projection failed");
    state.tables.sites[0].published_document = projected.document;
    document.siteName = privateName;
    expect((await request("/sites/site-a/draft", "owner-a", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) })).status).toBe(200);
    const loaded = await request("/sites/site-a", "owner-a");
    expect(await loaded.json()).toMatchObject({ site: { site_name: privateName, draft_document: { siteName: privateName }, published_document: { siteName: publishedName } } });

    for (const path of ["/public/sites/demo", "/public/sites/demo/metadata", "/public/sites/demo/export", "/sites/site-a/export?scope=published"]) {
      const response = await request(path, path.startsWith("/sites/") ? "owner-a" : null);
      expect(response.status, path).toBe(200);
      const text = await response.text();
      expect(text, path).not.toContain(privateName);
      expect(text, path).toContain(publishedName);
      expect(response.headers.get("cache-control"), path).toBe(path.includes("/export") ? "private, no-store" : "no-store");
    }
    const backup = await request("/sites/site-a/export", "owner-a");
    expect(backup.status).toBe(200);
    expect(await backup.text()).toContain(privateName);
    const publish = await request("/sites/site-a/publish", "owner-a", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) });
    expect(publish.status).toBe(200);
    expect(storage.put).toHaveBeenCalled();
    for (const path of ["/public/sites/demo", "/public/sites/demo/metadata", "/public/sites/demo/export"]) {
      const response = await request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(privateName);
    }
  });

  it("projects private entities, collections and their asset references out of publication and sharing", async () => {
    const document = draft();
    if (document.schemaVersion !== 2) throw new Error("v2 fixture required");
    const profile = document.entities.profiles[0];
    const hidden = { ...structuredClone(profile), id: "private-profile", handle: "hidden", username: "hidden", displayName: "PRIVATE-PROFILE-FIXTURE", visibility: "draft" as const, avatar: `retro-asset:${assetId}`, avatarUrl: "https://example.invalid/PRIVATE-AVATAR-FIXTURE" };
    document.entities.profiles.push(hidden);
    document.entities.posts.push({ kind: "post", id: "private-post", siteId: "site-a", visibility: "draft", authorProfileId: hidden.id, title: "PRIVATE-POST-FIXTURE", src: `retro-asset:${assetId}`, srcUrl: "", caption: "", href: "", location: "", date: "", likes: 0, comments: [], extra: [] } as any);
    document.entities.collections.push({ kind: "collection", id: "private-collection", siteId: "site-a", ownerProfileId: hidden.id, visibility: "draft", title: "PRIVATE-COLLECTION-FIXTURE", description: "", postIds: ["private-post"] });
    const before = structuredClone(document);
    state.tables.sites[0].draft_document = document;
    const response = await request("/sites/site-a/publish", "owner-a", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) });
    expect(response.status).toBe(200);
    expect(state.tables.sites[0].draft_document).toEqual(before);
    expect(storage.get).not.toHaveBeenCalled();
    for (const [, body] of storage.put.mock.calls) {
      expect(typeof body).toBe("string");
      expect(body).not.toContain("PRIVATE-");
      expect(body).not.toContain(assetId);
    }
    for (const path of ["/public/sites/demo", "/public/sites/demo/metadata", "/public/sites/demo/export"]) {
      const publicResponse = await request(path);
      expect(publicResponse.status).toBe(200);
      const text = await publicResponse.text();
      expect(text).not.toContain("PRIVATE-");
      expect(text).not.toContain(assetId);
    }
    for (const target of ["kind=oc&id=private-profile", "kind=post&id=private-post"]) {
      expect((await request(`/public/sites/demo/metadata?${target}`)).status).toBe(404);
    }
    const owner = await request("/sites/site-a", "owner-a");
    expect(await owner.text()).toContain("PRIVATE-PROFILE-FIXTURE");
  });

  it("never serves an unpublished site through public JSON, metadata or export", async () => {
    for (const path of ["/public/sites/other", "/public/sites/other/metadata", "/public/sites/other/export"]) {
      expect((await request(path)).status).toBe(404);
    }
    expect(state.writes).toEqual([]);
  });
});

describe("API identity and site boundaries", () => {
  it.each(["owner-a", "editor-a", "viewer-a"])("allows authorized %s to read the saved draft", async (identity) => {
    const response = await request("/sites/site-a", identity);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ site: { draft_document: { siteName: publishedName }, access_role: identity.split("-")[0] } });
  });

  const protectedRequests = [
    ["GET", "/sites/site-a", undefined],
    ["PUT", "/sites/site-a/draft", () => ({ expectedVersion: 1, document: draft() })],
    ["POST", "/sites/site-a/publish", () => ({ expectedVersion: 1 })],
    ["POST", "/sites/site-a/publish/retry", undefined],
    ["GET", "/sites/site-a/assets", undefined],
    ["GET", `/sites/site-a/assets/${assetId}/content`, undefined],
    ["HEAD", `/sites/site-a/assets/${assetId}/content`, undefined],
    ["POST", "/sites/site-a/assets", undefined],
    ["DELETE", `/sites/site-a/assets/${assetId}`, undefined],
    ["POST", "/sites/site-a/assets/migrate", () => ({ expectedVersion: 1 })],
    ["GET", "/sites/site-a/members", undefined],
    ["GET", "/sites/site-a/invites", undefined],
    ["GET", "/sites/site-a/export", undefined],
  ] as const;
  it.each(protectedRequests)("denies unrelated/anonymous/invalid identities for %s %s without data or side effects", async (method, path, body) => {
    const before = structuredClone(state.tables);
    for (const identity of ["owner-b", null, "invalid-session"]) {
      const response = await request(path, identity, { method, body: body ? JSON.stringify(body()) : undefined });
      expect(response.status, `${identity}: ${path}`).toBe(identity === "owner-b" ? 404 : 401);
      expect(await response.text()).not.toContain(publishedName);
    }
    expect(state.tables).toEqual(before);
    expect(state.writes).toEqual([]);
    for (const operation of Object.values(storage)) expect(operation).not.toHaveBeenCalled();
  });

  it("cannot reuse site-a membership to read or write site-b", async () => {
    for (const identity of ["owner-a", "editor-a", "viewer-a"]) {
      expect((await request("/sites/site-b", identity)).status).toBe(404);
      const document = createStarterDocument("Other draft", "classic98", "blank");
      expect((await request("/sites/site-b/draft", identity, { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) })).status).toBe(404);
    }
    expect(state.writes).toEqual([]);
  });

  it.each(["editor-a", "viewer-a"])("denies publish, retry, member administration and owner backup to %s", async (identity) => {
    for (const [method, path, body] of protectedRequests.filter(([, path]) => /publish|members|invites|export|migrate/.test(path))) {
      const response = await request(path, identity, { method, body: body ? JSON.stringify(body()) : undefined });
      expect(response.status, path).toBe(403);
    }
    expect(state.writes).toEqual([]);
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("allows editor autosave, rejects viewer autosave and stale versions, and re-reads exact saved content", async () => {
    const document = draft();
    document.siteName = privateName;
    expect((await request("/sites/site-a/draft", "viewer-a", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) })).status).toBe(403);
    expect(state.writes).toEqual([]);
    expect((await request("/sites/site-a/draft", "editor-a", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document }) })).status).toBe(200);
    expect((await request("/sites/site-a/draft", "owner-a", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, document: draft() }) })).status).toBe(409);
    const loaded = await request("/sites/site-a", "editor-a");
    expect(await loaded.json()).toMatchObject({ site: { draft_version: 2, draft_document: document } });
    expect(state.writes).toEqual(["update:sites"]);
  });

  it("removes collaborator draft and asset access on the next request after revocation", async () => {
    expect((await request("/sites/site-a", "viewer-a")).status).toBe(200);
    state.tables.site_memberships = [];
    expect((await request("/sites/site-a", "viewer-a")).status).toBe(404);
    expect((await request(`/sites/site-a/assets/${assetId}/content`, "viewer-a")).status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
  });
});

describe("asset boundary failures", () => {
  // Original F2 regression: retain both assertions after the staging/commit fix.
  it("failed publication must not leave a publicly readable asset (F2 regression #76)", async () => {
    const document = draft(1);
    document.windows[0].icon = `retro-asset:${assetId}`;
    document.windows[1].icon = "retro-asset:22222222-2222-4222-8222-222222222222";
    state.tables.sites[0].draft_document = document;
    const before = structuredClone(state.tables.sites[0].published_document);
    const response = await request("/sites/site-a/publish", "owner-a", { method: "POST", body: JSON.stringify({ expectedVersion: 1 }) });
    expect(response.status).toBe(400);
    expect(state.tables.sites[0].published_document).toEqual(before);
    const anonymous = await request(`/assets/published/demo/assets/${assetId}.png`);
    expect.soft(anonymous.status).toBe(404);
    expect(storage.put.mock.calls.map(([key]) => key)).toEqual([]);
  });

  it.each(["owner-a", "editor-a", "viewer-a"])("authorizes %s before private GET/HEAD/range and marks responses private", async (identity) => {
    for (const init of [{}, { method: "HEAD" }, { headers: { Range: "bytes=0-3" } }]) {
      const response = await request(`/sites/site-a/assets/${assetId}/content`, identity, init);
      expect(response.status).toBe("headers" in init ? 206 : 200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("rejects a foreign asset ID and private raw path without reading storage", async () => {
    state.tables.site_assets[0].site_id = "site-b";
    expect((await request(`/sites/site-a/assets/${assetId}/content`, "owner-a")).status).toBe(404);
    expect((await request("/assets/draft/users/owner-a/sites/site-a/fixture.png")).status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("rejects viewer upload/deletion and foreign storage prefixes without mutations", async () => {
    expect((await request("/sites/site-a/assets", "viewer-a", { method: "POST" })).status).toBe(403);
    expect((await request(`/sites/site-a/assets/${assetId}`, "viewer-a", { method: "DELETE" })).status).toBe(403);
    state.tables.site_assets[0].object_key = `draft/users/owner-b/sites/site-b/${assetId}.png`;
    expect((await request(`/sites/site-a/assets/${assetId}/content`, "owner-a")).status).toBe(404);
    expect((await request(`/sites/site-a/assets/${assetId}`, "owner-a", { method: "DELETE" })).status).toBe(404);
    expect(state.writes).toEqual([]);
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("rejects harmless MIME mismatch and oversize fixtures before storage writes", async () => {
    const body = new FormData();
    body.set("file", new File(["plain fixture text"], "fixture.png", { type: "image/png" }));
    expect((await request("/sites/site-a/assets", "editor-a", { method: "POST", body })).status).toBe(415);
    expect((await request("/sites/site-a/assets", "owner-a", { method: "POST", headers: { "Content-Length": String(18 * 1024 * 1024 + 1) } })).status).toBe(413);
    expect(state.writes).toEqual([]);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it.each([["image", 8, "image/png"], ["audio", 16, "audio/mpeg"]] as const)("enforces the %s file size limit without a Content-Length header", async (kind, megabytes, mime) => {
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", new File([new Uint8Array(megabytes * 1024 * 1024 + 1)], "oversize-fixture", { type: mime }));
    const response = await request("/sites/site-a/assets", "owner-a", { method: "POST", body });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "file_too_large" } });
    expect(state.writes).toEqual([]);
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe("artifact destination isolation (F3)", () => {
  function committedOwnSite() {
    Object.assign(state.tables.sites[0], {
      published_document: createStarterDocument("Site A public fixture", "classic98", "blank"),
      published_version: 1,
      published_at: "2026-10-18T00:00:00.000Z",
    });
  }

  it.each([
    "published/other/versions/9/site.json",
    "published/demo/../other/versions/9/site.json",
    "published/%6fther/versions/9/site.json",
    "published/demo/versions/9/site.json",
    "https://assets.example.invalid/published/other/versions/9/site.json",
    "draft/users/owner-b/sites/site-b/victim.png",
  ])("ignores an owner-editable artifact key %s and preserves site B", async (untrustedKey) => {
    committedOwnSite();
    state.tables.sites[0].published_artifact_key = untrustedKey;
    const victim = new TextEncoder().encode("SITE-B-ARTIFACT-FIXTURE");
    objects.set(untrustedKey, victim);
    const response = await request("/sites/site-a/publish/retry", "owner-a", { method: "POST" });
    expect(response.status).toBe(200);
    expect.soft(objects.get(untrustedKey)).toEqual(victim);
    expect.soft(await response.json()).toMatchObject({ artifactKey: "published/demo/versions/1/site.json", artifactStatus: "synced" });
    expect(storage.put.mock.calls.map(([key]) => key)).toEqual(["published/demo/versions/1/site.json"]);
  });

  it("preserves the old artifact after a valid handle rename and derives the new destination", async () => {
    committedOwnSite();
    const original = new TextEncoder().encode("ORIGINAL-PUBLISHED-FIXTURE");
    objects.set("published/demo/versions/1/site.json", original);
    Object.assign(state.tables.sites[0], { username: "renamed", published_artifact_key: "published/demo/versions/1/site.json" });
    const response = await request("/sites/site-a/publish/retry", "owner-a", { method: "POST" });
    expect(response.status).toBe(200);
    expect.soft(objects.get("published/demo/versions/1/site.json")).toEqual(original);
    expect(await response.json()).toMatchObject({ artifactKey: "published/renamed/versions/1/site.json", artifactStatus: "synced" });
  });

  it("never overwrites another site's historical artifact even if owner-edited handle/version point at its canonical key", async () => {
    committedOwnSite();
    Object.assign(state.tables.sites[0], { username: "reused-handle", published_version: 9, published_artifact_key: null });
    const destination = "published/reused-handle/versions/9/site.json";
    const victim = new TextEncoder().encode(JSON.stringify({ username: "reused-handle", version: 9, publishedAt: "2026-10-17T00:00:00.000Z", document: { siteName: "SITE-B-HISTORICAL-FIXTURE" } }));
    objects.set(destination, victim);
    const response = await request("/sites/site-a/publish/retry", "owner-a", { method: "POST" });
    expect(response.status).toBe(200);
    expect.soft(objects.get(destination)).toEqual(victim);
    expect(await response.json()).toMatchObject({ artifactStatus: "failed", retryable: true });
  });

  it.each(["demo/../other", "%6fther", "demo%2fother", "demo\\other", "Demo", " demo"])("rejects noncanonical storage usernames without decoding: %s", (username) => {
    expect(() => publishedArtifactKey(username, 1)).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648])("rejects invalid artifact versions: %s", (version) => {
    expect(() => publishedArtifactKey("demo", version)).toThrow();
  });
});
