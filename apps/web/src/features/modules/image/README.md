# Image module leaf (Issue #51 W3b)

`ImageView` reads the shared image content contract through the W3a `ImagePresentation`. `ImageInlineEditor` edits source, alt text, caption, fit, crop, background, and pixel rendering through the normal `ModuleProps<"image">.update` callback. Each toggle, source change, or completed upload is one history update; typing and slider drags use field-specific history keys.

Uploads use `useWindowMedia` with a single `source` slot. Choosing another file supersedes the pending one. A URL edit, source removal, undo, site switch, or window deletion invalidates pending work. Only a successful current upload writes the returned stable asset reference; neither file bytes nor a temporary blob URL enter the document. Retry uses the existing media queue.

The leaf is deliberately unregistered. The central reader/compatibility change owns schema, registry, store and add-surface gating. The standalone debug page is disposable and uses local synthetic images; it does not save or upload to a site. The editor does not expose `frameMode: none` until the outer window shell can truly support frameless images. Existing `none` content still renders through W3a, but the current outer shell can remain opaque.

Focused verification after the shared image contract is present:

```sh
corepack pnpm --filter @retrodesk/web typecheck
corepack pnpm --filter @retrodesk/web exec vitest run src/features/modules/image/model.test.ts
corepack pnpm exec playwright test --config playwright.image-w3b.config.ts
```
