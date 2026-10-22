# Collaboration Security 21B1 Implementation Plan

**Goal:** Add a complete backend security boundary for owner/editor/viewer site collaboration, email-bound single-use invites, immediate revocation, and audited membership changes without exposing collaboration UI yet.

**Architecture:** Keep `sites.owner_id` as the only owner source of truth and store only editor/viewer rows in `site_memberships`. All Worker routes use a request-time access resolver even though the service-role client bypasses RLS; Postgres RLS independently protects authenticated direct reads. Invite secrets are 32 random bytes returned once, while Postgres stores only a SHA-256 digest and atomically accepts or rejects a token through a service-role RPC.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Hono on Cloudflare Workers, Supabase JS, Web Crypto, Zod, Vitest.

---

### Task 1: Collaboration tables, RLS, and atomic invite acceptance

**Files:**
- Create: `supabase/migrations/0006_site_collaboration.sql`
- Create: `apps/api/test/collaboration-migration.test.ts`

- [ ] **Step 1: Write the migration contract test**

Read `0006_site_collaboration.sql` and assert that it defines `site_memberships`, `site_invites`, and `site_collaboration_audit`; enables RLS on all three; stores `token_digest` but no raw token; restricts membership roles to `editor|viewer`; and revokes the acceptance RPC from `public`, `anon`, and `authenticated` while granting only `service_role`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `npm --prefix apps/api run test:unit -- collaboration-migration.test.ts`.
Expected: FAIL because `0006_site_collaboration.sql` does not exist.

- [ ] **Step 3: Add strict tables and indexes**

Create:

```sql
create table public.site_memberships (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create table public.site_invites (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  email citext not null,
  role text not null check (role in ('editor','viewer')),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
```

Add an append-only audit table with event checks for `invite_created`, `invite_revoked`, `invite_accepted`, `member_role_changed`, and `member_removed`. Index site/user lookups and active invites.

- [ ] **Step 4: Add least-privilege RLS**

Authenticated users may select a site when they are owner or have membership. Members may select their own membership row; owners may select all rows for their site. Invite and audit rows are owner-readable only. Do not grant editor direct table updates: all mutations remain behind the Worker version/permission checks. Avoid recursive `sites ↔ site_memberships` RLS by using narrowly scoped `security definer` predicates that accept only a site id, derive the user from `auth.uid()`, use an explicit search path, and are executable only by `authenticated`/`service_role`.

- [ ] **Step 5: Add atomic acceptance RPC**

Implement `accept_site_invite(p_token_digest text, p_user_id uuid, p_email citext)` as `security definer`, lock the invite row, reject with stable exceptions `invalid_invite`, `invite_expired`, `invite_revoked`, `invite_used`, or `invite_email_mismatch`, reject owner self-membership, upsert editor/viewer membership, set accepted fields, append audit, and return site/role. Add owner-checked `create_site_invite`, `revoke_site_invite`, `update_site_member_role`, and `remove_site_member` RPCs so every membership mutation and audit row commits atomically. Revoke all collaboration mutation RPCs from `public`, `anon`, and `authenticated`; grant only `service_role`.

- [ ] **Step 6: Run focused migration tests and commit**

Run API migration test and `git diff --check`, then commit `feat: add collaboration database contract`.

### Task 2: Request-time permission resolver

**Files:**
- Create: `apps/api/src/lib/access.ts`
- Create: `apps/api/test/access.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Cover owner, editor, viewer, absent membership, missing site, database error, and a membership removed between two requests. Assert the returned value is one of:

```ts
type SiteAccess = { siteId: string; ownerId: string; role: "owner" | "editor" | "viewer" };
```

and never trusts a client-supplied role.

- [ ] **Step 2: Implement access helpers**

Add `resolveSiteAccess(client, siteId, userId)`, `requireSiteRole(...)`, and `can(role, action)` with the matrix:

```ts
const permissions = {
  owner: ["read", "write", "assets_write", "publish", "manage_members"],
  editor: ["read", "write", "assets_write"],
  viewer: ["read"]
} as const;
```

Resolve the owner from `sites`, then query membership only when the user is not owner. Map missing/removed membership to 404 to avoid leaking site existence, and database failures to 500.

- [ ] **Step 3: Run focused tests/typecheck and commit**

Run `npm --prefix apps/api run test:unit -- access.test.ts`, API typecheck, and commit `feat: enforce site collaboration roles`.

### Task 3: Apply the role matrix to site routes

**Files:**
- Modify: `apps/api/src/routes/sites.ts`
- Modify: `apps/api/src/lib/publish.ts`
- Modify: `apps/api/test/owner-boundary.test.ts`
- Create: `apps/api/test/collaboration-sites.test.ts`

- [ ] **Step 1: Write failing route matrix tests**

Verify owner/editor/viewer can GET a shared site; owner/editor can save draft; viewer cannot save; only owner can publish/retry; `/sites` returns owned and shared sites with role; removed membership immediately returns 404. Verify every write still scopes by site id and expected version.

- [ ] **Step 2: Refactor reads and draft writes**

Replace `.eq("owner_id", user.id)` authorization with `requireSiteRole` and keep the selected site id in every service-role mutation filter. Include `access_role` in GET/list responses so the web client can disable owner-only actions later. For list, combine owned sites with memberships and dedupe by site id.

- [ ] **Step 3: Preserve owner-only publication**

Require `publish` before reading/copying assets or invoking `publish_site_atomic`. Continue passing the authoritative owner id to asset copy, RPC, artifact status, and cleanup functions; never use an editor id as storage owner or `created_by` for published versions.

- [ ] **Step 4: Run focused route tests/typecheck and commit**

Run `collaboration-sites.test.ts`, `owner-boundary.test.ts`, `publish.test.ts`, API typecheck, and commit `feat: authorize shared site routes`.

### Task 4: Invite and membership lifecycle API

**Files:**
- Create: `apps/api/src/lib/invites.ts`
- Create: `apps/api/src/routes/collaboration.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/lib/site.ts`
- Create: `apps/api/test/collaboration-routes.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Cover owner create/list/revoke invite, editor forbidden from invites and role changes, expiry bounded to 15 minutes–7 days, normalized email, raw token returned once, digest-only insert, accept with matching authenticated email, wrong email, expired/revoked/used token, replay, role change, removal, owner non-removability, and audit writes.

- [ ] **Step 2: Implement token helpers and schemas**

Use Web Crypto only:

```ts
export function createInviteToken(): string;
export async function digestInviteToken(token: string): Promise<string>;
```

Generate 32 random bytes as base64url without padding. Validate token format/length before hashing. Add strict Zod schemas for email, role, expiry hours, and membership updates.

- [ ] **Step 3: Implement owner-only management routes**

Add:

```text
GET    /sites/:siteId/members
GET    /sites/:siteId/invites
POST   /sites/:siteId/invites
DELETE /sites/:siteId/invites/:inviteId
PUT    /sites/:siteId/members/:userId
DELETE /sites/:siteId/members/:userId
POST   /invites/:token/accept
```

Create/revoke/change/remove first use request-time `manage_members`, then call the matching owner-checked atomic RPC; accepted/revoked invites never expose token digests. Acceptance requires the authenticated user's verified email and calls the atomic acceptance RPC. Map stable RPC errors to non-leaking 400/403/409 responses.

- [ ] **Step 4: Run focused lifecycle tests/typecheck and commit**

Run `collaboration-routes.test.ts`, API typecheck, and commit `feat: add secure collaboration invites`.

### Task 5: Apply collaboration permissions to draft assets

**Files:**
- Modify: `apps/api/src/routes/assets.ts`
- Modify: `apps/api/test/owner-boundary.test.ts`
- Create: `apps/api/test/collaboration-assets.test.ts`

- [ ] **Step 1: Write failing asset matrix tests**

Verify owner/editor can upload/list/preview/delete draft-private assets; viewer can list/preview only; legacy migration stays owner-only; an editor's upload writes under the authoritative owner storage prefix and `site_assets.owner_id`, not the editor id; removed members immediately lose access.

- [ ] **Step 2: Refactor asset authorization and ownership**

Resolve access first. Use `access.ownerId` for R2 prefixes, custom metadata, asset row `owner_id`, and cleanup filters. Require `assets_write` for upload/delete, `read` for list/content, and owner for legacy migration. Keep exact prefix checks and existing private cache headers.

- [ ] **Step 3: Run focused asset tests/typecheck and commit**

Run `collaboration-assets.test.ts`, protected asset suites, API typecheck, and commit `feat: authorize shared draft assets`.

### Task 6: 21B1 release gate and staging API deployment

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`

- [ ] **Step 1: Review every 21B1 security invariant**

Audit all service-role queries for explicit site/user scope; confirm no route accepts role/owner from request data; token digest never appears in API responses/logs; editor cannot publish or manage membership; viewer cannot mutate; removal is checked per request; owner cannot be demoted or removed; no collaboration UI exists yet.

- [ ] **Step 2: Run the batch release gate once**

Run API/shared/web typecheck, all unit tests, full Playwright, shared/web build, API Wrangler dry-run, migration contract tests, and `git diff --check`.

- [ ] **Step 3: Apply migration and deploy Worker staging**

Run Supabase migration dry-run, apply only `0006_site_collaboration.sql`, deploy the staging Worker with `--env staging --keep-vars`, then verify API health and unauthenticated invite/site boundaries. Do not deploy Pages because 21B1 has no web runtime change.

- [ ] **Step 4: Record evidence and update Issue #21**

Append commits, test totals, migration result, Worker version and smoke evidence to verification.md. Comment that 21B1 backend security is complete but keep #21 open until 21B2 management/acceptance UI is built and validated.
