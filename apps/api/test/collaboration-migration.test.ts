import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "../../supabase/migrations/0006_site_collaboration.sql"), "utf8");

describe("site collaboration migration contract", () => {
  it("defines constrained membership, digest-only invite, and append-only audit tables", () => {
    expect(migration).toContain("create table public.site_memberships");
    expect(migration).toContain("create table public.site_invites");
    expect(migration).toContain("create table public.site_collaboration_audit");
    expect(migration).toMatch(/role text not null check \(role in \('editor', 'viewer'\)\)/);
    expect(migration).toContain("token_digest text not null unique");
    expect(migration).not.toMatch(/raw_token|plain(?:text)?_token/i);
    expect(migration).toContain("invite_created");
    expect(migration).toContain("member_removed");
  });

  it("enables RLS and grants authenticated users read-only collaboration access", () => {
    for (const table of ["site_memberships", "site_invites", "site_collaboration_audit"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("create or replace function public.can_read_site");
    expect(migration).toContain("create or replace function public.is_site_owner");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("grant select on public.site_memberships to authenticated");
    expect(migration).toContain("revoke insert, update, delete on public.site_memberships from authenticated");
    expect(migration).toContain("create policy \"members can read shared sites\"");
  });

  it("accepts invitations exactly once with row locking and stable rejection codes", () => {
    expect(migration).toContain("create or replace function public.accept_site_invite");
    expect(migration).toMatch(/token_digest = p_token_digest[\s\S]*for update/);
    for (const code of ["invalid_invite", "invite_expired", "invite_revoked", "invite_used", "invite_email_mismatch", "owner_cannot_join"]) {
      expect(migration).toContain(code);
    }
    expect(migration).toContain("on conflict (site_id, user_id) do update");
    expect(migration).toContain("invite_accepted");
  });

  it("keeps every collaboration mutation and audit record in a restricted RPC", () => {
    const functions = ["create_site_invite", "revoke_site_invite", "accept_site_invite", "update_site_member_role", "remove_site_member"];
    for (const name of functions) {
      expect(migration).toContain(`create or replace function public.${name}`);
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
    }
    expect(migration).toContain("member_role_changed");
    expect(migration).toContain("member_removed");
  });
});
