# Recovery/navigation combined integration plan

> Execute inline in this isolated worktree under the parent's integration-preparation authorization. Source branches remain frozen. No main merge or deployment.

**Goal:** Verify the interaction between Links visitor navigation and canonical IG avatar recovery without repeating either source's completed suite.

**Architecture:** Preserve both exact reviewed heads through merge ancestry. Add one integration-only browser spec using the existing local owner/visitor fixtures; production files remain exactly the two merged sources. Reserve the single combined build for incoming Paint #53.

**Tech stack:** Existing TypeScript, Playwright Chromium and local Vite fixture server.

- [x] Verify current main8e2e542, both exact-head green source CIs, frozen source ancestry, and clean local merges.
- [x] Add `tests/e2e/recovery-navigation-integration.spec.ts` with the complete shared fixture and two explicit scenarios: cancelled delayed avatar + nested Links Back at320px; completed avatar save + nested Links Back at390px. Assert original/saved canonical document equality, correct focus, actual completed upload state, and zero additional autosave/history from visitor actions. Keep invalid URL drafts local. No real accounts or staging requests.
- [x] Run only `PLAYWRIGHT_PORT=5293 CI=true corepack pnpm exec playwright test tests/e2e/recovery-navigation-integration.spec.ts --workers=1 --retries=0`; expected2passed,0failed/skipped/retries. Retain any original failure and make only fixture corrections if required; runtime issues go to parent/source owner.
- [x] Commit the integration-only spec/plan after a pass, record exact final tree and source ancestry. Keep source CI results separate from integration results. Defer full build, integration PR/CI and release until Paint/parent clearance; opening a PR would trigger an extra combined build.

## Actual checkpoint evidence

- Both source heads merged cleanly by ancestry; no runtime conflict resolution or source branch amendment. Parent independent-source totals remain separate: #12021units/5browser; #12158units/6browser. Completed source gates were not rerun.
- Two distinct new cross-feature Chromium cases passed across runs. Initial1pass/1failure: after a narrow preview the editor device remained Phone, so the new test could not find desktop avatar controls. Added an explicit Desktop device selection after widening the viewport. All product assertions retained and no runtime source changed. Reran only the affected case:1pass,0failed/skips/retries. Initial failure log/trace remains private; no first-pass claim.
- Current scope is a preparation checkpoint. The new integration branch is not in workflow push triggers. No integration PR opened, no combined build or integration CI dispatched, reserving the build for the incoming Paint #53 batch and parent clearance. No main merge/deployment, API/schema/flag/policy or production change. Existing403stop remains.

## Paint integration continuation

Parent supplied final #1227342aca87e00f5718e10100cda118c26bc8392fe with clear independent review. Its app/test/runtime trees equal reviewed89edbe58989f0c3a058fb968f6867820f642b813; later commits are docs/evidence only. Exact-head CI39296103481 succeeded. Merge into this integration branch only; source stays frozen.

- [x] Confirm reviewed runtime/final-head equivalence and clean #122 ancestry merge.
- [x] Extend the local fixture to enter via the auth hub and distinguish simultaneous avatar/Paint asset receipts; add two all-three-feature scenarios: nested Paint leave-modal shortcuts preserve a canonical IG edit before Links navigation; a late avatar result preserves a Gallery created by Paint before Links navigation.
- [x] Run4 cross-feature cases plus2 affected existing canonical/theme leave-guard cases, one Chromium worker, retries0. Retain failures; do not patch frozen source runtime without a source-owner handoff.
- [ ] After focused acceptance, make one final local production Web build and verify lazy Paint/debug exclusion and unchanged writer gates. Open a Draft integration PR and await its exact-head routine CI. No main merge, deployment, SQL/schema/API/flag change or403 retry. #123 needs its own clearance and does not block this checkpoint indefinitely.

### Combined Paint-focused result

All6 selected Chromium cases passed in21.5s,0failed/skipped/retries, one worker:4 integration cases plus2 affected canonical/theme leave-guard cases. Includes the two material Paint interactions added above and the prior navigation/avatar cases on the new runtime. No completed per-source full browser suite rerun. Source runtime remains the clean merge union; only integration fixture/spec/plan changed. Final build/CI results will be attached to the Draft PR and private receipt after committing this exact source, without post-validation source edits.
