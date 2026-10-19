# Inline editor preservation implementation plan

**Goal:** Fix three reproduced #43 follow-up defects without repeating delivered media support.

**Architecture:** Keep mutations in the document/gallery inline editors and their existing history recipes. Reuse `restoreFocusUnlessMoved` for deletion so a later user choice wins. Guard gallery URL submission during composition; retain the existing URL normalization and upload pipeline.

**Tech stack:** React, TypeScript, Zustand history, Playwright Chromium.

## Source and delivered scope

Base: PR #84 `a53821189f02f4ad8329d77a9049acefd91f13e1`, branch `integration/retro-night-quality-01`; verified GitHub repo ID 1420412178 and local origin `https://github.com/laiw54724-ui/retro.git`. #47 (`6533573`), #59 (`2fc71457`), and #65 (`3835770`) are ancestors. Latest issues/PRs and #43 comments read before implementation. No tracked or checkout AGENTS.md / .agents/skills found.

Already delivered: sequential upload statuses/retry/order/original-target protection, gallery thumbnail properties, independent caption/alt with legacy fallbacks, About sections/mobile stacking, lightbox focus. These are retained, not new claims.

## Reproduction and design

The new `tests/e2e/inline-editor-preservation.spec.ts` failed all three initial cases on the base:

1. A gallery Add URL composition-confirmation Enter inserted a fourth image and cleared the unfinished URL (expected three).
2. Deleting the middle gallery image lost keyboard focus and selected the first image instead of its next neighbor.
3. Deleting a document image block lost keyboard focus instead of reaching the surviving paragraph.

Chosen approach: module-local guards and deletion focus recovery. A shared field/core rewrite would touch unrelated modules; delaying all edits until blur would weaken existing autosave/history behavior. No schema, translation, global CSS, shared shell, links, music, guestbook, Moodboard, or upload core changes are needed.

## Tasks

- [x] Add failing browser cases using ordinary image/thumbnail/delete clicks and a synthetic composition event.
- [x] In gallery/index.tsx, guard composition Enter (active composition, native flag, keyCode 229), preserve URL, and permit one explicit Enter after composition ends.
- [x] In gallery/index.tsx, choose the next surviving thumbnail (previous at the end), then restore focus after deletion. Use Add URL when empty; never reclaim focus after the user moves elsewhere.
- [x] In document/index.tsx, select/focus the next surviving block (previous at the end), or the first Add control when empty, using the same guarded restoration.
- [x] Expand browser coverage for first/middle/last/empty deletion, undo/redo, URL commit on selection, long text/caption/alt persistence, and About input continuity.
- [x] Run the focused suite plus existing media task cases; run web lint/typecheck and related unit tests. Capture and inspect synthetic 320/390/430 screenshots. Record exact results and limitations below.
- [x] Commit/push own branch, open a bounded Draft PR stacked on #84, and report exact base/head. The integrator owns the single final combined gate.

## Validation and limits

Initial RED: 3/3 targeted tests failed for the expected behavior on Chromium, Node 22.21.0, pnpm 10.18.2, Playwright 1.64.1. Tests run on this worktree's strict-port Vite server at 127.0.0.1:49437, with isolated synthetic fixtures; no remote data used.

After implementation: 13 new E2E cases passed, including click/tap, first/middle/last/empty deletion, controlled composition events, selection, save/reload and desktop Undo/Redo. Existing `editor-media.spec.ts` and `media-tasks.spec.ts`: 18 passed, including five-file partial failure/retry, targeting and async upload behavior. Web lint/typecheck passed; related media unit tests: 28 passed. `git diff --check` passed. A first extended run timed out in two phone gallery cases because the test tried to click the desktop Undo button, which the phone shell hides; the corrected phone tests and a separate desktop Undo case passed. This was a test fixture mismatch, not a product fix. No full contributor gate was run; the integrator owns the combined gate.

Synthetic Chromium screenshots are in [`docs/quality/issue-43-inline-editor`](../../quality/issue-43-inline-editor): document, gallery and About at 320/390/430 px (all nine visually inspected; dimensions match viewport). The root page and editor form scroll widths were within 1 px of their client widths for the long-text cases. Mobile text areas scroll vertically within the existing phone shell; screenshots are viewport captures, not full nested-scroller captures.

Composition events establish handler behavior only, not native IME validation. Physical iOS/Android, native IME, real provider/asset servers, live persistence/RLS, deployment, and the final combined gate remain unverified here.
