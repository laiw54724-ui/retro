import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createStarterDocument } from "@retrodesk/shared";
import { publicationAssetStageKey } from "../src/lib/publish";

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  site: {} as Row, assets: [] as Row[], versions: [] as Row[], events: [] as string[],
  rpcError: "", beforeCommit: null as null | (() => Promise<void>),
  loseCommitResponse: false,
}));

vi.mock("../src/lib/supabase", () => ({
  requireUser: async () => ({ id: "owner-a" }),
  serviceClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let changes: Row | null = null;
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        in: (_key: string, ids: string[]) => Promise.resolve({ data: state.assets.filter((row) => ids.includes(row.id)), error: null }),
        update: (value: Row) => { changes = value; return query; },
        maybeSingle: async () => {
          if (table !== "sites") return { data: null, error: null };
          if (!filters.every(([key, value]) => state.site[key] === value)) return { data: null, error: null };
          if (changes) Object.assign(state.site, changes);
          return { data: structuredClone(state.site), error: null };
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    },
    rpc: vi.fn(async (name: string, args: Row) => {
      if (name !== "publish_site_atomic") throw new Error("Unexpected fixture RPC");
      state.events.push("rpc:attempt");
      await state.beforeCommit?.();
      if (state.rpcError) return { data: null, error: { message: state.rpcError } };
      // Synchronous CAS models the SQL's site-row lock and both version checks.
      if (args.p_expected_version !== state.site.draft_version) return { data: null, error: { message: "version_conflict" } };
      if (args.p_expected_published_version !== (state.site.published_version ?? 0)) return { data: null, error: { message: "published_version_conflict" } };
      const version = (state.site.published_version ?? 0) + 1;
      state.versions.push({ version, document: structuredClone(args.p_document) });
      Object.assign(state.site, { published_version: version, published_document: structuredClone(args.p_document), published_at: "2026-10-18T00:00:00.000Z", published_artifact_status: "pending", published_artifact_key: `published/demo/versions/${version}/site.json` });
      state.events.push(`rpc:commit:${version}`);
      if (state.loseCommitResponse) return { data: null, error: { message: "synthetic_commit_response_lost" } };
      return { data: [{ published_version: version, published_at: state.site.published_at, artifact_key: state.site.published_artifact_key }], error: null };
    }),
  }),
}));

const { sites } = await import("../src/routes/sites");
const { assets } = await import("../src/routes/assets");
const app = new Hono().route("/api", sites).route("/api", assets);
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const base = "https://assets.example.invalid";
const publicKey = (index: number) => `published/demo/assets/${ids[index]}.png`;
const sourceKey = (index: number) => `draft/users/owner-a/sites/site-a/${ids[index]}.png`;
const stageKey = (index: number) => publicationAssetStageKey("site-a", `${ids[index]}.png`);
type Stored = { bytes: Uint8Array; httpMetadata: { contentType: string; cacheControl?: string } };
const objects = new Map<string, Stored>();
let beforePut: null | ((key: string) => Promise<void> | void) = null;
let beforeGet: null | ((key: string) => Promise<void> | void) = null;
function object(key: string) {
  const stored = objects.get(key);
  return stored ? { body: new Blob([stored.bytes]).stream(), size: stored.bytes.length, httpEtag: '"fixture"', httpMetadata: stored.httpMetadata, writeHttpMetadata(headers: Headers) { headers.set("Content-Type", stored.httpMetadata.contentType); } } : null;
}
const storage = {
  head: vi.fn(async (key: string) => object(key)),
  get: vi.fn(async (key: string) => { await beforeGet?.(key); return object(key); }),
  put: vi.fn(async (key: string, body: BodyInit, options: R2PutOptions = {}) => {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    await beforePut?.(key);
    const condition = options.onlyIf instanceof Headers ? options.onlyIf.get("If-None-Match") : undefined;
    if (condition === "*" && objects.has(key)) return null;
    state.events.push(`put:${key}`);
    objects.set(key, { bytes, httpMetadata: options.httpMetadata as Stored["httpMetadata"] });
    return object(key);
  }),
  delete: vi.fn(async () => { throw new Error("Publication must never delete stored objects"); }),
};
const env = { ASSETS: storage, PUBLIC_ASSET_BASE_URL: base } as never;
const publish = (version = 1) => app.request("/api/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: version }) }, env);
const retry = () => app.request("/api/sites/site-a/publish/retry", { method: "POST" }, env);
const publicWrites = () => state.events.filter((event) => event.startsWith("put:published/"));
const fixture = (count = 2) => {
  const doc = createStarterDocument("Synthetic publication", "classic98", "instagram");
  doc.windows.forEach((window, index) => { if (index < count) window.icon = `retro-asset:${ids[index]}`; });
  return doc;
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  beforePut = null;
  beforeGet = null;
  state.site = { id: "site-a", owner_id: "owner-a", username: "demo", draft_document: fixture(), draft_version: 1, published_document: null, published_version: null };
  state.assets = ids.map((id, index) => ({ id, owner_id: "owner-a", site_id: "site-a", object_key: sourceKey(index), storage_scope: "draft_private", mime_type: "image/png" }));
  state.versions = [];
  state.events = [];
  state.rpcError = "";
  state.beforeCommit = null;
  state.loseCommitResponse = false;
  objects.clear();
  ids.forEach((_, index) => objects.set(sourceKey(index), { bytes: new Uint8Array([10 + index]), httpMetadata: { contentType: "image/png" } }));
});

describe("publication commit and asset visibility", () => {
  it("keeps partial staging private when the second storage write fails", async () => {
    beforePut = (key) => { if (key === stageKey(1)) throw new Error("synthetic storage failure"); };
    expect((await publish()).status).toBe(502);
    expect(state.versions).toEqual([]);
    expect(publicWrites()).toEqual([]);
    expect(objects.has(stageKey(0))).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
    for (const key of [stageKey(0), publicKey(0)]) {
      expect((await app.request(`/api/assets/${key}`, {}, env)).status).toBe(404);
    }
  });

  it("leaves only private stages when a later source object is absent", async () => {
    objects.delete(sourceKey(1));
    expect((await publish()).status).toBe(400);
    expect(publicWrites()).toEqual([]);
    expect(state.versions).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it.each([["version_conflict", 409], ["published_version_conflict", 409], ["synthetic_db_failure", 500]] as const)("does not promote or delete after %s", async (failure, status) => {
    state.rpcError = failure;
    const response = await publish();
    expect(response.status).toBe(status);
    expect(state.versions).toEqual([]);
    expect(publicWrites()).toEqual([]);
    expect(objects.has(stageKey(0))).toBe(true);
    expect(objects.has(stageKey(1))).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("creates public bytes and the versioned artifact only after the DB commits", async () => {
    const response = await publish();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 1, artifactStatus: "synced", retryable: false });
    const commit = state.events.indexOf("rpc:commit:1");
    expect(commit).toBeGreaterThan(0);
    for (const event of publicWrites()) expect(state.events.indexOf(event)).toBeGreaterThan(commit);
    expect(state.site.published_document.windows[0].icon).toBe(`${base}/${publicKey(0)}`);
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([10]);
    expect(objects.get(publicKey(0))!.httpMetadata.contentType).toBe("image/png");
    expect(storage.delete).not.toHaveBeenCalled();
    for (const [key, , options] of storage.put.mock.calls.filter(([key]) => key.includes("/assets/"))) {
      expect(options.onlyIf, key).toBeInstanceOf(Headers);
      expect((options.onlyIf as Headers).get("If-None-Match"), key).toBe("*");
    }
  });

  it("retries a committed partial promotion from stages even after source uploads are removed", async () => {
    beforePut = (key) => { if (key === publicKey(1)) throw new Error("synthetic promotion failure"); };
    const first = await publish();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ publishedVersion: 1, artifactStatus: "failed", retryable: true, cleanupWarnings: ["publication-sync-pending"] });
    expect(state.versions).toHaveLength(1);
    expect(objects.has(publicKey(0))).toBe(true);
    expect(objects.has(publicKey(1))).toBe(false);
    expect(objects.has("published/demo/versions/1/site.json")).toBe(false);
    state.assets = [];
    objects.delete(sourceKey(0));
    objects.delete(sourceKey(1));
    beforePut = null;
    const restored = await retry();
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ publishedVersion: 1, artifactStatus: "synced", retryable: false });
    expect(state.versions).toHaveLength(1);
    expect(state.events.filter((event) => event === `put:${publicKey(0)}`)).toHaveLength(1);
    expect([...objects.get(publicKey(1))!.bytes]).toEqual([11]);
    expect(objects.has("published/demo/versions/1/site.json")).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("preserves an existing immutable public asset even if the staged bytes differ", async () => {
    objects.set(publicKey(0), { bytes: new Uint8Array([99]), httpMetadata: { contentType: "image/png" } });
    expect((await publish()).status).toBe(200);
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([99]);
    expect(storage.put.mock.calls.some(([key]) => key === publicKey(0))).toBe(false);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("recovers an acknowledged-as-error DB commit through retry without exposing bytes early or creating another version", async () => {
    state.loseCommitResponse = true;
    const response = await publish();
    expect(response.status).toBe(500);
    expect(state.site.published_version).toBe(1);
    expect(publicWrites()).toEqual([]);
    expect((await app.request(`/api/assets/${publicKey(0)}`, {}, env)).status).toBe(404);
    state.loseCommitResponse = false;
    expect((await retry()).status).toBe(200);
    expect(state.versions).toHaveLength(1);
    expect(state.site.published_artifact_status).toBe("synced");
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([10]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("uses an atomic create-only put if a public key appears after the head check", async () => {
    beforePut = (key) => {
      if (key === publicKey(0)) objects.set(key, { bytes: new Uint8Array([88]), httpMetadata: { contentType: "image/png" } });
    };
    expect((await publish()).status).toBe(200);
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([88]);
    expect(state.events).not.toContain(`put:${publicKey(0)}`);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("lets only one concurrent publisher commit the same draft and never rolls back its bytes", async () => {
    const both = deferred();
    let arrivals = 0;
    state.beforeCommit = async () => { if (++arrivals === 2) both.resolve(); await both.promise; };
    const responses = await Promise.all([publish(), publish()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(state.versions).toHaveLength(1);
    expect(state.site.published_version).toBe(1);
    expect(state.site.published_artifact_status).toBe("synced");
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([10]);
    expect([...objects.get(publicKey(1))!.bytes]).toEqual([11]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("does not let a slow older publication replace the newer version's status or immutable assets", async () => {
    const oldPaused = deferred();
    const releaseOld = deferred();
    let paused = false;
    beforeGet = async (key) => {
      if (key === stageKey(0) && !paused) { paused = true; oldPaused.resolve(); await releaseOld.promise; }
    };
    state.site.draft_document = fixture(1);
    const old = publish();
    await oldPaused.promise;
    const newer = fixture();
    newer.windows[0].icon = "camera";
    state.site.draft_document = newer;
    state.site.draft_version = 2;
    expect((await publish(2)).status).toBe(200);
    expect(state.site.published_version).toBe(2);
    releaseOld.resolve();
    const oldResponse = await old;
    expect(oldResponse.status).toBe(200);
    expect(await oldResponse.json()).toMatchObject({ publishedVersion: 1, artifactStatus: "failed", retryable: true, warning: expect.stringContaining("stale") });
    expect(state.versions.map((row) => row.version)).toEqual([1, 2]);
    expect(state.site.published_version).toBe(2);
    expect(state.site.published_artifact_status).toBe("synced");
    expect([...objects.get(publicKey(0))!.bytes]).toEqual([10]);
    expect([...objects.get(publicKey(1))!.bytes]).toEqual([11]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("retries an old committed snapshot whose public files already exist, without requiring stages", async () => {
    await publish();
    objects.delete(stageKey(0));
    objects.delete(stageKey(1));
    state.assets = [];
    storage.get.mockClear();
    const response = await retry();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ artifactStatus: "synced", publishedVersion: 1 });
    expect(storage.get).not.toHaveBeenCalled();
    expect(state.versions).toHaveLength(1);
  });
});
