import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0004_protected_draft_assets.sql"), "utf8");

describe("protected draft asset migration contract", () => {
  it("labels legacy rows and constrains storage state", () => {
    expect(migration).toContain("storage_scope text not null default 'legacy_public'");
    expect(migration).toContain("migration_status text not null default 'not_required'");
    expect(migration).toContain("legacy_public");
    expect(migration).toContain("draft_private");
  });

  it("uses an owner-locked versioned migration RPC", () => {
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/where id = p_site_id and owner_id = p_owner_id for update/);
    expect(migration).toContain("v_site.draft_version <> p_expected_version");
    expect(migration).toContain("migrate_site_assets_private");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("to service_role");
  });

  it("validates exact update identity, namespaces, references, and cardinality", () => {
    expect(migration).toContain("invalid_asset_update");
    expect(migration).toContain("duplicate_asset_update");
    expect(migration).toContain("oldObjectKey");
    expect(migration).toContain("oldPublicUrl");
    expect(migration).toContain("v_old_prefix");
    expect(migration).toContain("v_new_prefix");
    expect(migration).toContain("v_id::text || E'\\\\.(jpg|png|webp|gif)$'");
    expect(migration).toContain("invalid_asset_reference");
    expect(migration).toContain("if v_count <> v_expected");
  });
});
