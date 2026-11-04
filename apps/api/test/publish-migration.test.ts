import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanupPendingLegacyAssets } from "../src/routes/sites";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0003_atomic_publish.sql"), "utf8");
const sitesSource = readFileSync(resolve(process.cwd(), "src/routes/sites.ts"), "utf8");

describe("atomic publish migration contract", () => {
  it("stores constrained artifact state and versioned keys", () => {
    expect(migration).toContain("published_artifact_status text not null default 'none'");
    expect(migration).toContain("published_artifact_key text");
    expect(migration).toContain("published_artifact_error text");
    expect(migration).toContain("in ('none', 'pending', 'synced', 'failed')");
    expect(migration).toContain("published/%s/versions/%s/site.json");
  });

  it("locks the owner row, checks the draft version, inserts one version, and advances the pointer", () => {
    expect(migration).toMatch(/owner_id\s*=\s*p_owner_id[\s\S]*for update/);
    expect(migration).toContain("v_site.draft_version <> p_expected_version");
    expect(migration).toContain("p_expected_published_version integer");
    expect(migration).toContain("published_version_conflict");
    expect(migration).toContain("insert into public.site_versions");
    expect(migration).toContain("unique(site_id, version)");
    expect(migration).toContain("published_document = p_document");
    expect(migration).toContain("published_version = v_version");
    expect(migration).toContain("published_artifact_status = 'pending'");
  });

  it("uses a restricted security-definer RPC with an explicit search path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_catalog");
    expect(migration).toContain("revoke all on function public.publish_site_atomic");
    expect(migration).toContain("grant execute on function public.publish_site_atomic(uuid, uuid, integer, integer, jsonb)");
    expect(migration).toContain("to service_role");
  });

  it("cleans pending legacy objects after both publish paths and reports warnings", () => {
    expect(sitesSource).toContain("async function cleanupPendingLegacyAssets");
    expect(sitesSource.match(/cleanupPendingLegacyAssets\(c\.env, supabase/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sitesSource).toContain("inventory-unavailable");
    expect(sitesSource).toContain("cleanupWarnings");
  });

  it("does not delete a legacy object still referenced by the live document", async () => {
    const deleted: string[] = [];
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: "a", legacy_object_key: "users/a", legacy_public_url: "https://old/a.png" }], error: null }) }) }) }) }) } as any;
    const warnings = await cleanupPendingLegacyAssets({ ASSETS: { delete: async (key: string) => { deleted.push(key); } } } as any, supabase, "site", "owner", { image: "https://old/a.png" });
    expect(deleted).toEqual([]);
    expect(warnings).toEqual(["a"]);
  });

  it("deletes a legacy object when the new live document no longer references it", async () => {
    const deleted: string[] = [];
    const updated: any[] = [];
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: "a", legacy_object_key: "users/a", legacy_public_url: "https://old/a.png" }], error: null }) }) }) }), update: (value: unknown) => ({ eq: () => ({ eq: async () => { updated.push(value); return { error: null }; } }) }) }) } as any;
    const warnings = await cleanupPendingLegacyAssets({ ASSETS: { delete: async (key: string) => { deleted.push(key); } } } as any, supabase, "site", "owner", { image: "https://new/a.png" });
    expect(warnings).toEqual([]);
    expect(deleted).toEqual(["users/a"]);
    expect(updated).toHaveLength(1);
  });
});
