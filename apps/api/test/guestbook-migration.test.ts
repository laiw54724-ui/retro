import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0009_moderated_guestbook.sql"), "utf8");

describe("moderated guestbook migration contract", () => {
  it("keeps entries and reports outside site documents with restricted tables", () => {
    expect(migration).toContain("create table public.guestbook_entries");
    expect(migration).toContain("create table public.guestbook_reports");
    for (const table of ["guestbook_entries", "guestbook_reports"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on public.${table} from public, anon, authenticated`);
      expect(migration).toContain(`grant select, insert, update, delete on public.${table} to service_role`);
    }
    expect(migration).not.toMatch(/\bemail\b|attachment|html/i);
  });

  it("enforces pending moderation, idempotency and atomic frequency limits", () => {
    expect(migration).toContain("default 'pending'");
    expect(migration).toContain("unique (site_id, request_id)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("guestbook_rate_limited");
    expect(migration).toContain("published_document");
    expect(migration).toContain("guestbook_disabled");
  });

  it("exposes submission and reporting only to the service role", () => {
    for (const name of ["submit_guestbook_entry", "report_guestbook_entry"]) {
      expect(migration).toContain(`create or replace function public.${name}`);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
    }
  });
});
