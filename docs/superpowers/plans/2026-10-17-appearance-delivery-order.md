# Appearance and template delivery order

**Goal:** Complete #35 appearance customization before shipping #36 template storage and sharing.

**Architecture:** First establish one appearance resolver and shared editor controls for desktop and mobile. Expand the validated appearance contract through every renderer, then serialize only those supported fields into reusable templates. Cloud sharing publishes immutable template versions with separate asset copies; it never serializes a whole site as a theme.

**Tech Stack:** Existing React 19, Zustand, Zod, Vitest, Playwright; later existing Supabase and object storage.

## Dependency graph and release gates

| Phase | Scope | Depends on | Exit gate |
| --- | --- | --- | --- |
| P1 | #35 A: existing titlebar parity; shared title editor; mobile theme preview/apply/cancel; stop title swatches changing accent | merged #34 | resolver tests, desktop/mobile editor/preview/public E2E, history and persisted appearance preserved |
| P2 | #35 B/C: optional global/window title text, inactive colors, frame/content/desktop-label colors, field reset and scoped tokens | P1 | old/new schemas survive v1/v2 adapters, export/import, save/reload/publish; adjacent-window isolation |
| P3 | #35 D1/D2: wallpaper fitting, typography, icon dimensions, control states; document/links/gallery/IG appearance | P2 | every setting has schema → controls → preview → published rendering on desktop/mobile; preserve content overrides |
| P4 | #35 D3: remaining apps, window geometry details, taskbar/start/clock and scrollbar appearance | P3 | per-app visual tests; music session, gallery media, Moodboard content and guestbook rules unchanged |
| P5 | #35 D4 = #36 T1: one style-only package, local presets, name/copy/delete, JSON import/export, single-window styles | P4 | allowlisted extraction, no content/private asset URLs, version validation, apply/cancel/undo, missing asset diagnostics |
| P6 | #36 T2: cloud library, immutable versions, private/unlisted/public sharing, asset copies and bookmarks | P5 | A→B share/preview/copy/apply, permission checks, deletion/update independence, retry/cleanup and quotas |
| P7 | #36 T3: searchable public library, filters, attribution/remix, report/takedown | P6 | discover→preview→copy→remix flow, moderation and cache invalidation |

P1–P4 complete appearance customization before template storage/sharing, as requested on 2026-10-17. This supersedes #36's earlier suggestion to start T1 before all #35 R1/R2 settings. P5 is one shared delivery, not duplicate work. #35 stays open until P5; #36 stays open until P7. Optional #35 R3 effects do not block either issue. #32/#33 supply future localization infrastructure; existing Traditional Chinese UI can ship without waiting. #29/#31 navigation/provider work is independent; use their established interfaces if present, never alter their content semantics.

## P1 implementation tasks (this batch)

- [x] Add `apps/web/src/lib/windowAppearance.test.ts` for inherited theme title, solid override with irrelevant end color, gradient override, inactive fallback, and no input mutation. Add E2E fixture in `tests/e2e/appearance.spec.ts` with two differently styled windows and exercise real `.retro-titlebar` / `.m-win-title` computed CSS.
- [x] Run the resolver test red: `pnpm --filter @retrodesk/web exec vitest run src/lib/windowAppearance.test.ts`. Expected missing module until implementation.
- [x] Create `apps/web/src/lib/windowAppearance.ts` exporting `resolveWindowAppearance(theme, appearance?, active = true)` returning `{ titleBackground, titleColor }`. Use `themeView` for global/inactive values and `readableOn` for the explicit active colors. Existing schema remains unchanged in P1.

```ts
const view = themeView(theme);
if (!active) return { titleBackground: view.inactiveTitle, titleColor: view.text };
if (!appearance) return { titleBackground: view.titleBg, titleColor: view.titleText };
return {
  titleBackground: appearance.titleGradient
    ? `linear-gradient(90deg, ${appearance.titleFrom}, ${appearance.titleTo})`
    : appearance.titleFrom,
  titleColor: readableOn(appearance.titleFrom, appearance.titleGradient ? appearance.titleTo : appearance.titleFrom)
};
```

- [x] Replace duplicated active/inactive calculations in `components/RetroWindow.tsx`; resolve `openWindow.appearance` in `features/site/MobileScreen.tsx`. Keep close/back/focus/playback behavior unchanged.
- [x] Extract existing title controls from `features/editor/RightPanel.tsx` into `features/editor/WindowAppearanceEditor.tsx`, shared with MobileEdit. Keep existing labels and immediate per-window history behavior; share actual resolver for the preview and support active/inactive preview. Local hex-input drafts validate six-digit colors before writing, with visible errors and reset on blur.
- [x] Extract `ThemeTab` into `features/editor/ThemeAppearanceEditor.tsx` with the existing stateful preview/apply/cancel model. Both LeftPanel and MobileScreen consume it, including wallpaper upload. Remove only `accent: from` from title swatch patch; full presets retain their complete theme. Use `useThemeView(draft)` for authorized wallpaper previews. Add freely entered title start/end colors using the shared validated color input.
- [x] Add scoped responsive CSS for shared color controls in `styles/w98.css`: `minmax(0, 1fr)` columns, touch inputs/buttons at least 44px inside mobile sheets, previews wrapping correctly. Preserve Win98 appearance.
- [x] Add history test to `features/editor/store.test.ts`: applying a theme creates one undo entry and retains both canonical and rendered per-window appearance and profile data. Save/reload/duplicate/public-projection tests retain the existing appearance schema.
- [x] E2E: desktop editor and public title backgrounds/text match; mobile editor/public across 320/375/430px; mobile preview/cancel causes no save; apply causes one history change; window color edits survive save/reload and return to inheritance after reset; changing title swatches retains accent; screenshot desktop and mobile examples.
- [x] Run `pnpm --filter @retrodesk/shared test:unit`, `pnpm --filter @retrodesk/web test:unit`, `pnpm typecheck`, `pnpm build`, then `PLAYWRIGHT_PORT=5186 pnpm exec playwright test tests/e2e/appearance.spec.ts tests/e2e/editor-windows.spec.ts tests/e2e/public.spec.ts --workers=2`. Run relevant responsive tests after the shared mobile settings change.
- [x] Inspect desktop/mobile screenshots in one batch; fix discovered defects together, confirm once. Record browser scope; emulation is not a real-device pass.
- [x] Commit tested batch, open draft PR referencing #35 and #36 without closing them, attach PR, update both issue progress sections with links and remaining phases.

## Subsequent batch boundaries

P2 extends `packages/shared/src/site.ts`/`site-versioning.ts`, `lib/windowAppearance.ts`/`themeView.ts`, the shared controls and `WindowRenderer`, then DesktopCanvas/VisitorDesktop/MobileScreen labels. P3/P4 add module-owned presentation fields with old defaults and explicit content precedence. P5 adds a shared appearance-package schema and local library using this same field set. P6/P7 add authenticated template routes and migrations only after that format is proven. Each subsequent batch gets its own implementation plan and tests against its actual merged base; this order document is not a claim that those phases are implemented.

## P1 verification and handoff — 2026-10-17

Implemented in [draft PR #38](https://github.com/laiw54724-ui/retro/pull/38), rebased onto main ea7b44d (includes #37). P1 is implemented and locally validated, pending review/merge; P2–P7 remain unimplemented. #35/#36 remain open.

- Red/green: existing theme/history baseline 8 tests passed; new resolver test failed with missing module, then passed after implementation.
- Final `pnpm typecheck`: all three packages passed.
- Final `pnpm test:unit`: shared 75 + web 63 + API 106 = 244 passed.
- Final `pnpm --filter @retrodesk/web build`: passed. Existing >500KB bundle and upstream Zod annotation warnings remain. API deployment build was not run because no API production code changed.
- Final Chromium: appearance 8 + responsive 26 + editor-windows 1 + public 8 = 43 passed. Command: `NODE_PATH=./apps/web/node_modules PLAYWRIGHT_PORT=5186 node node_modules/@playwright/test/cli.js test tests/e2e/appearance.spec.ts tests/e2e/responsive.spec.ts tests/e2e/editor-windows.spec.ts tests/e2e/public.spec.ts --workers=2` against an independently started local Vite server.
- New E2E fixtures use canonical v2, preventing automatic v1 migration writes from being mistaken for preview writes; cancellation is observed beyond the 650ms autosave debounce.
- Desktop/mobile screenshots inspected in two bounded passes. Fixed mobile touch swatch sizes and kept apply/cancel sticky in the scrollable sheet. Seven touched UI components scanned by impeccable detector: no findings. No claim of full accessibility conformance or real-device Safari/Android verification.
- Initial offline dependency installation was unable to run esbuild/workerd scripts on the old base. Direct installed tool binaries allowed baseline checks. The subsequent main #37 update explicitly permits these builds; standard pnpm commands then passed. No dependency or build-policy changes are included in this PR.
- No schema changes, migration, cloud sharing, deployment or automatic issue closure in P1. The next independent batch is P2: optional color contract, field-level inheritance/reset and all-renderer wiring.
