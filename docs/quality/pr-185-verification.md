# PR #185 — Verification and release handoff (Draft)

**Scope:** [PR #185](https://github.com/laiw54724-ui/retro/pull/185), correcting editor recovery, public projection, R2 migration and asset lifecycle. This document is a repeatable verification recipe, **not** a production deployment sign-off.

## Evidence already available before this documentation commit

- Runtime/test head: `4ce2eb253322dd37302cd1c04f1a4b03c6c3953e`; base main `d34cdd9c9400a7412eb9d485ac0f0df2e2e66d8d`.
- [Ordinary CI #40334694824](https://github.com/laiw54724-ui/retro/actions/runs/40334694824) completed successfully on the submitted PR head/test merge: frozen install, security/history and build-artifact scan, 337-file bundled-assets release audit, 153 dependency license checks, typecheck, unit tests and build. CI does **not** run Playwright.
- Maintainer's recorded local `pnpm verify:contributor`: exit 0; Chromium **925 passed, 0 failed, 20 pre-existing skips**. Tests used a loopback-only, synthetic-service setup. Unit totals recorded: shared 228; API 265; web 562 + 3 rollout. See the PR description for exact conditions and caveats.
- Focused desktop headless WebKit: 46 passed on preceding integration snapshot with unchanged product code; this is **not** a final-head full WebKit run or physical iOS verification.
- This new documentation commit changes no runtime code or test assertions. Its own CI result must be checked separately; no earlier run establishes the new commit's final check status.

## Reproduce without production credentials

Use a **clean clone** of this exact PR head, Node 22 and Corepack pnpm 10.18.2. Do not run commands against hosted production projects or real user sites.

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install --frozen-lockfile
pnpm security:audit
pnpm assets:audit:release
pnpm licenses:audit
pnpm typecheck
pnpm test:unit
pnpm build
pnpm security:audit -- --artifacts-only
pnpm exec playwright install chromium

# Focused synthetic browser regressions
pnpm test:e2e tests/e2e/editor-async-recovery.spec.ts tests/e2e/editor-recovery-dialogs.spec.ts tests/e2e/asset-migration.spec.ts tests/e2e/mobile-home-focus.spec.ts --workers=1 --retries=0

# Full local contributor gate; this includes the configured complete Chromium suite
pnpm verify:contributor
```

API/security regression sources include `apps/api/test/asset-lifecycle.test.ts`, `apps/api/test/security-publication-flow.test.ts` and `packages/shared/test/public-authoring-urls.test.ts`.

When recording results, include exact head SHA, Node/pnpm versions, command, pass/fail/skip counts, environment and artifact link. If using Vite or a pre-existing server, first verify it serves this exact checkout; mocks are not live-service acceptance.

## Synthetic acceptance matrix

| Requirement | Evidence location | Pass criteria |
| --- | --- | --- |
| Conflict, upgrade and successful publication dialogs | `tests/e2e/editor-recovery-dialogs.spec.ts` | Tab/Shift+Tab stays in active dialog; focus returns; clipboard rejection/download preserves newest canonical JSON |
| Publication A, then edits/uploads B before response | `apps/web/src/features/editor/store.test.ts`, `tests/e2e/editor-async-recovery.spec.ts` | Published baseline is A; B remains a local unpublished change with usable Undo |
| Successful publish, failed asset inventory GET | `tests/e2e/editor-async-recovery.spec.ts` | Remains a publication success with inventory warning/retry; no duplicate publish |
| Late save/migration response | `tests/e2e/editor-async-recovery.spec.ts` | No overwrite of newer local draft, canonical data or Undo |
| Raw editor-only URL removal from public JSON | `packages/shared/test/public-authoring-urls.test.ts` | Owner draft unchanged; public projection and export reject raw author input; valid render sources retained |
| Concurrent/stale R2 migration | `apps/api/test/asset-lifecycle.test.ts` | Conditional create-only writes never overwrite committed bytes; unknown ownership is conservatively retained |
| Referenced legacy URL/asset ID deletion | `apps/api/test/asset-lifecycle.test.ts` | Draft/published references refuse deletion with 409 and retain object/metadata; unreferenced asset can be deleted |
| Mobile home and visible focus | `tests/e2e/mobile-home-focus.spec.ts` | Tab navigation stays on visible app while opened; Back restores opener and focus |

## Live staging / production hold points — NOT covered by local CI

These require an authorized release owner, **disposable** staging accounts/sites and documented external resources; do not attempt on production data.

1. Record staging Web SHA, API Worker version, database migration set, Supabase project identity and R2 bucket **without publishing secrets or private URLs**.
2. Confirm real Auth, RLS and owner/editor/viewer/unrelated-user permissions; separately review [#96](https://github.com/laiw54724-ui/retro/pull/96), whose database write-boundary migration is not included here.
3. Use synthetic content to create/edit/publish/reload; force delayed media or migration completion while making a newer edit and verify persistence/Undo.
4. Verify publication displays exactly the submitted snapshot; inspect anonymous API/public projection against private drafts, legacy author URLs and asset sources.
5. Validate R2 retry/concurrency, deleting a still-referenced asset (409, object remains), removing all references and only then deleting an unreferenced asset. Compare DB state and R2 bytes, including unexpected RPC outcomes.
6. Verify modal keyboard/assistive-technology behavior and actual iPhone Safari keyboard/safe-area/focus, plus Android when applicable; Chromium viewports and desktop WebKit cannot substitute for physical phones.
7. Run the final exact-head CI and suitable post-deployment synthetic smoke before any release approval. Keep the PR Draft until those gates and a human review are explicitly complete.

## Remaining risks / explicit exclusions

- [#184](https://github.com/laiw54724-ui/retro/issues/184): atomic, concurrent audio-quota enforcement is **not fixed** by #185.
- [#96](https://github.com/laiw54724-ui/retro/pull/96): legacy authenticated direct SQL write boundary remains a **separate approval/deployment** item; merging #185 cannot fix it.
- R2 and database changes cannot be one atomic transaction. The conservative migration policy may leave unreferenced **private orphan copies** after uncertain failures, needing separate reviewed cleanup.
- Asset deletion still has a **read-references-then-delete concurrency window**; #185 adds safeguards but does not make that cross-service operation atomic.
- Already-created **historical public artifacts are not retroactively rewritten**; validate public exposure independently, and assess response/edge caching and remediation for any previously published raw input.
- Not verified against real Supabase/PostgREST/JWT/R2 or real iOS/VoiceOver. Do not treat passing mocks as provider-level guarantees.
- Public repo cleanup [#186](https://github.com/laiw54724-ui/retro/pull/186) is a separate Draft PR; do not merge it into this security/recovery patch simply to ship documentation.

**Status:** review-ready with repeatable synthetic evidence; **not production-release verified**. Do not merge, deploy, change secrets, adjust schema or rewrite Git history as part of this handoff.
