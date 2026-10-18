# API boundary review and bounded fixes — #76

Both reproduced findings (F1 unpublished names and F2 precommit public asset copies)
are fixed locally. The original F2 negative assertions are retained and now pass.
This Draft PR still needs review and final integration/deployment verification.
No production data was inspected, changed or cleaned up.

## Scope and provenance

Base: `386c209dd8cb47bae96a749a7751cc7189032183`, fetched and verified against
`integration/retro-preview-r1-r3`. Excludes #77 and other worktrees. Sole API author:
Codex task-3. Repository/ancestor AGENTS.md files were absent; `~/.codex/AGENTS.md`
was empty. Worktree and branch are retained for integration.

Runtime changes: `apps/api/src/routes/sites.ts`, `routes/transfer.ts` and
`lib/publish.ts`. Tests/report are API-specific. No shared schema, frontend, CSP,
CI, lockfile, credentials, binding, SQL/RLS, migration or remote setting changed.
API ownership was recorded in #55 before writing. Other worktrees were preserved.

## F1 — confirmed and fixed: unpublished names in public responses

Source at the base SHA:

- `routes/sites.ts:164–166`: autosave updates both `draft_document` and mutable
  `site_name` from the latest draft.
- `routes/sites.ts:273,301`: public JSON and metadata selected/used `site_name`
  independently of the older `published_document` snapshot.
- `routes/transfer.ts:40–43,60`: public and owner-published exports populated
  `sourceSite.siteName` from the same mutable column.

Synthetic reproduction, **both v1 and v2**: store `Published desktop`, owner A
autosaves `UNPUBLISHED-NAME-ONLY-IN-DRAFT`, then anonymous reads public JSON,
metadata and export; owner reads published export. All four surfaces disclosed
the unpublished marker while the snapshot retained the old name. Metadata could
change under an unchanged `published:1:site` cache tag.

`test/security-api-boundaries.test.ts` retains:

- `isolates every public name surface for stored v%s snapshots`: all four surfaces
  checked using soft assertions, so neither version stops after the first failure.
- `keeps saved v%s draft names out ... until publish`: actual Hono autosave, owner
  reload, anonymous reads, private backup, publish and public reload.
- Unmodified base runtime plus new tests: **4 failed / 27 passed**, with each
  affected surface in `/tmp/retro-76-red.log`. These cases now pass.

Fix: public queries stop selecting `site_name`; the public JSON field keeps that
name but derives its value from `published_document.siteName`. Metadata and
published exports use the snapshot name too. Owner draft reads/private backup
keep the latest saved name. Only an authorized publication exposes the new name.
No persisted data, v1/v2 reader or export format was rewritten.

## F2 — confirmed and fixed: failed publish left public asset copies

### Original conditions and reachability

At initial PR head `3c526e2583266f3dd1825439f64cfa31cc05cdb3`, unchanged
`lib/publish.ts:24–42` validated/copied assets one at a time into public storage.
`routes/sites.ts:205–212` did this before the atomic DB publication. After an early
copy, later missing/foreign rows, missing R2 objects, copy failure, rewritten-document
validation failure or DB conflicts/errors could leave public copies.

The retained synthetic regression uses two icon references: matching private PNG
first, missing asset row second. Original result: **400**, old DB snapshot unchanged,
no publish RPC, one public write, anonymous GET **200** rather than **404**. Initial
complete API suite: **145 passed / 1 failed**, no skips. The original regression in
`security-api-boundaries.test.ts` still asserts **404 and no storage writes at all**
for that missing-row case; both now pass.

Anonymous entry: `GET/HEAD /api/assets/published/<username>/assets/<uuid>.<ext>`;
GET supports Range. `routes/assets.ts` serves this namespace without consulting
committed publications. The requester must know/obtain the URL including UUID;
this is not evidence of enumeration or bypassing draft-list permissions. An
alternate configured public asset origin can expose the same copied object.

Original public puts were unconditional: an identical existing key was overwritten
even if the later publish failed. Normal uploads create new UUIDs and have no
in-place byte-update API, so repeated ordinary publishes usually copied identical
bytes. Tests additionally alter synthetic staged bytes to verify that the fix
preserves any already-public bytes rather than overwriting them.

### Existing capabilities and implemented flow

`0003_atomic_publish.sql` already locks the site row, checks draft and published
versions, inserts `site_versions`, commits the public snapshot, and sets artifact
state pending. Status updates already match the published version. The existing
API can return a committed version with `artifactStatus: failed, retryable: true`,
and `/publish/retry` loads that committed snapshot. No new schema, binding,
permission, remote data operation or migration is required. The initial assessment
that F2 necessarily needed a new publication contract was too broad.

1. Validate **all** asset rows, ownership, site, scope and exact filenames before
   any writes. Prepare unchanged public URLs.
2. Copy only to `draft/publication-assets/<siteId>/<uuid>.<ext>`, with private
   metadata and create-only semantics. The public route rejects this namespace;
   it is not a draft asset row either. Partial failure leaves private stages only.
3. Revalidate the rewritten projection; invoke the existing atomic publish RPC.
   A conflict/error never promotes bytes. If DB commit succeeded but its response
   was lost, bytes remain private until the owner retries.
4. **After commit acknowledgement**, derive filenames from this site's exact
   trusted public URL prefix in the committed document and promote staged bytes.
   Reuse existing public objects. New public puts use
   `onlyIf: new Headers({ "If-None-Match": "*" })`, preventing overwrite across a
   head/write race. Copies stream data rather than buffering all assets.
5. Write the JSON artifact after asset promotion. A promotion failure returns the
   existing **200 / committed version / failed / retryable** state. Retry restores
   missing public objects from retained stages, then writes the artifact; it does
   not create a version or depend on removed source upload rows. Known-stale or
   unsynced calls do not run legacy cleanup.

Stage/public keys are create-only under the existing immutable-UUID asset model.
A same-draft loser may retain private bytes, never delete the winner's objects.
A slower older committed publication may finish its historical artifact, but
cannot overwrite public bytes or the newer version's sync status. Old snapshots
with existing public files retry without requiring stages.

Rejected alternatives: preflight plus delete leaves visibility/rollback races;
an API read gate adds serving/DB logic yet misses alternate direct public origins.
Postcommit promotion preserves public URL/response/schema contracts with no public
rollback deletion.

### Tradeoffs and limits

- Public JSON can briefly reference files still being promoted after DB commit.
  Storage failure is a live publication with explicit retryable sync failure,
  following the existing DB-authoritative contract. Existing public bytes remain.
  No global atomic R2+DB transaction is claimed.
- Abandoned private stages are retained for safe retries. GC/storage reclamation
  is deferred; there is no unsafe rollback deletion.
- New premature copies are prevented. Already-public leftovers from older code
  are not remotely cleaned, missing historical data is not repaired, and bucket
  policies are unchanged. An old-API rollback reintroduces the original behavior.
- Staging relies on the existing private-draft storage boundary. No raw bucket
  exposure was inspected/enabled; deployed policies remain a separate check.
- Retry assumes the committed snapshot's configured public asset base is retained.
  Config/base changes and alternate-origin routing need deployment verification.

## Coverage and validation

Real Hono handlers, bearer parsing/access rules, projection and helpers run against
synthetic identity/database doubles and an in-memory R2 map. Concurrency fixtures
model the SQL CAS; they do not certify real PostgreSQL locking or deployed RLS.

| Boundary | Local evidence |
| --- | --- |
| owner/editor/viewer/B/anonymous/invalid session | Authorized reads; 13 protected method/path pairs deny unrelated/anonymous identities without writes; cross-site memberships and revocation checked. |
| autosave/reload/publish | Editor writes, viewer rejection, stale draft rejection, v1/v2 F1 round trips; existing scope-validation tests retained. |
| public projection | Private profile/post/collection/asset references absent from JSON, metadata, export and artifact; source draft unchanged. Shared suite covers transitive references. |
| private assets | Authorized GET/HEAD/Range with private no-store; foreign ID/site/prefix and raw draft namespace rejected before storage. |
| uploads | MIME, declared size, actual image/audio per-file oversize without Content-Length; existing namespace/quota/signature/DB-insert rollback cases. No load/stress test. |
| F2/order/retry | Original missing-row regression; partial staging, missing source, DB conflicts/errors, commit-before-public-write, promotion retry after source removal, lost commit response, existing bytes, head/put race, two same-draft publishers, slow old publisher, old snapshot retry. No skips. |
| R2 condition/storage | Local Miniflare verifies existing bytes retained, condition returns null, exactly one concurrent create wins; actual production helpers stage privately then promote with correct bytes/MIME/cache metadata. No real bucket. |
| preview/content | Related web previewModel/sharing/collaboration/assetSource/uploadTasks plus shared parser/provider/projection; no browser DOM/escaping/provider session rerun. |
| CSP/deployment | Deployed headers, true RLS/RPC, real accounts, mobile and platform playback unverified; outside API write ownership. |

Node 22.23.2; pnpm 10.18.2; locked dependencies, unchanged lockfile. Single Vitest
worker, no file parallelism. No browser or Mac runner jobs launched.

```sh
pnpm --filter @retrodesk/api test:unit --maxWorkers=1 --no-file-parallelism
pnpm --filter @retrodesk/shared test:unit --maxWorkers=1 --no-file-parallelism
pnpm --filter @retrodesk/api --filter @retrodesk/shared lint
pnpm --filter @retrodesk/web exec vitest run \
  src/features/editor/previewModel.test.ts src/lib/publicShare.test.ts \
  src/lib/collaboration.test.ts src/lib/assetSource.test.ts \
  src/features/media/uploadTasks.test.ts --maxWorkers=1 --no-file-parallelism
pnpm --filter @retrodesk/api exec node test/r2-create-only.smoke.mjs
pnpm security:audit
git diff --check
```

- Base API: **26 files / 110 tests PASS**.
- Final API with original F2 assertion and 13 additional flow cases:
  **28 files / 159 tests PASS**, no skips.
- Shared: **19 files / 175 tests PASS**. Focused Web: **5 files / 43 tests PASS**.
- API/shared lint: **PASS**, both run production `tsc --noEmit`.
- Local Miniflare R2 smoke and actual staging/promotion helpers: **PASS**. Requires a loopback socket; installed v5
  required its V4-options converter. No project config changed.
- Secret audit and diff check: **PASS**, secret values not printed.
- Full contributor/build/browser gate, deployed headers, true accounts/RLS,
  providers and mobile: **NOT RUN**, reserved for final integration.

Local logs: `/tmp/retro-76-baseline.log`, `/tmp/retro-76-red.log`,
`/tmp/retro-76-final-api.log` (initial F2 RED), `/tmp/retro-76-f2-final-api.log`
(final GREEN), `/tmp/retro-76-final-shared.log`, `/tmp/retro-76-final-web.log`,
`/tmp/retro-76-f2-lint.log`, `/tmp/retro-76-r2-conditional.log`,
`/tmp/retro-76-secret-audit.log`. All target identities/URLs/UUIDs are synthetic;
public prose contains no real target account, private URL, token or user content.
The [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
documents conditional writes; installed types and local runtime were checked too.

## Integrator handoff

Review F1/F2 source and failure/retry semantics; then run the applicable full gate
once on the final combined SHA. Add browser page/share/export name parity,
preview non-writing, upload failure/retry messaging and old public content checks.
Use authorized disposable staging identities for owner/editor/viewer/B/anonymous
and actual asset policy/paths; record Web SHA, Pages ID and Worker version
separately. The base's old full gate is not this candidate's gate. Refs #76/#55;
no merge, deploy, issue close, main push, remote cleanup or permission change.
