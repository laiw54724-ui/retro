# API boundary review — #76

## Scope and execution plan

Author: Codex task-3. Base: `386c209dd8cb47bae96a749a7751cc7189032183`
(`integration/retro-preview-r1-r3`, fetched before work). Excludes #77 and
other worktrees. Repository/ancestor AGENTS.md files were not present;
`~/.codex/AGENTS.md` was empty.

Authorized write paths: `apps/api/src/routes/sites.ts`,
`apps/api/src/routes/transfer.ts`, `apps/api/test/security-*.test.ts`, this report.
No shared schema, frontend, CSP, CI, credentials, migrations or production changes.

Design: retain the existing published snapshot and API response contracts. Public
names must come from that snapshot, while the owner draft and private backup keep
the latest saved name. Fix the public read boundary rather than changing autosave
or persistence. A schema migration or rewriting old snapshots would add avoidable
compatibility risk. Tests use real Hono handlers, authentication parsing and access
checks, with local in-memory identity/database/storage doubles only.

- [x] Fetch, verify remote/base and claim independent paths in #55.
- [x] Run existing API tests on the unchanged base.
- [x] Reproduce draft-name disclosure through public reads with synthetic fixtures.
- [x] Run owner/editor/viewer/unrelated/anonymous API boundary cases.
- [x] Apply one bounded fix; run API/shared regressions and typecheck/lint.
- [x] Record results, limitations and final integration checks.

Delivery is a Draft PR with this report; acceptance remains blocked by F2.

Full contributor/browser gates belong to the final integrator. These tests do not
validate deployed Supabase RLS, R2 policies, Cloudflare headers or real accounts.

## Findings

### F1 — confirmed and fixed: unpublished name disclosed by public reads

Affected code: `apps/api/src/routes/sites.ts` autosave (lines 160–166), public
JSON (268–282), metadata (285–314), and `apps/api/src/routes/transfer.ts`
public/published export (36–61). `site_name` tracks the latest saved draft;
the immutable publication has its own `siteName`.

Identity: owner A saves, anonymous reads. Minimal reproduction, for both v1/v2:

1. Store a published snapshot with `siteName: "Published desktop"`.
2. Autosave draft name `UNPUBLISHED-NAME-ONLY-IN-DRAFT`, version 1 → 2.
3. Read public JSON, site metadata, public export, and owner published export.

Before: each surface included the unpublished marker despite the stored public
snapshot still having the old name. The public metadata title could change while
its `published:1:site` cache tag stayed unchanged. Owner draft reads correctly
returned the new name.

After: public queries no longer select mutable `site_name`; names derive from
`published_document.siteName`. The public JSON field remains named `site_name`.
Public exports use the snapshot name; owner draft backup keeps its latest name.
After an authorized publish, the new name appears on all public surfaces.
No persisted data, version reader or export format was changed.

Evidence: `security-api-boundaries.test.ts` contains separate surface checks plus
actual save/read/publish round trips for both versions. Original name cases were
RED on the base; all are now GREEN. Fixtures are fabricated, not real user data.

### F2 — confirmed, unresolved P1 candidate: failed publish leaves a public asset

**Integration/release blocker. The API suite is intentionally RED for this risk.**

Affected unchanged code: `apps/api/src/lib/publish.ts:24–42` copies assets inside
the validation loop; `apps/api/src/routes/sites.ts:205–212` invokes it before
the atomic DB publication; `apps/api/src/routes/assets.ts:236–239` serves the
published namespace anonymously without consulting committed publications.

Identity: owner A triggers publish; anonymous subsequently requests the asset.
Controlled reproduction is retained as the unskipped test
`failed publication must not leave a publicly readable asset (known blocker #76)`:

1. Use two harmless icon references in an owner-owned draft. The first points to
   an owner/site-matching private PNG fixture; the second has no asset row.
2. Publish expected version 1.
3. Handler returns `400 publish_assets_failed`, DB public snapshot is unchanged,
   and the atomic publish RPC is never reached.
4. Nevertheless a public R2 write has already completed for the first asset.
5. Anonymous GET through the real asset route returns 200 instead of expected 404.

Observed local evidence:

```text
publish status: 400
published_document: unchanged
public writes: [published/demo/assets/11111111-1111-4111-8111-111111111111.png]
anonymous asset GET: 200 (expected 404)
cache policy written: public, max-age=31536000, immutable
```

The test uses an in-memory R2 map and the real Hono asset handler. It establishes
the source behavior; no deployed bucket or real asset was probed. Exposure requires
knowledge of the asset URL/ID; the finding is not evidence that arbitrary private
assets can be enumerated or that production exploitation occurred.

Why deferred: prevalidating all rows would address this specific missing-row case
but not later R2 failures or a DB commit conflict after copying. Blind rollback of
the stable public key could delete an earlier/concurrent publication's asset. A
complete fix needs an agreed commit/visibility/retry contract across R2 and DB,
while preserving existing public URLs and historical artifacts. This task is not
authorized to change that persistence/publication contract or introduce migration.

Recommended decision: design publication-scoped private staging and a visibility
gate tied to a committed publication, with retry/cleanup ownership and coverage for
partial copy, DB conflict, concurrent publishers, existing URLs and old readers.
First confirm all deployed public asset access paths; an API-only gate is
insufficient if an alternate public bucket/custom domain bypasses it. Do not mark
#76 accepted or deploy this candidate until F2 is resolved or explicitly triaged
by the maintainer. The name fix is a separate reviewable improvement.

## Coverage and limits

| Boundary | Local result / evidence |
| --- | --- |
| Owner/editor/viewer draft reads | Allowed with authoritative role; only site-specific memberships count. |
| Unrelated B / anonymous / invalid session | 404/401 for 13 protected route/method pairs, unchanged fixture data, no R2 or DB writes. Actual bearer parsing/getUser call used with a synthetic identity provider. |
| Draft writes/autosave/reload | Owner/editor allowed, viewer rejected; stale expectedVersion rejected; exact saved document read back. Cross-site document rejection also covered by existing draft-validation tests. |
| Publish/retry/migration/member administration/backup | Collaborator editor/viewer denied; owner publish round trip verified. Existing collaboration tests cover RPC actor IDs/digests and role mutations. |
| Revocation | Next draft/asset request denied after local membership removal. |
| Public projection | Private profile/post/collection and private asset references absent from JSON, metadata, export and written artifact; owner draft unchanged. Shared projection suite covers transitive references. |
| Public names/cache metadata | Fixed F1 for v1/v2; published version/cache headers retained. Unpublished sites return 404. |
| Private asset GET/HEAD/Range | Owner/editor/viewer authorized; private no-store. Wrong site, foreign storage prefix and raw draft namespace denied before storage reads. |
| Upload limits/type/failure | MIME mismatch, declared request oversize, and actual image/audio per-file oversize without Content-Length rejected before storage writes. Existing API tests cover private owner namespace for editor uploads, byte signatures, audio quota, and rollback on DB insert failure. Streaming request-memory bounds and concurrent quota enforcement were not stress-tested. |
| Failed publication | F2 RED; no claim of safe failure atomicity. |
| URL/content parser | Existing shared URL/scheme, asset reference, export/import, provider and metadata tests run. No provider whitelist or rendering code changed. |
| Preview/sample interaction isolation | Relevant web previewModel, sharing, collaboration, assetSource and uploadTasks unit tests run; browser preview/guestbook E2E and DOM escaping not rerun. Existing browser coverage is not presented as current execution. |
| CSP/external media | Outside this API write ownership; no deployed header or provider session verification. Frontend/CSP author retains ownership. |
| Real RLS/RPC/R2/deployment | Not verified. DB filters, select projections and writes are modeled; SQL locking/RLS and actual service authorization require disposable staging accounts with recorded Web SHA/Pages ID/Worker version. |

## Validation

Node 22.23.2; pnpm 10.18.2; locked dependencies, no lockfile edits. Tests use a
single Vitest worker with file parallelism disabled. No browser or Mac runner jobs
were launched. Ordinary PR CI is Ubuntu; no workflow was modified or dispatched.

```sh
pnpm --filter @retrodesk/api test:unit --maxWorkers=1 --no-file-parallelism
pnpm --filter @retrodesk/shared test:unit --maxWorkers=1 --no-file-parallelism
pnpm --filter @retrodesk/api --filter @retrodesk/shared lint
pnpm --filter @retrodesk/web exec vitest run \
  src/features/editor/previewModel.test.ts src/lib/publicShare.test.ts \
  src/lib/collaboration.test.ts src/lib/assetSource.test.ts \
  src/features/media/uploadTasks.test.ts --maxWorkers=1 --no-file-parallelism
pnpm security:audit
git diff --check
```

- Unmodified base API: **26 files / 110 tests passed**.
- Final API: **26 files passed, 1 file failed; 145 tests passed, 1 failed**.
  The only failure is F2's retained security contract, with two failing assertions:
  anonymous 200 vs expected 404 and one public write vs expected none. No skips.
- Shared: **19 files / 175 tests passed**.
- API/shared lint: **PASS**; both scripts run `tsc --noEmit`, covering their
  production TypeScript typechecks.
- Web focused unit: **5 files / 43 tests passed**. Synthetic configuration logs
  that Supabase environment variables are absent; no real auth setup was used.
- Secret audit: **PASS**, values were not printed.
- `git diff --check`: **PASS**.
- Full contributor/build/browser gates, staging headers, real accounts and mobile:
  **NOT RUN**, reserved for final integration; prior base gate success is not a
  green gate for this candidate.

Raw local logs: `/tmp/retro-76-baseline.log`, `/tmp/retro-76-red.log`,
`/tmp/retro-76-final-api.log`, `/tmp/retro-76-final-shared.log`,
`/tmp/retro-76-final-web.log`, `/tmp/retro-76-lint.log`,
`/tmp/retro-76-secret-audit.log`. All content comes from synthetic fixtures.

## Integrator handoff

Keep the branch/worktree and Draft PR as review evidence. Refs #76 and #55; do not
close either issue. No merge, main push, deployment, branch deletion or permission
change occurred. Resolve/triage F2 first, then run the retained negative test and
the applicable full gate once on the final combined SHA. Add browser checks for
name parity in page/share/export, preview write isolation and upload failures;
validate real owner/editor/viewer/B/anonymous boundaries and deployed asset access
using authorized disposable accounts. Record actual Web SHA/Pages ID/Worker
version separately. Avoid claiming this bounded local review certifies security.
