# OC image recovery implementation plan

**Goal:** Prevent delayed OC avatar uploads from replacing newer source choices; expose the remaining canonical IG image URLs.

**Architecture:** Reuse the editor-scoped UploadTaskQueue and its history/access observer. Add a profile-avatar adapter that captures canonical identity/source but commits against the latest document. Keep profile identity drafts, theme previews, save-session logic and feature gates unchanged.

**Tech stack:** React, TypeScript, Zustand, Vitest, Playwright.

- [x] Add `profileAvatarMedia.ts` and focused deferred-promise tests for latest-file selection, URL typing, retry, profile switching, target deletion, undo/redo and permissions. Use existing canonical updateProfile and projection helpers; never copy a captured profile over newer metadata.
- [x] Extract `ProfileAvatarEditor.tsx` with visible URL label, upload tasks, explicit remove/cancel controls. Wire site/window identity from IgEditorWorkspace. Preserve existing source validation and file-picker reset.
- [x] Label canonical post/carousel/add-highlight URL inputs; give existing highlight pages ImageUrlField replacement, preserving frame ID, text, alt and order. Add four-locale copy only where existing labels are insufficient.
- [x] Run focused media/IG tests and web typecheck once; run local mocked Chromium regressions for repeated files, incomplete URL, stale upload, retry/remove, highlight source editing, 320/390px layouts and reload. Record actual results and limits.
- [ ] Review diff and open Draft PR. No main push, merge, deployment, staging bypass, migrations, image writer activation, external image fetch expansion, Paint or action/navigation work.

## Audit decisions

Already solved on main 8e2e542: #116 theme immediate preview and Character/Moodboard/gallery visible URLs; #115 identity drafts; #117 numeric drafts; #118 save-session protections; #112/#51 local single-image URL/upload entry and writer gates. Gallery has per-file retry and source/history invalidation. FilePick already resets to permit repeated selections.

Real gaps: canonical OC avatars use an untracked await and can overwrite later URL/file changes; no inline avatar task/retry/remove controls. Canonical IG image controls have accessibility names but some lack visible labels. Existing canonical highlight frames cannot replace their source without delete/re-add.

Deferred: canonical post/highlight additive upload queues still use their prior batch error behavior; legacy-only IG source controls remain a separate audit slice. #51 viewer presets/actions/animation lifecycle and release acceptance remain outside this batch.
