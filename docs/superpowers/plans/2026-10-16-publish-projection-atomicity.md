# #18B1 public projection and atomic publish implementation plan

**Goal:** Make Postgres the authoritative published source, publish exactly one server-built public projection atomically, and track/retry the versioned R2 artifact without reporting a partial sync as fully complete.

**Architecture:** Add a pure shared `projectPublicSiteDocument` boundary for v1/v2. The Worker validates and projects the draft, then calls one Postgres RPC that locks the site row, checks the expected draft version, inserts the immutable version, advances the published pointer, and records artifact status `pending` in one transaction. R2 writes use a versioned key and are awaited. The DB-backed public API remains authoritative; R2 success/failure is recorded separately and can be retried idempotently.

**Cloudflare constraints:** Use the existing R2 binding, await every correctness-critical operation, and do not call Cloudflare REST from the Worker. The response depends on the initial R2 attempt/status, so it is not placed in `waitUntil`.

---

## Task 1: Build and test the public projection

**Files:**
- Add: `packages/shared/src/public-projection.ts`
- Add: `packages/shared/test/public-projection.test.ts`
- Modify: `packages/shared/src/index.ts`

1. Accept unknown input plus current `siteId`; dispatch through the versioned parser and reject invalid/unknown versions with diagnostics.
2. For v1, return the validated current document because v1 has no private entity visibility.
3. For v2, include only `visibility: published` profiles/posts, discard posts whose author is not published, discard Instagram windows whose profile is not published, and remove window-target links to discarded windows.
4. Validate the final projection structurally and semantically. Never mutate the draft.
5. Test private profile/post names and media URLs are absent from serialized projection, cross-site refs fail, v1 remains compatible, and repeated projection is deterministic.

## Task 2: Add the atomic database publish contract

**Files:**
- Add: `supabase/migrations/0003_atomic_publish.sql`
- Add: `apps/api/test/publish-migration.test.ts`

1. Add published artifact status/key/error columns with constrained states: `none`, `pending`, `synced`, `failed`.
2. Add `publish_site_atomic` RPC. Lock the owner-scoped site row, compare `expectedVersion`, compute the next published version, insert `site_versions`, update `sites.published_document` and pointer/status, and return the committed version/time in the same transaction.
3. Give the function an explicit `search_path`, revoke public execution, and grant only the server role needed by the Worker deployment.
4. Add a migration contract test for row locking, owner/version checks, unique version insertion, pointer update, and execution grants. Runtime API tests in Task 3 verify conflict mapping.

## Task 3: Publish the projection and versioned R2 artifact

**Files:**
- Modify: `apps/api/src/routes/sites.ts`
- Add: `apps/api/src/lib/publish.ts`
- Add: `apps/api/test/publish.test.ts`
- Modify: `apps/api/test/public-site.test.ts`

1. Build the projection server-side before the RPC; invalid drafts return diagnostics and do not call publish.
2. Replace the read/insert/update sequence with `publish_site_atomic`.
3. Write `published/<username>/versions/<version>/site.json` with immutable cache metadata and version/site custom metadata. Await the write and then owner/version-scope the artifact status update.
4. On R2 failure, retain the committed DB publication, record `failed`, and return a truthful retryable status rather than claiming the artifact synced.
5. Add an owner-only retry endpoint that reads the current committed projection/version and idempotently rewrites the same versioned key.
6. Keep `GET /public/sites/:username` DB-backed with `no-store`; it must never read an alias that could lag the pointer.
7. Test projection use, atomic RPC arguments, two-publisher conflict mapping, R2 failure state, status-update failure behavior, retry ownership/idempotence, and public endpoint source.

## Task 4: Surface partial artifact sync in the editor

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `tests/e2e/editor-layout.spec.ts`

1. Type the publish result with `artifactStatus: synced | failed` and a retryable flag.
2. Keep the public-site link available after the DB commit, but show a clear warning when the CDN artifact failed and offer retry without republishing.
3. Add E2E coverage for synced success and failed-then-retry UX.

## Task 5: Verification and staged rollout

1. Run focused shared/API/web tests, migration contract test, root unit/typecheck/full E2E/build, and `git diff --check`.
2. Complete independent spec, quality, and final reviews and fix findings.
3. Apply migration to staging before deploying the staging Worker. If database or Worker deployment credentials are unavailable, do not deploy a mismatched half; record the exact blocker and keep current staging runtime unchanged.
4. Smoke Worker health, publish conflict/failure paths where safe, Pages canonical/immutable routes, and append Issue #18 evidence. Keep #18 open for 18B2 protected draft assets.

## Non-goals

- Draft asset privacy/path migration is the next #18B2 milestone.
- No Queue/Workflow dependency in this small first release; versioned R2 retry is explicit and idempotent.
- No public SEO/export endpoint yet; those consumers must later read the same committed projection.
- No v2 editor write activation.
