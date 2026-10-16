import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0007_audio_assets.sql"), "utf8");

describe("audio asset database contract", () => {
  it("replaces the existing kind constraint and allows only image, icon, and audio", () => {
    expect(migration).toContain("drop constraint if exists site_assets_kind_check");
    expect(migration).toContain("check (kind in ('image', 'icon', 'audio'))");
  });
});
