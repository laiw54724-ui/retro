# Component operations phase one implementation plan

**Goal:** Fix the four reproducible author/visitor operation problems in #39 and #40.

**Architecture:** Keep the existing module registry and data schema. Use local stable editing identities for OC custom fields, native button activation for Moodboard selection, a scoped focus loop for the Gallery lightbox, and an inner scrolling surface for wide Minesweeper boards. Each correction preserves existing pointer and visual behavior.

**Tech Stack:** React, TypeScript, CSS, Playwright, pnpm.

---

## Files and responsibilities

- `apps/web/src/features/modules/instagram/ProfileEditor.tsx`: stable identity for editable custom-field rows without changing persisted v2 fields.
- `apps/web/src/features/modules/moodboard/index.tsx`: keyboard and pointer selection of canvas elements.
- `apps/web/src/features/modules/gallery/index.tsx`: lightbox focus, arrow keys, close behavior, opener restoration.
- `apps/web/src/features/modules/minesweeper/index.tsx`, `apps/web/src/styles/global.css`: scrollable board width and focused-cell reachability.
- `tests/e2e/component-operations.spec.ts`: end-to-end reproduction and regression of all four operations across desktop and narrow mobile.

## Task 1: Write red browser checks

- [x] Create one canonical v2 editor fixture with published OC profile and custom fields; type three letters into the first field and assert full text/focus, then delete an earlier row and edit the following one.
- [x] Create a two-element Moodboard fixture; focus the second canvas button, press Enter and Space, assert its `aria-pressed` and inspector content change.
- [x] Create a two-image Gallery fixture; open the lightbox, Tab/Shift+Tab across controls, assert focus stays inside, use arrows, close by Escape, assert focus returns to source thumbnail.
- [x] Create a 12-column Minesweeper fixture at 320px; assert a bounded horizontal scrolling region, focus the rightmost cell using arrow keys, assert it is in view and remains operable.
- [x] Run `NODE_PATH=./apps/web/node_modules PLAYWRIGHT_PORT=5193 node node_modules/@playwright/test/cli.js test tests/e2e/component-operations.spec.ts --workers=1`; expect each new scenario to fail against baseline. Use a local Vite server on 5193 because package scripts may need sandbox approval.

## Task 2: OC stable field keys (#40)

- [x] Add a component-local `useRef` containing a profile ID and row IDs. When profile changes, reset IDs; when a row is added/deleted, append/splice the corresponding ID before updating `customFields`; when an external undo changes list length, reconcile IDs by length.
- [x] Render custom-field rows with the stable ID; keep the existing `profile.customFields` shape and update-by-index values. Do not change published schema or migration.
- [x] Re-run the OC case; expect uninterrupted typing and editing of the surviving field after deletion.

## Task 3: Moodboard native activation (#40)

- [x] Give each canvas button an `onClick` that selects `element.id`; retain pointerDown selection and pointer capture only for dragging. Native button Enter/Space then works without separate custom keyboard simulation.
- [x] Re-run the Moodboard case; expect the inspector to follow keyboard selection while pointer drag, lock, nudge and undo still pass existing tests.

## Task 4: Gallery focus scope (#39)

- [x] Capture the opening thumbnail before `setOpen(index)`. On close, return focus to it if still connected; otherwise focus the first thumbnail.
- [x] In Lightbox, handle Tab boundaries, Escape and ArrowLeft/ArrowRight. Keep close autofocus. Disable previous/next on a single image. Do not trap focus after the lightbox unmounts.
- [x] Re-run the Gallery case; expect focus loop, arrow navigation and opener restoration on desktop and mobile.

## Task 5: Wide Minesweeper board (#39)

- [x] Wrap the grid in a width-limited horizontal scroll region; give the grid its minimum content width so cells stay at least 30px wide. Add a short mobile hint when configured columns can overflow.
- [x] On keyboard arrow navigation, focus and `scrollIntoView({ block: "nearest", inline: "nearest" })` on the target cell. Keep the flag mode and restart controls outside the scrolling region.
- [x] Re-run at 320/375/430px and columns 5/8/12. The last cell must be reachable without document-level horizontal overflow.

## Task 6: Verify and hand off

- [x] Run `pnpm typecheck`, `pnpm test:unit`, `pnpm --filter @retrodesk/web build` and scoped Playwright suites: new operations plus `oc-profiles.spec.ts`, `moodboard.spec.ts`, `desktop-toys.spec.ts`, `responsive.spec.ts`, `public.spec.ts`.
- [x] Inspect one desktop and one 320px mobile screenshot in a bounded pass; record any real device limitation.
- [ ] Check `git diff --check` and repository status, commit on `codex/component-operation-fixes`, push, open and attach a draft PR citing #39, #40 and #46. Leave the issues open until review/merge.

The operations are independent of PR #38's title appearance changes. The branch starts from main `ea7b44d`; merging #38 later should retain both sets of changes.

## Verification — 2026-10-17

- Red checks reproduced OC `RoleXYZ` becoming `RoleX`, Moodboard Enter leaving the old selection, and Gallery Tab escaping the lightbox. A separate red check exposed duplicate desktop/mobile cell IDs when a game opens by default.
- Green: 12 focused Chromium scenarios cover desktop/mobile OC typing and reload, Moodboard Enter/Space, Gallery focus/arrow/single image, and Minesweeper widths 320/375/430px with 5/8/12 columns.
- Regression: 69 Chromium tests across component operations, OC profiles, Moodboard, desktop toys, responsive layout and public desktop passed before adding the two final boundary assertions; the focused suite passed again with those assertions.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (shared 74 + web 58 + API 106 = 238), and `pnpm --filter @retrodesk/web build` passed. Build reported existing Zod annotation and large bundle warnings.
- Desktop Gallery and 320px Minesweeper screenshots were inspected. The code scanner reported an existing `border-left:5px` Win98 style at `global.css:3`; it was unchanged by this branch and is a visual-rule false positive for this product.
- Browser checks used Chromium emulation. Real-device Safari/Android and native Chinese/Japanese/Korean IME composition were not measured; stable row keys remove the observed React remount that interrupted typing.
