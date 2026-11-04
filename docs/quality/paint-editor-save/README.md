# Paint formal editor entry and PNG draft save (#53)

Branch: `codex/paint-editor-save-53`. Base: `8e2e54241ecca4c79cb5d6190e7b4b0beb804075`.
Tested runtime: `89edbe58989f0c3a058fb968f6867820f642b813`, tree `9cc7996e07d70576dda6ecacd8db8789d969cc79`.
The final evidence commit changes documentation only. No deployment or merge was performed.

## Delivered slice

An explicit editor Paint button lazily opens the existing drawing workspace. Save uploads a new private PNG and adds one new Gallery in one document-history transaction. Original files/windows are preserved. PNG export remains a local download. A saved snapshot marks only its captured engine revision saved; newer drawing during upload remains dirty. Upload failure preserves canvas/history and allows retry. An accepted upload receipt is reused if the same snapshot cannot yet be inserted into a full draft.

Mounted editor/site/permission/upgrade guards reject late upload completions. Dirty/active Paint work registers with the existing Back/native-reload/sign-out leave guard, and Close confirms discard. Canvas history and nested leave-dialog shortcuts cannot reach the background document. Phone dialog bounds are constrained; the canvas itself scrolls.

Shared changes are limited to one EditorPage toolbar entry, local-work registration/query in editorSession, and ModalDialog topmost keyboard handling/optional command containment/viewport bounds. The other changes are Paint files, focused tests and four `modules.paint` locale blocks. No schema, API, registry, production flag, migration or security-boundary edits.

## Focused verification

| Check | Result | Evidence |
| --- | --- | --- |
| Save/local-work/cursor units | 8 passed | `evidence/focused-units.log` |
| Resource/translation quality (all four locales, including ja/ko) | 13 passed | Same log; resource checks, no ja/ko browser claim |
| New formal editor Chromium cases | 6 passed | `evidence/editor-final.log` |
| Existing tool/import Chromium cases | 13 passed | `evidence/operation-import.log` |
| Existing engine Chromium cases | 7 passed | `evidence/engine.log` |
| Desktop capture + save/reload repeat | 1 passed, already counted among the six | `evidence/editor-desktop.log` |
| Web TypeScript/build | Passed | `evidence/web-build.log`; existing chunk-size and dependency annotation warnings remain |
| Production debug-host/global exclusion, separate lazy Paint chunk | Passed | `evidence/production-audit.json` |
| Diff whitespace | Passed | `git diff --check` |
| Independent read-only review | Cleared after fixes | Review summary below |
| Standalone root lint / full contributor / full integration gate | Not run | Bounded batch only; web build includes its TypeScript gate |
| WebKit / native Pencil or Safari / live authenticated uploads | Not run | Chromium fixtures do not establish these outcomes |

Totals: **21 units and 26 distinct Chromium cases passed; zero selected skips.** Additional repeated desktop/review checks are not counted as new coverage. Production build is an artifact check, not live acceptance or a performance claim. Fixtures use synthetic authorization/site/asset routes and exercise the real workspace, PNG codec and draft UI.

Commands (one browser worker, retries zero):

```sh
corepack pnpm --filter @retrodesk/web exec vitest run src/features/paint/saveDrawing.test.ts src/features/paint/keyboardCursor.test.ts src/features/editor/editorLocalWork.test.ts src/i18n/resources.test.ts src/i18n/translationQuality.test.ts
PATH=/tmp/retro-pnpm-bin:$PATH PLAYWRIGHT_PORT=5338 corepack pnpm exec playwright test tests/e2e/paint-editor-save.spec.ts --workers=1 --retries=0 --output=test-results/paint-editor-final
PATH=/tmp/retro-pnpm-bin:$PATH corepack pnpm exec playwright test --config playwright.paint-operation.config.ts --workers=1 --retries=0
PATH=/tmp/retro-pnpm-bin:$PATH PLAYWRIGHT_PORT=5339 corepack pnpm exec playwright test --config playwright.paint.config.ts --workers=1 --retries=0 --output=test-results/paint-engine-final
VITE_API_URL=http://127.0.0.1:5197 corepack pnpm --filter @retrodesk/web build
```

## Corrections and review

This was not a first-pass success. Attempt 1 passed two cases, then waited for a load that a dismissed native reload intentionally cancelled. Attempt 2 passed three, then exposed a missing await on Playwright Download.path. Attempt 3 passed five, then timed out on an incorrect translated Stay label in the new review test. Those three harness errors were corrected; logs are retained as historical attempts.

Independent review found a real P2: the nested leave prompt did not contain command shortcuts, allowing background document Undo while Paint considered an inserted drawing saved. `containShortcuts` now applies to that prompt, and a nested Undo/Redo regression passes. Visual review then found phone clipping despite the original body-overflow assertion passing. The card now has viewport max-width/min-width bounds, with direct dialog/control-bound assertions at 320/390px. The reviewer cleared both changes, reporting no remaining blocker in snapshot saving, receipt retry, session/permission guards or shared modal behavior. The reviewer did not run tests.

Screenshots were opened and visually checked: [desktop](evidence/paint-editor-desktop.png), [320px](evidence/paint-editor-320.png), [390px](evidence/paint-editor-390.png). Phone captures are viewport-only so capture does not change the editor device classification.

## Remaining decisions

This is the formal editor utility/save/export slice, not completion of all #53 roadmap work. A standalone canonical Paint module, visitor playground, advanced host frames and native-device acceptance remain separate. Saving to a new #51 Image window is deferred while its production authoring flag remains off. Draft insertion relies on existing autosave/conflict recovery; the UI does not claim publication or cancellation of already sent uploads. A discarded/failed insertion may leave an uploaded private asset, following existing upload behavior.

Merge, combined acceptance, release/deployment and authenticated staging acceptance belong to the parent/release owner. Existing staging 403 boundaries remain in force. #29/#50 and image-field UX belong to the parallel owners; this branch does not change them.
