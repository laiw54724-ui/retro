import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2, type VersionedSiteDocumentInput } from "@retrodesk/shared";
import { imageWriteBlocked, requiresImageWindowContract } from "../src/lib/imageCompatibility";

function canonical(image = false) {
  const legacy = createStarterDocument("Image", "classic98", "card");
  if (image) legacy.windows.push(makeWindow("image"));
  const result = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!result.ok || result.version !== 2) throw new Error("fixture");
  return result.document;
}
const state = { row: { id: "site-a", owner_id: "owner-a", draft_document: canonical() as VersionedSiteDocumentInput, draft_version: 1 }, writes: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], beforeCommit: null as null | (() => Promise<void>), authenticated: true, allowed: true };
function query() {
  let pending: Record<string, unknown> | undefined, insert: Record<string, unknown> | undefined;
  const filters: Record<string, unknown> = {};
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => { filters[key] = value; return q; },
    update: (value: Record<string, unknown>) => { pending = value; return q; },
    insert: (value: Record<string, unknown>) => { insert = value; return q; },
    single: async () => { if (insert) state.inserts.push(insert); return { data: insert, error: null }; },
    maybeSingle: async () => {
      if (pending) {
        const before = state.beforeCommit; state.beforeCommit = null; await before?.();
        if (filters.draft_version !== state.row.draft_version) return { data: null, error: null };
        state.writes.push(pending); Object.assign(state.row, pending);
        return { data: { draft_version: state.row.draft_version }, error: null };
      }
      return { data: filters.username ? null : structuredClone(state.row), error: null };
    }
  }; return q;
}
vi.mock("../src/lib/supabase", () => ({ requireUser: vi.fn(async () => state.authenticated ? { id: "owner-a" } : new Response("Unauthorized", { status: 401 })), serviceClient: vi.fn(() => ({ from: () => query() })) }));
vi.mock("../src/lib/access", () => {
  class SiteAccessError extends Error { status = 403; code = "forbidden"; }
  return { SiteAccessError, requireSiteRole: vi.fn(async () => { if (!state.allowed) throw new SiteAccessError("Forbidden"); return { siteId: "site-a", ownerId: "owner-a", role: "owner" }; }) };
});
const { sites } = await import("../src/routes/sites");
const save = (document: unknown, contract?: unknown, expectedVersion = 1, appearance?: unknown) => sites.request("/sites/site-a/draft", { method: "PUT", body: JSON.stringify({ document, expectedVersion, clientImageWindowContract: contract, clientAppearanceContract: appearance }) }, {} as never);
beforeEach(() => { state.row.draft_document = canonical(); state.row.draft_version = 1; state.writes = []; state.inserts = []; state.beforeCommit = null; state.authenticated = true; state.allowed = true; });

describe("independent raw image preservation contract", () => {
  it("detects the raw discriminant even when content is invalid, without confusing document image blocks", () => {
    expect(requiresImageWindowContract({ windows: [{ type: "image", content: null }] })).toBe(true);
    expect(requiresImageWindowContract({ windows: [{ type: "document", content: { blocks: [{ kind: "image" }] } }] })).toBe(false);
    expect(imageWriteBlocked({}, { windows: [{ type: "image" }] }, undefined)).toBe(true);
  });
  it.each([undefined, null, false, 0, 2, "1"])("rejects stripped current-version saves without exact image contract %j", async (contract) => {
    state.row.draft_document = canonical(true); const before = structuredClone(state.row);
    expect((await save(canonical(), contract)).status).toBe(426);
    expect(state.row).toEqual(before); expect(state.writes).toHaveLength(0);
  });
  it("guards incoming images before parsing and lets a capable client preserve or intentionally remove them", async () => {
    expect((await save({ windows: [{ type: "image", content: null }] })).status).toBe(426);
    expect((await save({ windows: [{ type: "image", content: null }] }, 1)).status).toBe(400);
    expect((await save(canonical(true), 1)).status).toBe(200);
    expect(state.row.draft_document.windows.at(-1)?.type).toBe("image");
    expect((await save(canonical(), 1, 2)).status).toBe(200);
    expect(state.row.draft_document).not.toHaveProperty("clientImageWindowContract");
  });
  it("keeps legacy saves and independent appearance protection, authentication and access intact", async () => {
    expect((await save(canonical())).status).toBe(200);
    const both = canonical(true); both.theme.appearance = { titleText: "#ffffff" };
    expect((await save(both, 1, 2)).status).toBe(426);
    expect((await save(both, undefined, 2, 1)).status).toBe(426);
    expect((await save(both, 1, 2, 1)).status).toBe(200);
    state.authenticated = false; expect((await save(both, 1, 3, 1)).status).toBe(401);
    state.authenticated = true; state.allowed = false; expect((await save(both, 1, 3, 1)).status).toBe(403);
  });
  it("preserves the version CAS when an image save wins against a stale stripped writer", async () => {
    const image = canonical(true);
    state.beforeCommit = async () => { expect((await save(image, 1)).status).toBe(200); };
    expect((await save(canonical())).status).toBe(409);
    expect(state.row.draft_document).toEqual(image); expect(state.row.draft_version).toBe(2); expect(state.writes).toHaveLength(1);
  });
  it("guards raw creation and advertises separate response metadata without persisting contracts", async () => {
    const document = createStarterDocument("Image", "classic98", "card"); document.windows.push(makeWindow("image"));
    const create = (contract?: number) => sites.request("/sites", { method: "POST", body: JSON.stringify({ username: "image-new", siteName: "Image", document, clientImageWindowContract: contract }) }, {} as never);
    expect((await create()).status).toBe(426); expect(state.inserts).toHaveLength(0);
    expect((await create(1)).status).toBe(201); expect(state.inserts[0]).not.toHaveProperty("clientImageWindowContract");
    const loaded = await sites.request("/sites/site-a", {}, {} as never);
    expect(loaded.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await loaded.json()).toMatchObject({ site: { writeCompatibility: { appearanceP2: 1, imageWindow: 1 } } });
  });
});
