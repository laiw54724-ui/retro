# Links session return implementation plan

**Goal:** Existing Links window buttons return mobile visitors to their source button after opening a target, using the established R1 session dispatcher.

**Base:** main `8e2e54241ecca4c79cb5d6190e7b4b0beb804075`, fetched with current #29/#50 and recent PRs. #104 and #114–119 remain intact. No repository `.agents`, `AGENTS.md` or local `memory_summary.md` was present in this checkout.

**Architecture:** Add a small adapter from existing `LinkAction` to the runtime-only `InternalDestination`. Scoped windows use `onNavigate`; failures never fall back to another window or the legacy callback. Unscoped v1 retains its local window callback, checked against the supplied directory. URL behavior retains the existing protocol policy. The existing visitor hook owns request and return state; no schema, store, author data or feature gates change.

**Design choice:** Fix the missed R1 adapter instead of expanding persisted actions (requires reader/writer gates), or rewriting the session manager (already supports returns). Generic execution feedback belongs in WindowRenderer. Links adds stable focus keys, so the existing return-frame restoration can restore click/keyboard focus. Existing picker Cancel/Apply behavior remains unchanged and receives regression coverage.

**Ownership:** `apps/web/src/features/site/WindowRenderer.tsx` is shared; only imports, its onLink adapter and generic status output change. `apps/web/src/features/modules/links/index.tsx` only gains focus metadata. New adapter and unit tests are isolated under `features/navigation`. Extend `tests/e2e/link-targets.spec.ts` with focused cases. No Paint/theme/image editing, API, schema, registry or author-store changes. The parent notification tool could not resolve the supplied thread; ownership is also recorded here.

## Steps

- [x] Add a failing phone browser regression for Links → Explorer → exact post → Back → Links, exact target and keyboard focus, zero writes. Run it before implementation.
- [x] Add `dispatchWindowLink.ts` and unit tests: scoped stable IDs, unavailable propagation without fallback, missing targets, legacy unscoped behavior and inert editing. External URL code is unchanged; existing URL policy tests remain green.
- [x] Connect WindowRenderer to this adapter and render existing localized `navigationTargets.unavailable` on failure. Add stable `links:<windowId>:<linkId>` focus keys to Links buttons.
- [x] Run focused navigation unit checks and the navigation browser file (single worker, isolated local port). Include Cancel/Escape, missing target, minimized/repeated target, preview zero writes and rotation regressions already in that file.
- [x] Run web TypeScript once and whitespace checks, inspect diff, record actual results and acceptance limits. Commit and Draft PR are the delivery steps.

## Actual verification

- Existing navigation baseline: 10 tests passed in `resolveLinkDestination.test.ts` and `useVisitorNavigation.test.ts`.
- Before the fix, the new public browser regression failed on its second Back: the `Open targets` source button was no longer rendered, confirming the lost return frame.
- After the fix, 21 unit tests passed across `dispatchWindowLink`, `resolveLinkDestination`, `useVisitorNavigation`, and `linkDestinationSummary`.
- Navigation browser run: all nine pre-existing cases and the new public path passed. The new preview path reached the correct source but its final undo assertion used a desktop-only control while still on mobile. The test now returns to desktop before inspecting undo; no product change was needed for this assertion.
- Final targeted browser command passed all five selected cases: public and preview nested Links returns; existing URL/window switching with Cancel, undo and reload; missing/empty targets with valid legacy opening at 1280px and 375px. Together with the first run, all 14 distinct focused browser cases passed. No full build or full suite was run.
- `pnpm --filter @retrodesk/web typecheck` and `git diff --check` passed.
- Browser runs used local port 5197 and one Chromium worker. Evidence is in ignored `test-results/links-return-before`, `test-results/links-return-after`, and `test-results/links-return-final`; no production/staging traffic or deployment was needed.

Commands (Node/Corepack installed locally; task-specific PATH supplied):

```sh
pnpm --filter @retrodesk/web exec vitest run src/features/navigation/dispatchWindowLink.test.ts src/features/navigation/resolveLinkDestination.test.ts src/features/navigation/useVisitorNavigation.test.ts src/features/modules/links/linkDestinationSummary.test.ts
PLAYWRIGHT_PORT=5197 pnpm exec playwright test tests/e2e/link-targets.spec.ts --workers=1 --output=test-results/links-return-after
PLAYWRIGHT_PORT=5197 pnpm exec playwright test tests/e2e/link-targets.spec.ts tests/e2e/about-links-ux.spec.ts --grep 'Links window button|public links identify missing|link settings show invalid' --workers=1 --output=test-results/links-return-final
pnpm --filter @retrodesk/web typecheck
```

## Acceptance limits

This is a partial #29/#50 flow fix. No new persisted destinations/actions, music actions, sequences, Dialog module or deployment. Legacy unscoped v1 remains on its historical window callback; typed entity navigation still requires verified scope. Chromium checks do not establish native-device acceptance. Staging 403 remains a stop condition; no staging request is required.
