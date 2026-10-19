# PR #107 navigation integration repair plan

**Goal:** Correct the two failures from full gate [39223814582](https://github.com/laiw54724-ui/retro/actions/runs/39223814582) without changing canonical data or unrelated session state.

**Approved design:** Explicit desktop Close resets only that window's IG restoration state, pending navigation request and return frames involving the window. Minimize/rotation keep existing state. Explorer activation remains in memory; tests prove exact profile/post, focused destination, phone source Back/focus, canonical sharing, unchanged URL/history, no non-GET requests and no persisted state on reload.

**Execution:** Inline in the existing combined worktree. This implements the parent's explicit repair instruction and approved R1 contract. No additional design approval or agent delegation is needed.

## Files and steps

- [x] Add `features/navigation/useVisitorNavigation.test.ts` proving isolated reset, preserved other routes/requests/Explorer/source/windows/counter and local sessions without a shared PreviewNavigation.
- [x] Export `resetVisitorWindow(session, id, navigation?)` in `useVisitorNavigation.ts`: delete `session.requests[id]`; filter only return frames whose source or opened window equals id; delete `navigation.ig[id]`; clear `navigation.openId` only when equal to id. Expose it as `visitor.resetWindow(id)` and call it only from `VisitorDesktop.close`.
- [x] Preserve the existing `oc-profiles.spec.ts` entry-profile assertion; strengthen it by navigating another IG window before closing the first and confirming its route survives, with no non-GET requests.
- [x] Replace the old Explorer URL-transition test with desktop/phone cases using profile and exact-post shortcuts. Verify target/author/content, canonical share URLs, profile Back, phone source Back/focus, destination desktop focus, unchanged URL/history, unchanged document-fetch baseline before reload, zero non-GET requests, and no restored IG after reload.
- [x] Run the new unit regression red then green, resolver/preview-model units and web typecheck. Run full `oc-profiles.spec.ts`, `public-sharing.spec.ts` and `link-targets.spec.ts` serially on a fresh Vite port, retries zero. Re-run only concrete failed assertions if a test needs correction.
- [x] Record results and any failed attempts; commit/push the small diff to #107 and publish its exact SHA/tree for independent review. Hold the final full gate until review clears this change.

Commands from the repository root (pnpm uses the existing corepack shim for nested scripts):

```sh
corepack pnpm --filter @retrodesk/web exec vitest run src/features/navigation/useVisitorNavigation.test.ts src/features/navigation/resolveLinkDestination.test.ts src/features/editor/previewModel.test.ts
PATH=/tmp/retro-reader-bin:$PATH corepack pnpm --filter @retrodesk/web typecheck
PATH=/tmp/retro-reader-bin:$PATH CI=1 PLAYWRIGHT_PORT=53142 corepack pnpm exec playwright test tests/e2e/oc-profiles.spec.ts tests/e2e/public-sharing.spec.ts tests/e2e/link-targets.spec.ts --workers=1 --retries=0 --reporter=list
```

**Review boundary:** Keep the failed gate and source CI receipts intact. No writer enablement, baseline updates, schema/API/security changes, merge or deployment. No broad gate before independent review of the exact repair SHA.

## Execution evidence

The production diff is limited to `useVisitorNavigation.ts` (window-specific reset helper/hook method) and `VisitorDesktop.close` (call the reset). No minimize, rotation, mobile Back, canonical document, API, schema or writer path was changed. The reset removes only the closing window's restored IG state, pending request and return frames involving it. Other routes, requests, return frames, Explorer state, source/window references and monotonic request counter are preserved.

The original [failed full gate 39223814582](https://github.com/laiw54724-ui/retro/actions/runs/39223814582) at `9b31787f464950f7c288ee354c2054efd3bdfa8e` remains the first full gate receipt: 481 passed, 2 failed (both repeated on configured retry), 20 intentional skips. The subsequent language/window-browser/image fixture steps did not run. This patch does not relabel that result.

### Focused verification and corrections

| Command scope | Result | Transcript |
| --- | --- | --- |
| New reset regression, before implementation | 3 failed (helper absent) | [unit-red.txt](2026-10-19-navigation-repair-107-evidence/unit-red.txt) |
| Reset + resolver + preview model units | 20 passed, 0 skipped | [unit-green.txt](2026-10-19-navigation-repair-107-evidence/unit-green.txt) |
| Web TypeScript | passed | [typecheck.txt](2026-10-19-navigation-repair-107-evidence/typecheck.txt) |
| Full OC + public-sharing + related link-targets specs | 37 passed, 3 failed, 0 skipped, retries 0 | [browser-initial.txt](2026-10-19-navigation-repair-107-evidence/browser-initial.txt) |
| Three corrected browser cases | close case passed; 2 sharing cases failed; retries 0 | [browser-corrections.txt](2026-10-19-navigation-repair-107-evidence/browser-corrections.txt) |
| Final two sharing cases | 2 passed, 0 skipped, retries 0 | [browser-sharing-final.txt](2026-10-19-navigation-repair-107-evidence/browser-sharing-final.txt) |

All 40 unique scoped browser cases have final passing evidence (37 initial + 1 close rerun + 2 sharing rerun); this was not one first-pass green run. The nine related navigation cases include minimized temporary viewer restoration, cross-layout exact-post retention, mobile Back/focus, private-source exclusion and zero autosave/undo writes.

The new test corrections were concrete fixture assumptions, not weakened behavior assertions:

1. The strengthened close test's final Other.exe desktop icon was obscured by the reopened first window. It now uses the existing minimized taskbar task, a real user path. The original first-window `retro` reset assertion remains, and Other.exe must still show its preserved `bei` route.
2. The exact rendered post caption includes the author prefix. The assertion is exact `retro second sunset`, with separate exact author, wrong-post exclusion and canonical post-share ID checks.
3. React StrictMode mounts the development page twice, yielding two initial fetches. The in-memory test now captures the initial fetch count and requires it to stay exactly unchanged during navigation; reload must double it after the ready surface appears. URL and browser history must also remain exactly unchanged. No non-GET requests are allowed, and a real reload must show no restored IG window.

At desktop and 390px, Explorer coverage now proves exact profile/post, canonical share URLs, post→profile Back, destination desktop focus, phone source Back restoring each trigger's focus, no browser navigation, no writes and no session persistence on reload. Existing direct deep-link/reload tests remain intact.

## Review hold

The parent requested this exact repair be published for independent review before another full gate. No full gate has been rerun. Source #104/#105/#106 heads, the privacy fix, source failure receipts and initial combined CI failure receipt remain unchanged. Routine PR CI is tracked separately in #107. No baseline update, writer enablement, merge, deployment or immutable historical artifact rewrite occurred. This is mocked local Chromium proof, not native/live acceptance.
