# Canonical IG batch media recovery evidence

Dependency: Draft #121, branch `codex/image-editor-recovery`, exact base `d7e4ff69f0db049e20706abfdea580e14f1f3e07`.
Candidate branch: `codex/ig-batch-media-recovery`.
Independent worktree: `<worktree>`.
#121's branch/worktree remained unchanged. Parent coordinates integration; this candidate targets #121, not main.

## Changes and contract

- Replace canonical posts' allSettled batch and highlights' untracked single-file await with the existing editor-scoped UploadTaskQueue. No new worker, timeout, retry store or transport implementation.
- Every selected file gets a stable prospective media/frame ID and an individual task. Successful files commit independently; retry resubmits only the failed file. `insertInSelectionOrder` positions retries among surviving batch siblings without replaying removed successes, moving existing siblings or replacing their newer source/alt/text/crop data.
- Original site/profile/window/entity ownership is checked against current canonical state. OC selection alone does not redirect the upload. Reassignment/deletion, site/access changes, history/reload or editor teardown invalidate through the existing queue observer. A restored target does not revive invalidated tasks.
- New-post uploads create an editable **draft** immediately. Its title/metadata can be edited while uploads run, and the post can be deleted to cancel its tasks. Cancelling all files deliberately leaves the empty draft for the author to edit/delete; no silent deletion of work. UI copy explains this.
- Highlights accept multi-file selection within their existing 50-frame maximum; post media retains its existing maximum of 10. Pending and retryable tasks reserve remaining slots across repeated selections; omitted files are explicitly reported. Cancel/dismiss releases reservations. Existing URL additions keep their schema/capacity checks.
- A task list stays with each post/highlight even when its content editor is collapsed. Optional per-item Cancel is added to UploadTaskList for these callers only; existing callers retain their UI. Queued cancellation prevents transport invocation; active cancellation frees the logical worker and discards its eventual write. Existing upload group/aria-busy semantics are retained without disabling repeated file selection.

## Verification

- Media-focused units: **64 passed**, including **24 new canonical batch tests** (12 each for posts/highlights), plus existing queue/session and #121 avatar units. Cases cover partial failure and retry order, newer source/alt/text/metadata, removed successful siblings, later batches, same-file repeat with unique IDs, bounded slots, hung-request cancellation, late success, OC selection, target deletion/reassignment, permission/site changes, undo+redo, initiating-window deletion and reload.
- Four-locale resource/translation checks: **13 passed**. Total focused units/resources: **77 passed**.
- Web typecheck: **passed**. Diff check and secret audit: **passed**. No full suite or build run.
- Final focused Chromium run: **13 distinct tests passed**, one worker, retries 0, no skips. Includes six new batch cases, all six #121 image cases and the existing OC-delete/retarget highlight-upload regression.
- Two affected phone cases rerun to capture failure-state Retry/Cancel controls at **320/390px**: **both passed**. They are not extra distinct cases. Screenshots inspected for readable controls/wrapping: [320px](ig-batch-media-recovery/retry-320.png), [390px](ig-batch-media-recovery/retry-390.png).
- Initial browser run: four new cases passed; two highlight checks failed because the fixture used a migrated highlight ID and already contained a page. Corrected the ID lookup and asserted original frames plus newly uploaded frames. This is not first-pass success. No product failure was concealed by retries.

Commands:

```sh
corepack pnpm --filter @retrodesk/web exec vitest run src/features/media/canonicalMedia.test.ts src/features/media/uploadTasks.test.ts src/features/media/windowMediaSession.test.ts src/features/media/profileAvatarMedia.test.ts
corepack pnpm --filter @retrodesk/web exec vitest run src/i18n/resources.test.ts src/i18n/translationQuality.test.ts
corepack pnpm --filter @retrodesk/web typecheck
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key PLAYWRIGHT_PORT=5197 corepack pnpm exec playwright test tests/e2e/ig-batch-media-recovery.spec.ts tests/e2e/oc-image-recovery.spec.ts tests/e2e/oc-profiles.spec.ts --grep 'partial post batch|cancel queued|reselecting|highlight batch|switching OC keeps|URL typing|repeated file choice|explicit cancellation|switching OC during|visible sources|a delayed highlight upload' --workers=1 --retries=0
# Failure-state screenshot capture: ig-batch-media-recovery.spec.ts --grep 'highlight batch'
node scripts/audit-secrets.mjs
```

The executor needs a temporary pnpm shim on PATH for the existing Playwright webServer command. Browser auth/API/upload/image responses are local fixtures; the public-looking Supabase values above are fixture values.

## Ownership and acceptance limits

Shared modifications relative to #121: `editorMedia.tsx` optional callback/button, canonical post/highlight upload paths and appended editor/instagram locale keys. New adapter, hook, units and browser test are additive. No #121 avatar implementation, EditorPage, store, queue core, shared ui.tsx, Paint, navigation/action, schema/API or feature-gate edits.

Remaining gaps:

- Legacy-only IgEditForm uploads remain unchanged. Normal loaded v1 sites migrate to the canonical editor, but the legacy-only fallback still needs a separate recovery audit.
- Existing HTTP upload transport cannot abort and returns null on failure. Cancelled active requests may create unused assets, and the pre-existing top-level upload-error banner can remain after retry or show a late failure (visible in screenshots). Task-level status and stale document writes are handled; the global banner/typed permanent-failure distinction remains a separate shared-transport task.
- Explicit cancellation uses the existing invalidated/nonretryable task state with a cancellation explanation; the existing summary counts such records as failed. No new persistent cancellation schema was invented.
- Pending files and retry records live only in the editor session, not in canonical JSON. Reload discards local upload work; authors must reselect unfinished files. Successfully committed draft content survives reload.
- Per-selection sibling order is preserved on retry; if every sibling was removed, the retried file appends rather than reconstructing deleted ordering/content.
- No live provider upload/publication, staging, production, WebKit/native, 430px/200% zoom or ja/ko browser acceptance. No image proxy/server fetch expansion, flags, SQL/migrations, main push, merge or deploy. Broader #51 presets/actions/animation acceptance remains outside this batch.
