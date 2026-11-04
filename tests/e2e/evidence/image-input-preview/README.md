# Image input and theme preview evidence

Base: `92d8e0294e99dbdf0a99ac183ca04cd78004f4ec`. Branch: `codex/image-input-preview-ux`.

## Scope and audit

- Theme/background: transient canvas preview on desktop and phone. Upload or committed valid URL previews immediately. Apply creates one normal draft history step; Cancel restores applied draft. Persistent preview row survives closing the theme panel. Publishing waits for Apply/Cancel. The saved document, canonical document and autosave status are unchanged by preview.
- Wallpaper upload has loading/failure feedback, private-reference preview, explicit removal, and a source epoch invalidated by URL input, pattern/color/preset/reset, Cancel/Apply, history, site/permission changes, or unmount. Wallpaper schema has one normalized source field, not a separate raw URL field; existing normalization is retained.
- Character-dialog and Moodboard already support URL sources. Both now show labeled fields. Their uploads use the existing site/window media queue. Moodboard reserves an editable image target immediately and preserves the collection limit.
- About, Document, Gallery: source URL input invalidates only that source's older pending upload. Existing collection Add behavior is retained. Gallery add and About avatar URLs get visible labels.
- Custom icons already support URL → preview → Apply. The URL gets a visible label and typing invalidates only pending single-icon selection; pack/library uploads keep their existing behavior.
- Music cover URL remains below upload with a visible label; track draft cache and cover cancellation remain intact. The image leaf already had labeled URL, preview, and source cancellation; writer gates are unchanged.
- Instagram ProfileEditor/IgEditForm/CanonicalPostEditor/CanonicalHighlightEditor and IgPreview belong to the parallel author and have no edits here. Inspection confirms those image contracts accept URLs; there is no backend asset conversion in this branch. Canonical highlights/new posts already have URL-add controls; the other author owns their placement and input safety.
- InspectorContent's older non-image media controls are not mounted by the current RightPanel. Paint file-open and transfer archive import are local document operations, not hosted image uploads.

## Ownership / remaining integration

EditorPage changes are only early theme-preview guards in requestPublish/confirmPublish and a theme-preview-notice row immediately after the header. No autosave effect, save-error notice, Retry UI, router, or navigation lifecycle edits. The P1 save-session owner was informed to include themePreview in the leave guard. That guard must be integrated before claiming safe exit of an unsaved theme preview.

Mobile Apply/Cancel, panel close, and reload use phone-visible actions. Mobile has no touch-accessible Undo control in the current shell; history evidence is desktop keyboard plus store unit coverage. No native phone, live provider, remote upload, or publication acceptance is claimed.

## Focused verification

Commands and terminal totals are recorded in the PR. Screenshots are local Chromium fixture evidence at widths 320, 390 and 1440. API and images are intercepted fixtures. No full-site suite, WebKit/native test, merge, deployment, schema/API/network policy change, or baseline refresh.

The first browser pass exposed test locator issues (mobile Undo button does not exist; Character label is 圖片網址) and screenshot review exposed a narrow floating notice. These were corrected and affected checks rerun; this is not first-pass success.

### Terminal receipts

- `corepack pnpm --filter @retrodesk/web typecheck`: PASS.
- `corepack pnpm --filter @retrodesk/web exec vitest run src/features/editor/store.test.ts src/features/media/windowMediaSession.test.ts src/features/media/uploadTasks.test.ts src/i18n/localizedDefaults.test.ts`: 4 files, 46 passed, 0 skipped.
- `playwright test tests/e2e/appearance.spec.ts --workers=1 --retries=0`: all 8 related cases passed in the initial combined run; the three failures in that combined run were in the new spec's locators, described above.
- Final corrected `image-input-preview` cases plus the theme-tab case from `editor-layout`: 10 passed in 23.7s. The two additional Character/Moodboard delayed-upload checks then passed in 5.9s. Total final focused coverage: 11 image/preview cases + 1 existing theme-layout case, 0 skipped, retries disabled.
- `git diff --check`: PASS.

No full integration gate was requested or run. No WebKit, ja/ko browser, touch Undo, or live/native acceptance is claimed. Four locale blocks were added; locale browser acceptance is not implied by typecheck or default-content unit tests.

The save-session author confirmed coordination: their optional themePreview read will count preview as unsaved local work in the exit dialog, without applying, cancelling, saving or publishing it. Integrate the two branches before claiming safe navigation away from pending preview.
