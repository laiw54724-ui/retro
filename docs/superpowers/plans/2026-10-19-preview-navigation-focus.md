# Preview navigation focus regression

Base: fetched main `8e2e54241ecca4c79cb5d6190e7b4b0beb804075`. Independent branch/worktree; #120 and #123 remain frozen. No repository `.agents`, `AGENTS.md` or local `memory_summary.md` found.

## Bounded design

The mobile editor keeps the source Explorer mounted while its portalled visitor preview runs. Both have identical `data-navigation-focus` keys. The existing helper searches the whole document and chooses the first key, which is the inert editor node. Back renders the correct source but loses usable keyboard focus.

Pass MobileScreen's stable screen ref to the focus helper. Resolve only inside that surface on the next animation frame, after the source app renders. Skip detached, inert, hidden, disabled and non-visible candidates; if focus fails, try another matching available candidate. If no matching trigger survives, focus the local screen (programmatically focusable, absent from Tab order). A disconnected/inactive surface must never fall back to another surface. Retain the existing one-argument function export for compatibility. Do not change return frames, source selection, navigation routing, schema, preview session state or author content.

Files: new `features/navigation/navigationFocus.ts`; preserve helper export from `useVisitorNavigation.ts`; bounded screen-ref/call-site addition in `features/site/MobileScreen.tsx`; independent `tests/e2e/navigation-focus.spec.ts`; this record. MobileScreen is the shared ownership risk. No overlap with #120/#123 edits except their surrounding unchanged navigation interfaces.

## Verification plan

- Reproduce actual preview/editor duplicate-key failure before runtime edits, with an inert editor source and keyboard activation.
- Check direct and nested preview returns, public keyboard returns, zero preview saves.
- Browser-level helper checks cover invisible/disabled/detached matches, strict surface isolation, missing/null-key fallback, legacy one-argument compatibility and inactive surface rejection.
- Existing focused navigation session/resolver units and `link-targets` browser cases cover request/reset behavior, temporary viewers and rotation.
- Port 5228 checked unused, server reuse disabled (`CI=1`), one worker, no retries. No other worker server is touched. Run web TypeScript and whitespace checks; no full suite/build.

No schema, flags, merge, deployment or main push. Native device and combined integration acceptance remain with the parent.

## Implementation and actual results

- The new direct-preview browser regression **failed on unchanged main** at the first Back focus assertion. It verified two identical keys and an inert editor root before opening the post. Evidence: `test-results/focus-before`.
- Added `navigationFocus.ts`; `useVisitorNavigation.ts` re-exports the existing function name, with an optional surface argument. MobileScreen passes its stable screen ref. The fallback screen has `tabIndex=-1`, so it is not a new sequential Tab stop.
- Candidate checks exclude inert/hidden/aria-hidden/disabled/aria-disabled/detached/non-rendered/transparent nodes. A failed focus attempt can fall through to the next matching local candidate. Missing/null keys fall back locally; detached/inert/null scopes never search a different surface. A newer modal retains its focus. Normal target focus still scrolls an offscreen trigger into view; fallback itself does not scroll the page.
- The new keyboard regression also caught the same mounted-background collision in MobileScreen's document Escape listener. It now ignores its own surface when inside inert/hidden/aria-hidden content. Public routing and return-stack behavior are unchanged; the hidden author source remains open after preview Escape.
- **10 unit tests passed** in existing navigation session/reset and scoped resolver files.
- **14 distinct focused Chromium cases passed** across the nine existing `link-targets` cases and five new `navigation-focus` cases. Initial combined run passed all nine existing cases and three new cases; after the background Escape guard, all five new cases passed (9.5s). The strengthened scrolling/fallback browser case passed again after preserving normal target scrolling.
- Web TypeScript and `git diff --check` passed. No full build or suite. Test runs used verified port 5228 with server reuse and retries disabled; no other checkout/server was edited.

```sh
pnpm --filter @retrodesk/web exec vitest run src/features/navigation/useVisitorNavigation.test.ts src/features/navigation/resolveLinkDestination.test.ts
CI=1 PLAYWRIGHT_PORT=5228 pnpm exec playwright test tests/e2e/navigation-focus.spec.ts tests/e2e/link-targets.spec.ts --workers=1 --retries=0 --reporter=list --output=test-results/focus-after
CI=1 PLAYWRIGHT_PORT=5228 pnpm exec playwright test tests/e2e/navigation-focus.spec.ts --workers=1 --retries=0 --reporter=list --output=test-results/focus-final
CI=1 PLAYWRIGHT_PORT=5228 pnpm exec playwright test tests/e2e/navigation-focus.spec.ts --grep 'focus helper ignores' --workers=1 --retries=0 --reporter=list --output=test-results/focus-scroll
pnpm --filter @retrodesk/web typecheck
```

#120 remains at `8c1756a2fa59505b94bbea322fad9d0f00c3f133`; #123 remains at `a018ba9ed73436bc05155d300ce5908aaa7f1155`. This branch depends on neither. MobileScreen is the only shared shell edited, limited to ref/fallback focus and the inactive Escape guard. No author data or persisted shape changes; staging 403 remains a stop condition.
