# Editor modal accessibility slice

Base: `f11ad8d5cb869d47849834cdd8a692a5059d8021` (merged #127). Independent worktree/branch; #126 remains frozen.

## Reproduced defects

- At 390px, open Notes.exe, open the phone Edit Window sheet, press Escape: the sheet remains while the underlying app closes.
- At 1280px, open publish preflight: focus stays on the background publish opener. The custom wrapper has no focus trap or Escape handler.
- Both regression checks failed against the unchanged base before implementation.

## Implementation

1. Use the existing ModalDialog for the mobile editor sheet shell and publish preflight; retain existing inner editing and publishing logic. No new modal infrastructure.
2. Capture the original opener before locking the background, retain it across StrictMode effect replay, and unlock before restoring focus. Preserve existing topmost-dialog key handling.
3. Add optional card/body CSS hooks and a disabled-dismissal state to ModalDialog. Keep pending publish non-dismissible, focus Cancel initially, and retain blocked-check/duplicate-submit guards.
4. Keep one scrolling body, fixed modal title/footer, bounded viewport width/height, and 44px phone dismissal/action targets.
5. Verify focus entry, Tab/Shift+Tab wrap, Escape/cancel/close, nested picker return, inert background, phone scrolling, and pending publish using mocked API calls.

## Ownership and limits

Shared ownership: ModalDialog.tsx, MobileScreen.tsx, EditorPage.tsx and w98.css. Mobile sheets share one wrapper, so Add and Theme inherit the accessible shell; their editing logic is untouched. IG, Paint, image editing, Undo/status, navigation infrastructure and publishing transport are outside this slice. The success dialog remains separate future work. Conflict recovery is included after the #130 review found that preflight left it inside the inert app root. No real publication, staging access, deployment, schema, or flag changes.

## Verification results

- Before implementation: both targeted regressions failed (phone Escape leaves the sheet open; desktop preflight focus remains outside).
- Final focused Chromium run: **20 passed (31.5s)**, one worker, no retries, isolated local server on port 5217 with `CI=1` so an existing server cannot be reused. Includes 11 new checks and 9 neighboring sheet, picker and navigation checks.
- `pnpm --filter @retrodesk/web typecheck`: passed. `git diff --check`: passed.
- Reviewed screenshots at 320px for publish preflight and 390px for Edit Window. New checks cover phone widths 320/390/430 and desktop 1280; ordinary taps are exercised in a touch-enabled browser context.
- All server writes are mocked. Physical-device virtual keyboards, Safari, live publishing and staging are unverified; the known staging 403 stop condition is untouched. Full suite/build intentionally deferred to coordinated integration verification.

Focused command:

```sh
CI=1 PLAYWRIGHT_PORT=5217 pnpm exec playwright test \
  tests/e2e/editor-modal-accessibility.spec.ts tests/e2e/appearance.spec.ts \
  tests/e2e/icon-picker.spec.ts tests/e2e/mobile-shell.spec.ts tests/e2e/navigation-focus.spec.ts \
  --grep 'phone Edit Window|publish preflight|nested icon picker|pending publish|Add sheet|mobile theme changes|mobile window appearance|cancel, Escape|keyboard: open|edit/finish control|preview Back|nested keyboard returns|legacy helper call' \
  --workers=1 --retries=0 --reporter=list
```


## Review correction: publication conflict recovery

The reviewer reproduced `409 version_conflict` leaving preflight open while recovery rendered inside the inert app root. The owned 390px regression also failed before this correction.

- Close preflight on a current-session publication conflict and render recovery using ModalDialog with its existing `alertdialog` semantics. Topmost key handling now recognizes both dialog roles.
- Copy initially receives focus. Cancel, close and Escape dismiss only recovery presentation; the existing conflict flag continues to pause autosave. A persistent 44px recovery opener remains available, and Publish reopens recovery instead of sending another stale version.
- Only explicit Reload replaces local data. A phone test modifies the draft after Cancel, observes no autosave beyond the debounce, and copies that retained local edit before explicitly reloading.
- Delta verification: **21 focused publish/recovery browser checks passed (30.8s)**. Includes desktop/phone 409, 500 dismissal, Copy/Cancel/reopen/Reload focus, paused saves, ordinary reload/access-loss behavior, stale publication and reload receipts, nested picker, and pending publication. After the final touch-target rule, both 409 checks passed again (8.4s); these are reruns, not two additional distinct cases.
- Final web typecheck and diff check passed. Reviewed the 390px recovery screenshot. F11 changes are not included.

Delta command:

```sh
CI=1 PLAYWRIGHT_PORT=5217 pnpm exec playwright test \
  tests/e2e/editor-modal-accessibility.spec.ts tests/e2e/editor-save-session.spec.ts \
  --grep 'publish|nested icon picker|ordinary remote reload|real current-session conflict|reload receipt' \
  --workers=1 --retries=0 --reporter=list --output=test-results/conflict-final
```
