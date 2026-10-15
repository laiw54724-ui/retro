# #18A App registry contract and dispatch implementation plan

**Goal:** Extend the existing five-module registry into the single typed source for module metadata, defaults, capabilities, mobile presentation, rendering, and editor discovery without changing v1 document persistence or visitor behavior.

**Architecture:** Keep React-specific registry code in `apps/web`; shared schemas remain React-free. Each registered app declares its stable type, content schema version, window factory, View, InlineEditor, capabilities, and mobile presentation. Consumers use exported registry helpers instead of maintaining parallel module lists or directly constructing windows. The current v1 document remains the runtime input; entity resolution is an optional context boundary for later v2 activation.

**Tech stack:** React 19, TypeScript, Zod/shared types, Vitest, Playwright.

---

## Task 1: Define and test the registry contract

**Files:**
- Modify: `apps/web/src/features/modules/types.ts`
- Modify: `apps/web/src/features/modules/registry.ts`
- Add: `apps/web/src/features/modules/registry.test.ts`
- Modify: `apps/web/package.json`

1. Add typed capability flags, mobile presentation, `schemaVersion`, stable `type`, and a typed `create(index)` factory to `WindowModule`.
2. Add an optional entity-resolution boundary to `ModuleCtx` without switching the current v1 runtime to v2.
3. Register all five existing modules with explicit metadata and defaults delegated to the existing shared `makeWindow` implementation.
4. Export stable helpers for ordered definitions, metadata lookup, and window creation; reject missing or mismatched registrations in tests.
5. Add Vitest coverage for uniqueness, all five types, schema/capability metadata, and correct default factory output.

## Task 2: Route all consumers through registry helpers

**Files:**
- Modify: `apps/web/src/features/editor/store.ts`
- Modify: `apps/web/src/features/editor/LeftPanel.tsx`
- Modify: `apps/web/src/features/editor/MobileEditor.tsx`
- Modify: `apps/web/src/features/site/MobileScreen.tsx`
- Modify: `apps/web/src/features/site/WindowRenderer.tsx`

1. Make editor `addWindow` call the registry factory rather than shared `makeWindow` directly.
2. Remove the duplicated mobile module list and derive desktop/mobile add surfaces from the same ordered definitions.
3. Centralize View/InlineEditor selection behind one registry render helper so consumer components do not use unsafe component casts.
4. Preserve the existing LinkAction behavior, uploads, layout, taskbar, undo/autosave and all module CSS classes.

## Task 3: Regression verification and staging deployment

**Files:**
- Modify: `tests/e2e/editor-layout.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`

1. Add an E2E assertion that desktop and mobile add surfaces expose the same five registry-backed apps and that adding a module still creates the expected window.
2. Run web focused unit, root unit, typecheck, full E2E, production build, and `git diff --check`.
3. Complete independent spec, quality, and final reviews; fix findings and rerun affected checks.
4. Push, deploy web to Cloudflare Pages staging with existing public runtime configuration, smoke canonical/immutable URLs, and add evidence to Issue #18 while keeping it open for 18B.

## Non-goals

- No v2 write activation or automatic migration in the editor/API.
- No dynamic third-party JavaScript/plugin loading.
- No Music/Paint/Explorer schema implementation yet.
- No publication/media privacy claim; that remains #18B.
