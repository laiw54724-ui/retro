import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0003_atomic_publish.sql"), "utf8");

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
});
