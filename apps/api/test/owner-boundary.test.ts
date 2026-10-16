import { beforeEach, describe, expect, it, vi } from "vitest";

const filters: Array<[string, unknown]> = [];

function fakeQuery(table: string) {
  const query = {
    select: () => query,
    eq: (field: string, value: unknown) => {
      filters.push([field, value]);
      return query;
    },
    maybeSingle: async () => {
      const id = filters.findLast(([field]) => field === "id")?.[1];
      if (table === "site_memberships") return { data: null, error: null };
      const allowed = id === "site-a";
      return {
        data: allowed
          ? {
              id: "site-a",
              owner_id: "user-a",
              username: "owner",
              site_name: "Owner site",
              draft_document: {},
              draft_version: 1,
              published_document: null,
              published_version: null,
              published_at: null,
              updated_at: new Date(0).toISOString()
            }
          : null,
        error: null
      };
    }
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  requireUser: vi.fn(async () => ({ id: "user-a", email: "a@example.com" })),
  serviceClient: vi.fn(() => ({
    from: vi.fn((table: string) => fakeQuery(table))
  }))
}));

const { sites } = await import("../src/routes/sites");
const { assets } = await import("../src/routes/assets");

describe("owner-scoped API boundaries", () => {
  beforeEach(() => {
    filters.length = 0;
  });

  it("does not return another user's site by guessed site id", async () => {
    const response = await sites.request("/sites/site-b", {}, {} as never);
    expect(response.status).toBe(404);
    expect(filters).toContainEqual(["id", "site-b"]);
    expect(filters).not.toContainEqual(["owner_id", "user-a"]);
  });

  it("does not allow media upload into another user's site", async () => {
    const response = await assets.request("/sites/site-b/assets", { method: "POST" }, {} as never);
    expect(response.status).toBe(404);
    expect(filters).toContainEqual(["id", "site-b"]);
    expect(filters).toContainEqual(["owner_id", "user-a"]);
  });
});
