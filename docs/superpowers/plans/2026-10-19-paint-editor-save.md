# Paint Editor Save Implementation Plan

**Goal:** Add a real editor Paint utility that saves a new PNG to a new Gallery in the existing draft and exports locally.

**Architecture:** Lazy Paint dialog reuses engine/workspace. Ephemeral unsaved-work registration joins the existing leave guard. Site/session validation gates upload receipts and a single existing draft transaction; no new canonical type or rollout toggle.

**Tech Stack:** React, TypeScript, Canvas2D, existing asset API/Zustand draft store, Vitest and Playwright.

## Tasks

- [x] Add `editorLocalWork.ts` with `registerEditorLocalWork(siteId, dirty)` returning cleanup, and `hasUnsavedEditorLocalWork(siteId)`. Test site isolation, cleanup and live dirty callbacks. Query it from editorSession.hasUnsavedWork.
- [x] Extend PaintEngine with public revision identity and revision-aware markSaved. Extend PaintWorkspace with optional async PNG save and save labels. Capture revision before encoding, serialize requests, check mount before callbacks, and mark only the encoded revision saved. Stop handled canvas command shortcuts from reaching site history. Existing debug/local-only API stays compatible.
- [x] Add lazy PaintEditorEntry and PaintEditorDialog. Reuse api.uploadAsset and registry gallery factory. Validate site/role/session before/after upload, reuse receipt for identical revision, append one Gallery with one asset in one replaceDocument call, then select it. Keep canvas on error. Add close confirmation and local-work registration. Add EditorPage toolbar entry disabled by upgrade/permissions; production image flags unchanged.
- [x] Add scoped four-language modules.paint copy and Paint label adapter. Topmost-modal key handling must respect nested leave prompt; no generic UI redesign.
- [x] Run focused local-work/revision units, existing Paint operation/import interactions plus new editor save/export/session regressions. Verify320/390/desktop screenshots and one web typecheck/build as needed for production debug exclusion. Open Draft PR and obtain independent read-only review; fix concrete findings only.

## Open issue triage

- #51: schema/readers/simple+none/decorative/private projection and gated authoring are implemented. Advanced frame presets/actions/animation lifecycle remain; production image writer rollout and live authenticated acceptance are not complete and remain outside this slice.
- #53: bounded engine/tools/history/import/export are implemented and fixture-tested. Formal editor entry/site save is genuinely missing and is this slice. Standalone module schema, visitor playground, advanced frames and native Pencil/Safari acceptance remain separate.
- #29: shared destination/picker/navigation foundation and R1 are implemented. Remaining entrance coverage and #50 action/dialog layers belong to parallel owners; no implementation here.
- #50: configurable action schema/editor and reusable authored dialogs remain distinct work; existing links/session navigation are not evidence that arbitrary actions are finished.
- #119 editor UX: completed, merged and staging Web deployed at8e2e542; source/local tests passed. Authenticated staging acceptance remains limited by403; arbitrary local-field buffers are not all preserved. Do not recreate completed fixes.
- #76/PR96: security boundary proposal remains approval-sensitive; untouched.
