# #22 Music Player v1 implementation plan

**Goal:** Add the first production music module with ordered authoring, explicit HTTPS playback, external-link handling and correct desktop/mobile lifecycle.

**Architecture:** Store playlist content in the versioned site document, but keep all runtime media state in a single injectable audio coordinator. Module views subscribe to the coordinator; desktop/mobile shells own close and leave-site cleanup.

**Tech stack:** TypeScript, Zod, React, native HTMLAudioElement, Vitest, Playwright.

---

### Task 1: Versioned music contract

**Files:** `packages/shared/src/site.ts`, `packages/shared/src/site-versioning.ts`, shared tests.

- Add strict track/source/playlist schemas with HTTPS and referential validation.
- Register the `music` window in v1/v2 document unions, factory and projection/migration paths.
- Test valid round-trip, invalid protocol, duplicate/missing playlist IDs and v1→v2 migration.

### Task 2: Deterministic audio coordinator

**Files:** `apps/web/src/features/modules/music/audioCoordinator.ts`, unit tests.

- Build lazy, injectable native-audio adapter.
- Enforce one active source, explicit play, error/loading/ended/time snapshots, optional seek and session volume.
- Test second-source pause, rejected play, close/stop and no persisted document mutation.

### Task 3: Music view and editor

**Files:** `apps/web/src/features/modules/music/*`, registry/types, styles.

- Register music and remove it from coming-soon.
- Build accessible Win98 player, empty/error/external states, controls, playlist and lyrics.
- Build direct track editor with add/reorder/delete/source/cover/character/rights/lyrics fields and explicit preview.
- Keep all source links inert during author editing except the labelled preview action.

### Task 4: Shell lifecycle and taskbar state

**Files:** `VisitorDesktop.tsx`, `DesktopCanvas.tsx`, `MobileScreen.tsx`, `DesktopTaskbar.tsx`.

- Preserve audio across minimize through coordinator ownership.
- Stop the owning source on close and all sources on visitor/editor-surface unmount.
- Show taskbar playback status and provide the same close behavior on mobile.

### Task 5: Acceptance and deploy

**Files:** `tests/e2e/music.spec.ts`, fixtures if required, verification notes.

- Verify ordered authoring/autosave/reload, external-link behavior, explicit play, one-source rule, minimize/close/leave lifecycle, failure state, keyboard controls and 320px layout.
- Run focused tests per task, then full unit/typecheck/build/E2E and milestone code review.
- Deploy Pages staging only; API/DB remain unchanged. Verify canonical and immutable builds and update/close #22 only when all v1 acceptance criteria except the explicitly separated upload milestone are satisfied.
