# Responsive Audit and IG Scrolling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every web route responsive across the agreed viewport matrix and restore internal scrolling inside desktop Instagram windows.

**Architecture:** Consolidate responsive overrides at the end of the v2 stylesheet so they win the cascade, and give Instagram a single explicit scroll owner through a complete flex/min-height chain. Add browser tests that express the layout contract rather than relying on screenshots alone.

**Tech Stack:** React 19, TypeScript, CSS, Zustand, Playwright, Vitest, Vite

---

### Task 1: Lock the responsive contract in browser tests

**Files:**
- Create: `tests/e2e/responsive.spec.ts`
- Modify: `tests/e2e/instagram.spec.ts`

- [ ] Add parameterized tests for 320, 375, 390, 430, 768, 1024, and 1440 px that assert `documentElement.scrollWidth <= innerWidth` on landing, auth, onboarding, editor, visitor preview, and public pages.
- [ ] Add phone-editor assertions that `.left-panel2` and `.right-panel2` are hidden, the compact editor stage fills the viewport, and bottom toolbar buttons remain reachable.
- [ ] Add an Instagram fixture with content taller than its window, wheel over `.ig-scroll`, and assert `scrollTop` increases while the desktop remains at zero.
- [ ] Focus `.ig-scroll`, press `PageDown`, and assert keyboard scrolling increases `scrollTop`.
- [ ] Run `pnpm test:e2e tests/e2e/responsive.spec.ts tests/e2e/instagram.spec.ts`; expect the new assertions to fail before CSS fixes.

### Task 2: Repair the responsive cascade and page shells

**Files:**
- Modify: `apps/web/src/styles/w98.css`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/index.html`

- [ ] Add semantic classes to desktop-only topbar controls so mobile CSS can hide them without fragile child selectors.
- [ ] Consolidate final phone rules for `.left-panel2`, `.right-panel2`, `.editor-topbar`, `.editor-grid2`, `.editor-stage2`, and `.editor-status2` after all base declarations.
- [ ] Add tablet rules that collapse the right panel first and keep a usable canvas width without horizontal page overflow.
- [ ] Add safe-area padding and `viewport-fit=cover`; retain the bottom toolbar in the thumb zone.
- [ ] Replace fixed typography/padding where it breaks with `clamp()` and fluid grid columns, without changing the Win98 bevel language.
- [ ] Run the responsive tests and confirm every shell assertion passes.

### Task 3: Make Instagram own its scroll region

**Files:**
- Modify: `apps/web/src/components/RetroWindow.tsx`
- Modify: `apps/web/src/features/modules/instagram/index.tsx`
- Modify: `apps/web/src/features/modules/instagram/IgPreview.tsx`
- Modify: `apps/web/src/features/modules/instagram/useIgSession.ts`
- Modify: `apps/web/src/styles/ig.css`
- Modify: `apps/web/src/styles/w98.css`

- [ ] Mark Instagram windows/modules with scoped classes rather than changing every RetroWindow overflow rule.
- [ ] Complete the `height:100%`, flex, and `min-height:0` chain from the window body to `.ig-scroll`.
- [ ] Add `tabIndex=0` and an accessible label to `.ig-scroll` so keyboard scrolling works.
- [ ] Reset `.ig-scroll.scrollTop` when `screen` or `postId` changes.
- [ ] Keep IG top and bottom navigation outside `.ig-scroll`, with only the content region scrolling.
- [ ] Run the Instagram E2E tests and confirm wheel and Page Down change only the internal scroll position.

### Task 4: Audit all routes and modules

**Files:**
- Modify as defects require: `apps/web/src/styles/global.css`, `apps/web/src/styles/w98.css`, `apps/web/src/styles/ig.css`
- Test: `tests/e2e/responsive.spec.ts`

- [ ] Capture the seven-width matrix for landing, auth, onboarding, editor, preview, and public pages in one Playwright pass.
- [ ] Inspect title wrapping, touch targets, clipped controls, competing scrollbars, safe areas, modal bounds, and horizontal overflow.
- [ ] Fix the entire observed defect batch once, preserving existing content and visual identity.
- [ ] Run the matrix once more as the final visual confirmation.

### Task 5: Verify, review, and stage

**Files:**
- Modify: `docs/BETA_ACCEPTANCE.md`

- [ ] Run `node /Users/wen/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/pages apps/web/src/features apps/web/src/styles` and resolve applicable findings.
- [ ] Run `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`, and `pnpm build`; expect all commands to pass.
- [ ] Update the responsive acceptance matrix with verified results.
- [ ] Commit the fix, push a PR, wait for CI, merge after green, apply staging-only deployment, and verify API health plus current frontend asset hashes.
