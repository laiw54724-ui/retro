# Desktop preview viewport implementation plan

Goal: allow explicit, usable desktop preview at phone widths without touching persisted data.
Architecture: shared measured viewport with pure geometry, local session state and scale-aware visitor gestures. Existing React/CSS modules/i18n/Vitest/Playwright; no new dependencies.

- [x] Pure logical canvas, fit/zoom, center/scroll and pointer-delta geometry plus focused unit tests.
- [x] Shared scoped viewport: one canvas, unscaled Fit/100%/zoom/pan controls, ResizeObserver, native scroll/pointer pan/keyboard movement, local session retention.
- [x] Integrate VisitorPreview/DraftViewer device choice and source sessions; preserve providers/exit/navigation/media paths; scale VisitorDesktop gestures only.
- [x] Add scoped four-language editor keys and focused real pointer/touch/privacy/save regressions; update superseded device-toggle assertions without weakening existing checks.
- [x] Coordinate heavy Playwright window, run focused checks, inspect screenshots and prepare Draft PR Refs #69 for publication.

## Focused validation — 2026-10-19

- Web lint/typecheck: `pnpm --filter @retrodesk/web lint` — passed.
- Unit: `pnpm --filter @retrodesk/web exec vitest run src/features/preview/desktopPreviewGeometry.test.ts src/features/editor/previewModel.test.ts src/i18n/resources.test.ts src/i18n/translationQuality.test.ts src/i18n/hardcodedText.test.ts` — 35 passed across 5 files.
- Browser: `PLAYWRIGHT_PORT=5201 pnpm exec playwright test tests/e2e/desktop-preview-viewport.spec.ts tests/e2e/preview-viewports.spec.ts tests/e2e/preview-sources.spec.ts tests/e2e/guestbook-preview.spec.ts --workers=1 --output=test-results/preview-viewport-69-final --reporter=list` — 65 passed (1.4m).
- Visual inspection: captured Fit screenshots at 320/390/430/768px and 100% at 320px in the isolated browser output; inspected 320 Fit/100% and 768 Fit. Unscaled controls and exit remain visible; Fit includes the whole canvas, while 100% scrolls within it.
- Real browser input: pointer drag/resize at fitted scale and 150%, keyboard scroll, pointer pan, actual 320px touch taps. Canonical owner/viewer fixtures show zero draft writes; device/zoom/pan preserve browser history, and closing/reopening resets local geometry.
- Existing regression checks preserve private/public source projection, independent source zoom sessions at 320px, guestbook simulation, public guestbook outside preview, single-renderer media shutdown, rotation navigation, nested Escape/Back and restored focus.
- Browser window coordinated with the image worker; all worktrees preserved. Full aggregate acceptance remains with the integrator.

Native phone/browser rotation, touch panning and pinch zoom remain pending. There is no custom pinch gesture in this slice. Fit is an overview; use 100%/zoom plus scroll/Pan for app controls. No schema/API/EditorPage/appearance/global CSS/permission changes or deployment.
