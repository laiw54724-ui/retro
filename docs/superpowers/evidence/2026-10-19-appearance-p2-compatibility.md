# Issue 35: bounded compatibility prerequisite

Branch: codex/appearance-p2-compat-35. Exact source/base: reviewed #94 at **956d26d4237ce9cb5a774547b1a0bf548a30f0df**. #91 remains **879961d6d834dd668944afd97e9da2ac89071bae**; #94 is not amended. Dedicated worktree: retro-appearance-compat. No AGENTS.md/.agents/.codex instructions are present in this checkout. Applied the existing accepted design/worktree/plan workflow, Cloudflare and Workers guidance. Official reference reviewed: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ (request-local state, awaited work; no new Worker bindings/configuration).

## Implemented scope

- New API helper detects raw P2 appearance property presence and partial window appearance contracts. Create checks incoming raw data. Draft reads id,draft_version,draft_document in one snapshot and checks **raw incoming OR stored** document before schema parsing can remove/default fields. A client with the current version but stripped fields receives HTTP 426/client_upgrade_required with no write. Conditional `.eq("draft_version", expectedVersion)` remains intact for first-P2-write races.
- Exact transport capability 1 is outside the document. It is not authorization. All existing authentication, access, scope and schema checks remain. Capable intentional reset/delete is allowed without reintroducing omitted fields. Legacy documents without P2 dependence may still save without the capability.
- Both import endpoints require the exact query capability for every package, even a package already stripped by an older client. Existing digest, media acknowledgement, payload limits and format validation remain. Compatible create/save/import senders always send capability, including when controls are off.
- Authenticated GET site advertises writeCompatibility.appearanceP2=1 with private/no-store. Client GET uses no-store and binds API origin locally; React context associates metadata with the successfully loaded site/API. Missing, unknown, wrong-type, wrong-site or wrong-API data keeps controls hidden. There is no mutable global capability state.
- Production authoring remains hard-disabled by the unchanged DEV-only gate, even with VITE_APPEARANCE_P2_WRITER=true. Local writer UI also requires the matching load advertisement.
- 426 pauses autosave, publish confirmation and artifact retry controls. Local canonical edits/history stay in the current tab. Recovery downloads canonical JSON, checks the server afresh, and offers a new editor tab only when the response is compatible and its draft validates. The current tab is never replaced or automatically retried. Conflict-copy JSON also uses the canonical document. Ten scoped recovery keys per locale in zh-Hant/en/ja/ko.

API ownership was reported before edits: lib/site.ts, new lib/appearanceCompatibility.ts, routes/sites.ts (create/load/draft), routes/transfer.ts (preview/confirm), and tests. lib/http.ts adds 426 only to its existing typed response-status union. No publish helper, assets route, DB grant/RLS/migration, auth/CORS configuration, credentials or deployment was changed. Security #96 is separate; no DB policy change is assumed or applied. The compatibility marker does not protect arbitrary direct database writes or act as authentication; this is cooperative exclusion of known incompatible API clients.

## Executed focused checks

- API: 38 tests passed across appearance-compatibility, transfer-routes, draft-validation, collaboration-sites and site-contract. Includes frozen v1 stripping/old strict rejection, raw/stored detection, current-version stripped requests, a real nested first-write/CAS race in the mock database, deliberate resets, imports, schema/auth/access, and fresh advertisement. After tightening reset fixtures, affected API suites reran: 25 passed.
- Client: 28 tests passed across pure scoping, real sender requests with controls off, context isolation, production exclusion and locale guards. After final sender/context refinements, affected client suites reran: 14 passed.
- API lint/types and web lint/types passed. VITE_APPEARANCE_P2_WRITER=true production web build passed; executable JS inspection confirms the writer DOM marker is compiled out. Existing Zod annotation/chunk-size warnings remain.
- Playwright test discovery/parsing is checked separately. Browser execution was not initially possible: automatic approval review repeatedly could not complete because its selected model was at capacity. These failures did not execute the test command and are not test failures or unsafe-action determinations. No approval bypass was attempted. Approval review later recovered and the approved focused Chromium suite passed: **15 tests, 1 intentional default-build skip**. The recovery desktop screenshot was visually inspected. The suite covers missing/unknown/compatible advertisement, no save retries after further local edits, no publish/artifact retry loops, canonical recovery downloads, unknown-server failure closed, and existing color/import flows including 320/390/430 authoring and a 320px import dialog. An optional extra mobile-recovery run timed out in approval and was not executed; no mobile-recovery screenshot claim is made. The validated 15-test suite is retained.
- git diff --check passed. No aggregate gate; integrator owns it.

Focused commands:

```
pnpm --filter @retrodesk/api exec vitest run test/appearance-compatibility.test.ts test/transfer-routes.test.ts test/draft-validation.test.ts test/collaboration-sites.test.ts test/site-contract.test.ts
pnpm --filter @retrodesk/web exec vitest run src/lib/appearanceCompatibility.test.ts src/lib/apiAppearanceCompatibility.test.ts src/lib/appearanceP2Writer.test.ts src/features/editor/AppearanceWriteContext.test.tsx src/i18n/resources.test.ts src/i18n/translationQuality.test.ts src/i18n/hardcodedText.test.ts
pnpm --filter @retrodesk/api lint
pnpm --filter @retrodesk/web lint
VITE_APPEARANCE_P2_WRITER=true pnpm --filter @retrodesk/web build
VITE_APPEARANCE_P2_WRITER=true PLAYWRIGHT_PORT=5196 pnpm exec playwright test tests/e2e/appearance-compatibility.spec.ts tests/e2e/appearance-p2-writer.spec.ts tests/e2e/transfer.spec.ts --workers=1 --output=test-results/appearance-compat
```

## Remaining release gate

No deployed compatibility is established. Reader/guard API and compatible web builds need review, deployment and exact SHA canaries for old-current-version stripped saves, concurrent first writes, imports, deliberate resets, save/reload, publish/public projection and both export scopes. Preserve the separate DB-write-boundary review/authorization. This PR must not remove the production hard block; a separately approved future change may enable authoring only after those deployed results exist. Do not roll readers/guard back after new fields are written; preserve data and fix forward. #35 remains open for the remaining P2/P3+ work.


## Earlier delivery pause and preserved patch

The earlier required commit/push command was not executed: automatic approval review failed while running its remote compact task because the selected model was at capacity. This is an approval-service failure, not an unsafe-action determination. No bypass was attempted. At that pause HEAD remained the exact source 956d26d4 with the implemented, validated changes in the dedicated worktree. A complete patch (tracked and new files) is saved at ../appearance-compat-35.patch for review/apply against that base. On resume, the saved patch was verified against the unchanged worktree and the Chromium last-run record confirmed passed with no failures. Publishing is retried through the normal approved path; the PR metadata and delivery report record its resulting head or remaining blocker. #91/#94 and every other worktree remain unchanged.
