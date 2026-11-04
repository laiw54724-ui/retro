import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createStarterDocument, migrateSiteDocumentV2, type VersionedSiteDocumentInput } from "@retrodesk/shared";
import { appearanceWriteBlocked, requiresAppearanceContract } from "../src/lib/appearanceCompatibility";

function legacy() { return structuredClone(createStarterDocument("Appearance", "classic98", "card")); }
function canonical() {
  const result = migrateSiteDocumentV2(legacy(), { siteId: "site-a" });
  if (!result.ok || result.version !== 2) throw new Error("fixture");
  return result.document;
}
function withP2<T extends VersionedSiteDocumentInput>(document: T): T {
  const result = structuredClone(document);
  result.theme.appearance = { titleText: "#ffffff", frameColor: "#112233", contentBackground: "#eeddcc", contentText: "#331122", desktopLabelText: "#ffffff", desktopLabelBackground: "#000000", titleGradient: false };
  result.windows[0].appearance = { titleText: "#ffeecc", contentText: "#223344" };
  return result;
}
const state = {
  row: { id: "site-a", owner_id: "owner-a", username: "appearance", site_name: "Appearance", draft_version: 1, draft_document: canonical() as VersionedSiteDocumentInput },
  writes: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], selections: [] as string[],
  beforeCommit: null as null | (() => Promise<void>), authenticated: true, allowed: true
};
function query() {
  let pending: Record<string, unknown> | undefined;
  let insert: Record<string, unknown> | undefined;
  const filters: Record<string, unknown> = {};
  const q = {
    select: (columns: string) => { state.selections.push(columns); return q; },
    eq: (column: string, value: unknown) => { filters[column] = value; return q; },
    update: (value: Record<string, unknown>) => { pending = value; return q; },
    insert: (value: Record<string, unknown>) => { insert = value; return q; },
    single: async () => { if (insert) state.inserts.push(insert); return { data: insert, error: null }; },
    maybeSingle: async () => {
      if (pending) {
        const before = state.beforeCommit; state.beforeCommit = null;
        await before?.();
        if (filters.draft_version !== undefined && filters.draft_version !== state.row.draft_version) return { data: null, error: null };
        state.writes.push(pending);
        Object.assign(state.row, pending);
        return { data: { draft_version: state.row.draft_version, updated_at: "2026-10-19T00:00:00Z" }, error: null };
      }
      if (filters.username) return { data: null, error: null };
      return { data: structuredClone(state.row), error: null };
    }
  };
  return q;
}
vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => state.authenticated ? { id: "owner-a" } : new Response("Unauthorized", { status: 401 })),
  serviceClient: vi.fn(() => ({ from: () => query() }))
}));
vi.mock("../src/lib/access", () => {
  class SiteAccessError extends Error { status = 403; code = "forbidden"; }
  return { SiteAccessError, requireSiteRole: vi.fn(async () => { if (!state.allowed) throw new SiteAccessError("Forbidden"); return { siteId: "site-a", ownerId: "owner-a", role: "owner" }; }) };
});
const { sites } = await import("../src/routes/sites");
const env = {} as never;
function save(document: unknown, capability?: unknown, expectedVersion = 1) {
  return sites.request("/sites/site-a/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document, expectedVersion, ...(capability === undefined ? {} : { clientAppearanceContract: capability }) }) }, env);
}

beforeEach(() => {
  state.row.draft_document = canonical(); state.row.draft_version = 1;
  state.writes = []; state.inserts = []; state.selections = []; state.beforeCommit = null;
  state.authenticated = true; state.allowed = true;
});

describe("raw appearance dependency", () => {
  it.each([{ theme: { appearance: {} } }, { theme: { appearance: null } }, { windows: [{ appearance: {} }] }, { windows: [{ appearance: { titleFrom: "#112233" } }] }, { windows: [{ appearance: { titleFrom: "#112233", titleTo: "#334455", titleText: undefined } }] }])("detects property presence/partial contract without defaults: %j", (raw) => {
    expect(requiresAppearanceContract(raw)).toBe(true);
  });
  it("leaves old full titles and missing appearances compatible", () => {
    expect(requiresAppearanceContract(legacy())).toBe(false);
    expect(requiresAppearanceContract({ windows: [{ appearance: { titleFrom: "#112233", titleTo: "#334455", titleGradient: false } }] })).toBe(false);
    expect(appearanceWriteBlocked(legacy(), withP2(canonical()), undefined)).toBe(true);
  });
  it("detects fields that frozen legacy v1 strips and old strict v2 rejects", () => {
    const old = z.object({ titleFrom: z.string(), titleTo: z.string(), titleGradient: z.boolean().default(true) });
    const newAppearance = { titleFrom: "#112233", titleTo: "#223344", titleText: "#ffffff" };
    expect(old.parse(newAppearance)).not.toHaveProperty("titleText");
    expect(old.strict().safeParse(newAppearance).success).toBe(false);
    expect(requiresAppearanceContract({ windows: [{ appearance: newAppearance }] })).toBe(true);
  });
});

describe("API preservation contract", () => {
  it.each([undefined, 0, 2, "1", null])("rejects a current-version stripped save with capability %j without changing stored data", async (capability) => {
    state.row.draft_document = withP2(canonical());
    const before = JSON.stringify(state.row);
    const stripped = canonical();
    const response = await save(stripped, capability);
    expect(response.status).toBe(426);
    expect(await response.json()).toMatchObject({ error: { code: "client_upgrade_required" } });
    expect(JSON.stringify(state.row)).toBe(before);
    expect(state.writes).toHaveLength(0);
    expect(state.selections).toContain("id,draft_version,draft_document");
  });
  it.each([legacy, canonical])("rejects raw incoming P2 but permits capable preservation and deliberate full reset", async (makeDocument) => {
    const p2 = withP2(makeDocument());
    expect((await save(p2)).status).toBe(426);
    expect((await save(p2, 1)).status).toBe(200);
    expect(state.row.draft_document).toEqual(p2);
    const reset = structuredClone(p2);
    delete reset.theme.appearance;
    for (const window of reset.windows) delete window.appearance;
    expect((await save(reset, 1, 2)).status).toBe(200);
    expect(state.row.draft_document).toEqual(reset);
    expect(state.row.draft_document.theme.appearance).toBeUndefined();
    expect(state.row.draft_document.windows[0].appearance).toBeUndefined();
  });
  it("keeps legacy saves working and capability cannot bypass schema/auth/access", async () => {
    expect((await save(canonical())).status).toBe(200);
    expect((await save({ schemaVersion: 2 }, 1, 2)).status).toBe(400);
    state.authenticated = false;
    expect((await save(withP2(canonical()), 1, 2)).status).toBe(401);
    state.authenticated = true; state.allowed = false;
    expect((await save(withP2(canonical()), 1, 2)).status).toBe(403);
    expect(state.writes).toHaveLength(1);
  });
  it("retains the conditional version CAS when the first P2 write wins a race", async () => {
    const p2 = withP2(canonical());
    state.beforeCommit = async () => { expect((await save(p2, 1)).status).toBe(200); };
    const old = await save(canonical());
    expect(old.status).toBe(409);
    expect(state.row.draft_document).toEqual(p2);
    expect(state.row.draft_version).toBe(2);
    expect(state.writes).toHaveLength(1);
  });
  it("guards raw creation before persistence and never stores transport metadata", async () => {
    const create = (document: unknown, capability?: unknown) => sites.request("/sites", { method: "POST", body: JSON.stringify({ username: "new-site", siteName: "New", document, clientAppearanceContract: capability }) }, env);
    const document = withP2(legacy());
    expect((await create(document)).status).toBe(426);
    expect(state.inserts).toHaveLength(0);
    expect((await create(document, 1)).status).toBe(201);
    expect(state.inserts[0]).not.toHaveProperty("clientAppearanceContract");
    expect(state.inserts[0].draft_document).toEqual(document);
  });
  it("advertises compatibility only on an authenticated fresh site load", async () => {
    const result = await sites.request("/sites/site-a", {}, env);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await result.json()).toMatchObject({ site: { id: "site-a", writeCompatibility: { appearanceP2: 1 } } });
    state.authenticated = false;
    expect((await sites.request("/sites/site-a", {}, env)).status).toBe(401);
  });
});
