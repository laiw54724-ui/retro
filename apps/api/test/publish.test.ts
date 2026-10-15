import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  site: {
    id: "site-a", owner_id: "user-a", username: "demo", site_name: "Demo", draft_document: { schemaVersion: 1, siteName: "Demo", theme: { id: "classic98", name: "Classic", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#0a0a0a", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" }, windows: [], mobileColumns: 4 }, draft_version: 2, published_version: null
  },
  rpcError: null as { message: string } | null,
  artifactError: false,
  committed: [{ published_version: 4, published_at: "2026-10-16T00:00:00.000Z", artifact_key: "published/demo/versions/4/site.json" }],
  updates: [] as Array<Record<string, unknown>>
};

function query(result: unknown) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: result, error: null }),
    update: (value: Record<string, unknown>) => { state.updates.push(value); return q; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  };
  return q;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => ({
    from: vi.fn(() => query(state.site)),
    rpc: vi.fn(async () => ({ data: state.committed, error: state.rpcError }))
  }))
}));

const { sites } = await import("../src/routes/sites");

describe("atomic publication API", () => {
  beforeEach(() => { state.rpcError = null; state.artifactError = false; state.updates.length = 0; });

  it("projects before calling the atomic RPC and writes a versioned immutable artifact", async () => {
    const put = vi.fn(async () => undefined);
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 4, artifactStatus: "synced", retryable: false });
    expect(put).toHaveBeenCalledWith("published/demo/versions/4/site.json", expect.any(String), expect.objectContaining({ httpMetadata: expect.objectContaining({ cacheControl: "public, max-age=31536000, immutable" }), customMetadata: { site: "demo", version: "4" } }));
    expect(state.updates).toContainEqual({ published_artifact_status: "synced", published_artifact_error: null });
  });

  it("keeps the DB publication and reports a retryable failed artifact", async () => {
    const put = vi.fn(async () => { throw new Error("r2 down"); });
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ publishedVersion: 4, artifactStatus: "failed", retryable: true });
    expect(state.updates).toContainEqual({ published_artifact_status: "failed", published_artifact_error: null });
  });

  it("maps the atomic expected-version conflict without touching R2", async () => {
    state.rpcError = { message: "version_conflict" };
    const put = vi.fn();
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { ASSETS: { put } } as never);
    expect(response.status).toBe(409);
    expect(put).not.toHaveBeenCalled();
  });
});
