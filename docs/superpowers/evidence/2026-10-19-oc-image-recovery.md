# OC image editor recovery evidence

Base: `8e2e54241ecca4c79cb5d6190e7b4b0beb804075` (main, #119).
Branch: `codex/image-editor-recovery`.
Implemented in an isolated checkout; other workspaces were left unchanged.

## Audit: real gaps and already solved work

| Surface | Finding / disposition |
| --- | --- |
| Canonical OC avatar | **Fixed:** bare async upload could overwrite newer URL/file choices. Now uses the editor queue, per-profile source slot, current canonical target checks, visible progress/failure/retry, Cancel upload and Remove avatar. Only avatar fields change; current profile metadata is preserved. |
| Canonical IG posts/carousel | **Fixed:** URL controls existed but several had only placeholder/aria labels. Visible labels now remain readable on phones. Existing post uploads are additive, not source replacement, and were not rewritten. |
| Canonical highlights | **Fixed:** existing pages lacked source replacement. A visible validated URL field now replaces the source in place, preserving ID, text, alt and order. New-page URL control is visibly labeled. |
| Gallery/albums | Already has visible add/replacement URL, per-file failure/retry, selected-order recovery, stable IDs, and source/history invalidation. No duplicate implementation. |
| About, Document, Character, Moodboard, custom icons, music covers | Existing source controls and shared scoped-media protections inspected; #116 already exposes the previously missing Character/Moodboard URLs. Theme preview and wallpaper handling are also already implemented. |
| File picker | Already resets its input after selection, enabling the same file to be chosen again. New browser coverage exercises that behavior with avatar source supersession. |
| #51 single image | Local DEV/API-gated upload/URL authoring and none/simple source-preserving presentation already exist. Production writer gates remain unchanged. This PR does not complete #51. |

## Implementation boundary

Additive `profileAvatarMedia.ts` applies `updateProfile` to the latest canonical store document and uses the existing legacy projection/history path. It shares `EditorMediaProvider`'s history/reload/access invalidation and `UploadTaskQueue`'s timeout, retry and discarded-completion behavior. Scope is the canonical site/profile, so two windows editing the same avatar supersede the same source slot. Switching OC leaves a valid pending request attached to the original OC; deleting that OC or the initiating window invalidates it.

`ProfileAvatarEditor` owns only image controls. Its URL typing invalidates pending/retryable uploads before blur; choosing a new file or removing the avatar resets the local URL field. Valid URL commits preserve focus. Existing IG identity draft implementation is unchanged.

Shared-file overlap for integration: ProfileEditor and one ProfileEditor prop line in IgEditorWorkspace; source-control lines only in CanonicalPostEditor/CanonicalHighlightEditor; appended `imageControls` keys in four instagram locales. New media adapter/component/CSS/tests are isolated. No EditorPage, store, shared ui.tsx, theme, Paint, navigation or action changes.

## Verification and actual results

- Baseline focused media/IG units: **33 passed**.
- Final avatar/media/IG units: **45 passed**, including **12 new avatar tests**. Covers current metadata preservation, original-profile ownership after switching, same-file supersession with old response last, unfinished URL/cancel, retry deduplication, source replacement/removal, undo+redo, deletion, viewer access, site change and reload.
- Four-locale resource/translation checks: **13 passed**. Total final focused units/resources: **58 passed**.
- Web TypeScript check: **passed** after correcting the initial missing translation key and fixture setSite arguments.
- Chromium: **17 distinct cases passed** in the combined focused run (6 new image cases and all 11 existing ig-validation cases), one worker, retries 0, no skips. New cases cover delayed URL overwrite, invalid/corrected URL, repeated same-file input, retry, cancellation, removal/reload, OC ownership, visible phone sources and highlight metadata preservation.
- Screenshot inspection found the newly labeled new-post URL too narrow at 320px despite passing interaction checks. Added local source-field wrapping CSS and a >140px field-width assertion. **Both affected phone cases passed again** at 320/390; they are not counted as new distinct cases.
- Final `git diff --check`: **passed**. Secret audit: **passed** (no build run).

Commands used:

```sh
corepack pnpm --filter @retrodesk/web exec vitest run src/features/media/profileAvatarMedia.test.ts src/features/media/uploadTasks.test.ts src/features/media/windowMediaSession.test.ts src/features/modules/instagram/igDraftValidation.test.ts
corepack pnpm --filter @retrodesk/web exec vitest run src/i18n/resources.test.ts src/i18n/translationQuality.test.ts
corepack pnpm --filter @retrodesk/web typecheck
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key PLAYWRIGHT_PORT=5196 corepack pnpm exec playwright test tests/e2e/oc-image-recovery.spec.ts tests/e2e/ig-validation.spec.ts --workers=1 --retries=0
# After source-field CSS change: same browser command with only oc-image-recovery.spec.ts --grep 'visible sources'
node scripts/audit-secrets.mjs
```

This executor required a temporary pnpm shim on PATH because the existing Playwright webServer invokes bare pnpm. The first local-server attempt hit sandbox listen EPERM; approved local execution succeeded. Initial browser assertions matched hidden labels too broadly and used the wrong existing post-tab caption; corrected locators before the passing run. These are actual corrections, not first-pass success.

Screenshots: [avatar 320](oc-image-recovery/avatar-320.png), [post source 320](oc-image-recovery/post-fields-320.png), [highlight source 390](oc-image-recovery/highlight-390.png).

## Remaining acceptance limits and follow-ups

- All browser API/auth/storage/image responses are local fixtures. No live provider upload, publication, staging request, WebKit/native phone, 430px, 200% zoom or ja/ko browser acceptance is claimed. No full suite/build was repeated. Combined candidate verification remains with the integration owner.
- Cancellation discards local application of the result; the existing HTTP transport has no abort API, so an unused asset may finish uploading. EditorPage's pre-existing top-level upload-error banner is not scoped to individual tasks and may still surface a late transport failure after cancellation. The queue task/source remains invalidated. This is a separate shared-transport follow-up, not a stale document write fixed here.
- Canonical post/highlight additive uploads still use their pre-existing allSettled/single-upload behavior, without per-file queue retry or history-epoch invalidation. Legacy-only IgEditForm retains untracked uploads/aria-only source labels; normal loaded v1 sites are migrated to the canonical path. These are real remaining recovery gaps, intentionally outside this bounded avatar/source-control batch.
- #51 viewer/paint presets, UiActions, GIF/WebP animation pause/lifecycle/reduced-motion acceptance and release/private-asset acceptance remain separate. No feature flag, schema/API, proxy/server-fetch expansion, SQL/migration, main push, merge, deploy, production or staging-403 bypass occurred.
