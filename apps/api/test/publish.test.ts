import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  site: {
    id: "site-a", owner_id: "user-a", username: "demo", site_name: "Demo", draft_document: { schemaVersion: 1, siteName: "Demo", theme: { id: "classic98", name: "Classic", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#0a0a0a", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" }, windows: [], mobileColumns: 4 }, draft_version: 2, published_version: null
  },
  rpcError: null as { message: string } | null,
  artifactError: false,
  committed: [{ published_version: 4, published_at: "2026-10-16T00:00:00.000Z", artifact_key: "published/demo/versions/4/site.json" }],
  updates: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  updateError: null as { message: string } | null,
  updateNoMatch: false,
  requestUser: { id: "user-a" }
};
const baseDocument = state.site.draft_document;

function query(result: unknown, table = "sites") {
  let ownerFilter = "";
  let updateMode = false;
  const q = {
    select: () => q,
    eq: (field: string, value: string) => { if (field === "owner_id") ownerFilter = value; return q; },
    maybeSingle: async () => table === "site_memberships"
      ? ({ data: null, error: null })
      : ({ data: updateMode ? (state.updateNoMatch ? null : { id: "site-a" }) : (ownerFilter && ownerFilter !== state.site.owner_id ? null : result), error: updateMode ? state.updateError : null }),
    update: (value: Record<string, unknown>) => { state.updates.push(value); updateMode = true; return q; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: state.updateError }).then(resolve)
  };
  return q;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => state.requestUser),
  serviceClient: vi.fn(() => ({
    from: vi.fn((table: string) => query(state.site, table)),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => { state.rpcCalls.push({ name, args }); return { data: state.committed, error: state.rpcError }; })
  }))
}));

const { sites } = await import("../src/routes/sites");

describe("atomic publication API", () => {
  beforeEach(() => { state.site = { ...state.site, draft_document: baseDocument, published_document: undefined, published_version: null, published_at: undefined, published_artifact_key: undefined }; state.requestUser = { id: "user-a" }; state.rpcError = null; state.artifactError = false; state.updates.length = 0; state.rpcCalls.length = 0; state.updateError = null; state.updateNoMatch = false; });

  it("projects before calling the atomic RPC and writes a versioned immutable artifact", async () => {
    const put = vi.fn(async () => undefined);
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 4, artifactStatus: "synced", retryable: false });
    expect(put).toHaveBeenCalledWith("published/demo/versions/4/site.json", expect.any(String), expect.objectContaining({ httpMetadata: expect.objectContaining({ cacheControl: "public, max-age=31536000, immutable" }), customMetadata: { site: "demo", version: "4" } }));
    expect(state.updates).toContainEqual({ published_artifact_status: "synced", published_artifact_error: null });
    expect(state.rpcCalls[0]).toMatchObject({ name: "publish_site_atomic", args: { p_site_id: "site-a", p_owner_id: "user-a", p_expected_version: 2, p_expected_published_version: 0 } });
    expect(JSON.parse(String(put.mock.calls[0][1])).document).toEqual(state.site.draft_document);
  });

  it("keeps the DB publication and reports a retryable failed artifact", async () => {
    const put = vi.fn(async () => { throw new Error("r2 down"); });
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 4, artifactStatus: "failed", retryable: true });
    expect(state.updates).toContainEqual({ published_artifact_status: "failed", published_artifact_error: "r2 down" });
  });

  it("does not call the RPC for an invalid or unsupported v2 draft", async () => {
    state.site.draft_document = { schemaVersion: 2 };
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put: vi.fn() } } as never);
    expect(response.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
    state.site.draft_document = { schemaVersion: 99 };
    const unsupported = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put: vi.fn() } } as never);
    expect(unsupported.status).toBe(400);
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("maps the atomic expected-version conflict without touching R2", async () => {
    state.rpcError = { message: "version_conflict" };
    const put = vi.fn();
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });

  it("maps the atomic published-version conflict from a concurrent publisher", async () => {
    state.rpcError = { message: "published_version_conflict" };
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put: vi.fn() } } as never);
    expect(response.status).toBe(409);
    expect(state.rpcCalls[0].args).toMatchObject({ p_expected_published_version: 0 });
  });

  it("returns a retryable response when the committed status update fails", async () => {
    state.updateError = { message: "status update unavailable" };
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put: vi.fn(async () => undefined) } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 4, artifactStatus: "failed", retryable: true });
  });

  it("does not report synced when a publish status update matches zero rows", async () => {
    state.updateNoMatch = true;
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put: vi.fn(async () => undefined) } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ artifactStatus: "failed", retryable: true, warning: expect.stringContaining("stale") });
  });

  it("retries the current committed version and key without invoking publish RPC", async () => {
    state.site = { ...state.site, published_document: state.site.draft_document, published_version: 4, published_at: "2026-10-16T00:00:00.000Z", published_artifact_key: "published/demo/versions/4/site.json" };
    const put = vi.fn(async () => undefined);
    const response = await sites.request("/sites/site-a/publish/retry", { method: "POST" }, { ASSETS: { put } } as never);
    expect(response.status).toBe(200);
    expect(state.rpcCalls).toHaveLength(0);
    expect(put).toHaveBeenCalledWith("published/demo/versions/4/site.json", expect.any(String), expect.any(Object));
  });

  it("does not retry another owner's committed artifact", async () => {
    state.requestUser = { id: "user-b" };
    const put = vi.fn();
    const response = await sites.request("/sites/site-a/publish/retry", { method: "POST" }, { ASSETS: { put } } as never);
    expect(response.status).toBe(404);
    expect(put).not.toHaveBeenCalled();
  });

  it("does not report synced when retry status update matches zero rows", async () => {
    state.site = { ...state.site, published_document: state.site.draft_document, published_version: 4, published_at: "2026-10-16T00:00:00.000Z", published_artifact_key: "published/demo/versions/4/site.json" };
    state.updateNoMatch = true;
    const response = await sites.request("/sites/site-a/publish/retry", { method: "POST" }, { ASSETS: { put: vi.fn(async () => undefined) } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ artifactStatus: "failed", retryable: true, warning: expect.stringContaining("stale") });
  });
});
