import { describe, expect, it, vi } from "vitest";

const id = "11111111-1111-4111-8111-111111111111";
const doc = { schemaVersion: 1, siteName: "Demo", theme: { id: "x", name: "x", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#000000", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" }, windows: [{ id: "w", title: "w", icon: "x", layout: { desktop: { x: 0, y: 0, w: 300, h: 200, z: 1 }, mobile: { order: 0 } }, defaultOpen: true, type: "document", content: { blocks: [{ id: "b", kind: "image", src: `retro-asset:${id}`, srcUrl: "", alt: "" }] } }], mobileColumns: 4 };
const rpc = vi.fn();

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a" })),
  serviceClient: vi.fn(() => ({ from: vi.fn((table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => table === "sites" ? ({ data: { id: "site-a", owner_id: "user-a", username: "demo", site_name: "Demo", draft_document: doc, draft_version: 2, published_version: null }, error: null }) : ({ data: null, error: null }), in: async () => ({ data: [], error: null }), update: () => query };
    return query;
  }), rpc }))
}));

const { sites } = await import("../src/routes/sites");

describe("publish asset route boundary", () => {
  it("does not call atomic publish when a referenced asset is missing", async () => {
    const response = await sites.request("/sites/site-a/publish", { method: "POST", body: JSON.stringify({ expectedVersion: 2 }) }, { PUBLIC_ASSET_BASE_URL: "https://assets.example", ASSETS: { get: vi.fn(), put: vi.fn() } } as never);
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
