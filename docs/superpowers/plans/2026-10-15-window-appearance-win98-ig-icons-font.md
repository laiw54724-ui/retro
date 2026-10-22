# Window Appearance, Win98 IG, Icons, and Font Implementation Plan

**Goal:** Add persistent per-window title-bar styling, a default Win98 Instagram skin, a searchable supplied icon library, and universal Cubic 11 typography.

**Architecture:** Extend shared document schemas with defaulted visual fields, keep rendering decisions in small view helpers/components, and generate a static icon manifest whose images are lazy browser assets. Existing content and interaction state remain unchanged.

**Tech Stack:** TypeScript, React 19, Zod, CSS, Vite public assets, Vitest, Playwright.

---

### Task 1: Add compatible visual schema fields

**Files:**
- Modify: `packages/shared/src/site.ts`
- Modify: `packages/shared/test/site.test.ts`

- [ ] Add failing tests proving a legacy Instagram document normalizes to `skin: "win98"`, new Instagram windows default to Win98, and optional window appearance accepts solid and gradient values.
- [ ] Run `pnpm --filter @retrodesk/shared test:unit` and confirm the new assertions fail.
- [ ] Add `WindowAppearanceSchema`, default Instagram `skin`, and factory defaults while preserving the optional inheritance model.
- [ ] Run the shared unit suite and typecheck; expect all tests to pass.
- [ ] Commit the schema and tests.

### Task 2: Render and edit per-window title bars

**Files:**
- Modify: `apps/web/src/components/RetroWindow.tsx`
- Modify: `apps/web/src/features/editor/DesktopCanvas.tsx`
- Modify: `apps/web/src/features/editor/MobileEditor.tsx`
- Modify: `apps/web/src/features/site/VisitorDesktop.tsx`
- Modify: `apps/web/src/features/editor/RightPanel.tsx`
- Modify: `apps/web/src/styles/w98.css`
- Modify: `tests/e2e/editor-layout.spec.ts`

- [ ] Add an E2E test that customizes one selected window, verifies its gradient without changing another window, disables the gradient, and resets to theme inheritance.
- [ ] Run the focused Playwright test and confirm it fails because controls are absent.
- [ ] Pass the selected window appearance into `RetroWindow`, derive the active background and readable text, and add inspector controls under Layout.
- [ ] Run the focused test and existing editor window tests; expect them to pass.
- [ ] Commit the title-bar feature.

### Task 3: Add the Win98 Instagram skin

**Files:**
- Modify: `apps/web/src/features/modules/instagram/index.tsx`
- Modify: `apps/web/src/features/modules/instagram/IgEditForm.tsx`
- Modify: `apps/web/src/features/modules/instagram/IgPreview.tsx`
- Modify: `apps/web/src/styles/ig.css`
- Modify: `tests/e2e/instagram.spec.ts`

- [ ] Add a failing E2E test asserting Win98 is the default skin, its class is present, and switching to Modern persists and preserves internal scrolling.
- [ ] Run the focused Instagram suite and confirm the new test fails.
- [ ] Add the skin selector, `ig-skin-win98`/`ig-skin-modern` root classes, and scoped Win98 presentation rules while leaving interaction markup and session behavior shared.
- [ ] Run all Instagram tests and confirm they pass.
- [ ] Commit the Instagram skin.

### Task 4: Import and search the supplied Win98 icons

**Files:**
- Create: `apps/web/public/win98-icons/*.png`
- Create: `apps/web/src/lib/win98IconManifest.ts`
- Modify: `apps/web/src/lib/icons.ts`
- Modify: `apps/web/src/features/modules/links/IconPicker.tsx`
- Modify: `apps/web/src/styles/w98.css`
- Create: `tests/e2e/icon-picker.spec.ts`

- [ ] Add a failing E2E test for curated results, filename search, selecting a static Win98 icon, and fallback for a missing static path.
- [ ] Run the focused test and confirm the search UI is missing.
- [ ] Mechanically copy only PNG files, generate a stable sorted manifest, define the curated keys, teach `iconBackground` to accept same-origin Win98 paths, and add a capped searchable picker section.
- [ ] Run the focused test and build; confirm images resolve without bundling every PNG into JavaScript.
- [ ] Commit static assets, manifest, picker, and tests.

### Task 5: Enforce Cubic 11 everywhere

**Files:**
- Modify: `apps/web/src/lib/themeView.ts`
- Modify: `apps/web/src/styles/global.css`
- Modify: `apps/web/src/styles/w98.css`
- Modify: `apps/web/src/features/modules/instagram/IgPreview.tsx`
- Modify: `tests/e2e/responsive.spec.ts`

- [ ] Add failing desktop and mobile computed-style assertions expecting `Cubic 11` on body, editor brand, controls, and Instagram.
- [ ] Run the focused test and confirm at least the Pixelify/theme-derived surfaces fail.
- [ ] Make the Cubic 11 stack authoritative in theme rendering and remove component overrides that take precedence over it.
- [ ] Run responsive and Instagram suites; expect all typography assertions to pass.
- [ ] Commit the typography fix.

### Task 6: Full verification and staging deployment

**Files:**
- Modify only if verification exposes a defect in the files above.

- [ ] Run `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, and `pnpm build`; expect exit code 0.
- [ ] Run `pnpm test:e2e`; expect the complete suite to pass.
- [ ] Run the Impeccable detector once and review only new actionable findings.
- [ ] Capture one phone, one tablet, and one desktop-Instagram visual pass; batch-fix defects once and perform one final confirmation.
- [ ] Build with the existing staging API and Supabase public configuration.
- [ ] Deploy `apps/web/dist` to the `retrodesk-staging` Pages project and smoke-test the canonical Pages URL plus API health endpoint.
- [ ] Push the feature branch and report the staging URL, commit, verification totals, and any non-blocking warnings.

