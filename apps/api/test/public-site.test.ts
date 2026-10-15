import { describe, expect, it, vi } from "vitest";

function fakeQuery() {
  const query = {
    select: () => query,
    eq: () => query,
    not: () => query,
    maybeSingle: async () => ({
      data: {
        username: "demo",
        site_name: "Demo",
        published_document: { schemaVersion: 1 },
        published_version: 2,
        published_at: "2026-10-16T00:00:00.000Z"
      },
      error: null
    })
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(),
  serviceClient: vi.fn(() => ({ from: vi.fn(() => fakeQuery()) }))
}));

const { sites } = await import("../src/routes/sites");

describe("public site freshness", () => {
  it("prevents browsers and intermediaries from serving a stale published document", async () => {
    const response = await sites.request("/public/sites/demo", {}, { get ASSETS() { throw new Error("public endpoint must not read R2"); } } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
