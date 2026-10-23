# Seven inline editors implementation plan

**Goal:** Apply the updated seven-editor handoff while preserving canonical documents, media isolation, history, permissions and four languages.

**Architecture:** Build controlled shared editing components first. Migrate the four delivered editors without replacing their data paths, then add TrackListEditor, FreeformBoardEditor and FolderTreeEditor behind existing registry exports. Preserve old component aliases for one version. Existing window.type values, schema, visitor views, upload queue, locale loader, release flags and production remain unchanged.

**Tech Stack:** React, TypeScript, i18next, Vitest and Playwright Chromium/WebKit.

- [x] Restore four delivered PRs and saved integration work; compare latest handoff manifest.
- [ ] Finish retained About/Gallery focus and legacy selector repairs; focused red/green before checkpoint.
- [ ] Add ten components in `apps/web/src/components/editing/` with isolated tests and four-language editor deltas. Controlled state belongs to the editor; no component writes canonical data itself.
- [ ] Rename MiniBtn/FilePick/ImageUrlField/SafeImg/UploadTaskList/SelectionToolbar to CompactButton/FileUploadButton/ImageUrlInput/FallbackImage/UploadProgressList/WindowActionBar; keep compatibility exports.
- [ ] Adopt primitives in Links/About/Gallery/Document, preserving caption/alt separation and schema-supported formatting; complete shared status announcements, IME, focus return and file drag accounting.
- [ ] Music: update `modules/music/` to paste classification, track list/detail pane, sortable tracks, source chip/popover, cover drops and optional metadata chips. Reuse sourceClassifier, ProviderPlayer, queue session guards, rightsNote publication validation and stopPreviewForTrack.
- [ ] Moodboard: update `modules/moodboard/` to scaled canvas, multi-selection, bounds-safe move/resize/snap, in-place text, floating tools and advanced geometry. Reuse geometry constraints, export and guarded uploads; retain keyboard access and actual PNG export.
- [ ] Explorer: update `modules/explorer/` to tree/grid navigation, multi-select drag/cut/paste, local target panel, context menu and inline folder deletion confirmation. Reuse model limits, targetCatalog/siteId, visibility and coarse-pointer behavior; keep keyboard move fallback.
- [ ] Centralize module/editor/music translation deltas in all four official catalogs and test compiled staging output without translation injection.
- [ ] Run module-focused Chromium/WebKit and meaningful unit tests during development. At the final frozen tree run contributor checks, lint, full Chromium and necessary adjacent WebKit; inspect desktop +320/375/390/430 screenshots, independent review, then Draft PR with exact base/head and unverified cases.

No merge or deployment in this iteration. No API/schema expansion, credentials, budget changes or unrelated roadmap renames. Optional NEXT_COMPONENTS consolidation and rotation are excluded from the seven-editor scope.
