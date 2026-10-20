# Single-image module (#51)

`ImageView`, `ImageInlineEditor` and `createImageContent` use the existing strict shared image contract. The registry binds both components. Desktop canvas content remains a visual image; the selected image Inspector and phone inline editor reuse the same leaf controls.

## Local authoring acceptance

```sh
VITE_IMAGE_WINDOW_WRITER=true corepack pnpm --filter @retrodesk/web dev
corepack pnpm exec playwright test --config playwright.image-authoring.config.ts
```

The local API must advertise `writeCompatibility.imageWindow: 1` for the loaded site and API origin. Add Image and author controls stay hidden without that advertisement or while upgrade recovery is paused. Ordinary production builds remain disabled even if the variable is set. A separate default-off staging release contract requires an explicit release file, staging build mode and the exact approved Web/API origins; see `docs/quality/image-staging-rollout/RELEASE.md`. Appearance writers keep their separate existing gate. No schema version, transport marker or privacy projection changed.

Sources use `ImageUrlField` and the existing image upload pipeline (JPEG/PNG/WebP/GIF, 8 MB limit). The media queue owns a single source slot: another upload supersedes the previous request; URL/source edits, undo/redo, reload, site switch or deletion invalidate stale work. Only current stable asset references enter the canonical draft; preview blob URLs never do.

The none/simple control changes presentation only; source/crop data stays intact. Frameless desktop hosts remove actual outer chrome/background/padding. Editor objects retain a keyboard-accessible move handle, selection and existing resize/layout gestures. Visitor decorative hosts are inert and pass clicks through at the outer boundary. Phone keeps Back and editor navigation outside frameless content.

## Focused verification

```sh
corepack pnpm --filter @retrodesk/web typecheck
corepack pnpm --filter @retrodesk/web exec vitest run src/features/editor/store.image-authoring.test.ts src/features/modules/image/model.test.ts src/features/editor/ImageWriteContext.test.tsx src/lib/imageWindowCreation.test.ts
corepack pnpm exec playwright test --config playwright.image-authoring.config.ts
```

Browser fixtures mock authentication/API/upload transport and projected publication assets. They do not certify live Supabase/storage, actual publication or native mobile devices. Viewer/Paint presets, UiActions and animation pause/lifecycle controls remain later #51 work. Production writer enablement requires separate reviewed reader/API/stale-client, media/privacy and cross-browser acceptance plus release-owner approval.
