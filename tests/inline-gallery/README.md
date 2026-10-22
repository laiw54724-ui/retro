# Gallery inline editor verification

Base: `f94ef89ab31fc5d50f39ca86375b2578b9d51670`.

Implementation follows the supplied GalleryEditor executable handoff: fixed toolbar/status, thumbnail grid, single detail pane on the right or below, whole-editor file drop, multiline URL input and drag/keyboard ordering. Reference runtime and sample content are not shipped.

Validation:

- `pnpm typecheck` and `pnpm lint`: passed across all workspaces.
- `pnpm test:unit`: 206 shared + 232 API + 488 web + 3 image-rollout checks passed (929 total).
- `PLAYWRIGHT_PORT=5797 pnpm exec playwright test --config tests/inline-gallery/playwright.config.ts`: gallery plus existing media tasks passed in Chromium/WebKit (42 checks before the final two additional scenarios).
- Final focused `inline-gallery.spec.ts`: 18/18 passed in Chromium/WebKit, including desktop and 320/375/390/430px, 500px short viewport, keyboard cancel/focus, drag sorting, mixed file validation, multi-file drop/retry, IME, shared URL normalization and stale replacement isolation.
- Existing media scenarios: 28/28 across Chromium/WebKit. Includes retry order, editing during upload, target-window isolation, Undo, caption/alt independence, saved reload, public projection and Lightbox, adjacent document/avatar/icon upload behavior.
- Adjacent `navigation-focus.spec.ts` and `editor-save-session.spec.ts`: 32/32 Chromium checks passed on a fresh server. An earlier run overlapped Vite hot updates; its immediate-exit and dynamically imported theme-store checks failed, then both passed on recheck and the entire clean-server suite passed.
- Independent review found a cancellation focus defect; fixed and independently verified in Chromium/WebKit. Final review has no remaining findings.

Screenshots in `evidence/` use synthetic data and intentionally broken images to verify failure rendering and long-text containment. All five checked-in viewport screenshots were visually inspected against the executable reference. The desktop capture has a 760px gallery inside a 1440px viewport; phone captures use the actual mobile authoring shell.

The dedicated fixture loads the four-language delta's Traditional Chinese values into its local session. Existing media tests run with unmodified catalogs, exercising the fallback keys. Deep-merge `apps/web/src/features/modules/gallery/locale-deltas/{zh-Hant,en,ja,ko}.json` in the shared locale integration before release. Locale keys and nonempty values are unit checked across all four languages.

Compatibility choices: caption and alt stay separate; existing `normalizeImageUrl` HTTPS-only and Google Drive behavior is preserved; no shared renderer, schema, media queue, permissions, flags, loader, build or deployment changes. Initial first-image selection stays available for existing workflows; explicit deselection closes the pane.

Not verified: physical iOS/Android devices or real soft keyboards, native OS drag-and-drop/file-picker dialogs, screen-reader speech, deployed storage/auth/network, and final four-module combined integration. Browser upload/save/public flows use local API fixtures. No deployment or merge was performed.
