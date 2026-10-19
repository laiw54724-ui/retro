# Image Reader Compatibility Implementation Plan

> **For agentic workers:** Execute inline as the sole central schema/API owner. The separately assigned image worker owns the leaf UI and its review; no central files are delegated.

**Goal:** Accept and preserve the bounded image window in readers and the existing media pipeline while image creation stays disabled.

**Architecture:** Add the same strict content schema to v1 and v2, retaining the existing title and media reference contracts. A separate transport contract protects raw incoming and stored image windows before parsing; it does not change the appearance contract, authentication, authorization, or version CAS. The image worker confirmed this contract before implementation.

**Tech Stack:** TypeScript, Zod, Hono, React/Zustand, Vitest, Playwright.

## Agreed content contract

```ts
type ImageContent = {
  src: ImageUrl | null;
  srcUrl: string; // max 2048; raw authoring input, existing media semantics
  alt: string; // max 300
  caption: string; // max 300
  fit: "contain" | "cover" | "original";
  crop?: { x: number; y: number; zoom: number }; // 0..100, 0..100, 1..4; strict
  background: "transparent" | "checker" | { color: string }; // strict six-digit hex
  pixelated: boolean;
  showCaption: boolean;
  frameMode: "none" | "simple";
  interactionMode: "content" | "decorative";
};
```

Defaults: null source, empty strings, contain, transparent, false pixelated, true caption, simple frame, content interaction. No actions, viewer/Paint presets, uploader, schema-version increment, SQL, or production configuration change.

## Tasks

- [x] Add `ImageContentSchema`/`ImageContent`, an explicit `image` window variant in `site.ts`/`site-versioning.ts`, and `makeWindow("image")`. Preserve existing migration/projection/merge paths. Add focused `image-window.test.ts` coverage for strict parsing, frozen old discriminant rejection, round trips, cloning, public projection, alt warnings, and export/import.
- [x] Add API `imageCompatibility.ts`: `IMAGE_WINDOW_WRITE_CONTRACT = 1`, raw `requiresImageWindowContract`, and incoming-or-stored `imageWriteBlocked`. Extend create/save transport schemas with `clientImageWindowContract`; add the raw guards before parsers without changing access or CAS. Advertise `writeCompatibility.imageWindow = 1`. Require this separate exact contract for both import endpoints before package parsing, alongside the unchanged appearance contract.
- [x] Extend client senders with `CLIENT_IMAGE_WINDOW_CONTRACT = 1`. Add scoped image advertisement/recovery helpers. Generalize the existing 426 recovery component and four-locale recovery copy; retain local data/download, pause behavior, and appearance semantics.
- [x] Register an image read-only adapter around existing W3a `ImagePresentation`; hide Add Image in both Add surfaces and hard-block `store.addWindow` plus image duplication. The older `MobileEditor` Add list uses the same filtered definitions. Do not modify image leaf, outer frame hosts, navigation leaves, or Inspector. The reviewed image leaf will export `ImageView` and `ImageInlineEditor` for later binding.
- [ ] Run focused shared/API/web tests, targeted typecheck/lint, and a mocked-API image preservation/426 browser flow. Publish one Draft PR with exact receipts. No full integration suite, merge, deployment, writer flag, migration, remote data write, or native/live release claim.

## Focused commands

```sh
pnpm --filter @retrodesk/shared exec vitest run test/image-window.test.ts
pnpm --filter @retrodesk/api exec vitest run test/image-compatibility.test.ts test/appearance-compatibility.test.ts test/transfer-routes.test.ts
pnpm --filter @retrodesk/web exec vitest run src/lib/imageCompatibility.test.ts src/lib/apiAppearanceCompatibility.test.ts src/features/editor/store.image.test.ts
pnpm typecheck
pnpm lint
pnpm exec playwright test tests/e2e/image-reader-compatibility.spec.ts --workers=1 --retries=0
```

## Rollout and rollback constraint

This is reader-first preparation, not an image UI release. Frozen old readers reject the new window discriminant. Once image documents exist, deployed readers and preservation guards must remain in place; disabling creation alone does not make an old-reader rollback safe. A rollback to old readers requires image-free documents first. Existing asset resolution, private publish copies, export rights notices, and missing-media confirmation remain authoritative. Frameless outer hosts and Inspector integration wait for navigation R1 and separate review.

## Deferred dependency

Navigation R1 is Draft PR #104 at `957f4eeae373a59ff862bb9a6f3c4d5c44713880`, not yet landed. The new image union exposes the existing Instagram fallthrough in `InspectorContent.tsx`. Per the assigned ownership boundary, that file and outer shells are untouched. After R1 lands, add the explicit read-only image Inspector branch and require a passing web typecheck before integration; current Draft work is not reader-release ready.
