# OC content authoring implementation plan

## Goal

Make Instagram post media and highlights editable through the canonical v2
entities, with the same authoring flow on desktop and mobile and lossless
autosave/reload behaviour.

## Slice 20B1 — canonical post and media authoring

1. Add a typed Instagram content boundary to `ModuleCtx` and thread it through
   `EditorPage`, `DesktopCanvas`, `MobileScreen`, and `WindowRenderer`.
2. Add immutable post/media operations with unit coverage for create, patch,
   delete, and reordering.
3. Add a focused canonical content editor alongside the existing profile form.
   Support post order, media order, upload/URL input, alt text, caption,
   location, world date, and pinned state.
4. Ensure every operation updates the v2 document once, projects to the legacy
   renderer, and participates in undo/autosave.
5. Add editor round-trip and responsive acceptance coverage.

## Slice 20B2 — multi-frame highlights

1. Move highlight authoring to canonical highlight entities.
2. Support highlight/frame create, delete, ordering, cover selection, alt text,
   optional text, and crop metadata.
3. Preserve the circular highlight presentation and verify reload/public draft
   filtering.

## Verification and release

- Run web/shared typecheck and unit tests.
- Run the full Playwright suite, including 320/375/390/430 responsive checks.
- Build production assets.
- Deploy staging and smoke-test editor save/reload and visitor rendering.
- Record the deployed commit and evidence on Issue #20.
