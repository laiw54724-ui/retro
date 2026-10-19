# Mobile history and save status implementation plan

**Goal:** Make existing history and save feedback available to touch and keyboard users at 320/390/430px.

**Architecture:** Group the existing Undo, Redo, save status, and conditional Retry controls in one toolbar row. Keep desktop layout with display: contents; on mobile put the group below primary actions with wrapping text and 44px buttons. Reuse store history, autosave, and retry without new persistence. Composition uses the existing incomplete-input message; failures retain priority.

**Tech stack:** React, Zustand, CSS, Playwright, Vitest.

**Scope:** EditorPage.tsx saveText and toolbar hunks only; w98.css history group and mobile overrides only. No changes to dialogs, IG, store, API, flags, schema, or Image gates.

- [x] Inspect audit/HANDOFF and latest main; isolate branch at f11ad8d.
- [x] Run existing history/local-work unit tests (10 passing).
- [x] Add tests/e2e/mobile-history-status.spec.ts: touch delete→undo→redo; disabled history; delayed save with intervening edit; error/retry; incomplete/composition; keyboard Enter/Space/Tab; 320/390/430 viewport bounds and reduced height/safe area.
- [x] Capture baseline screenshots and confirm regression fails because Undo is hidden.
- [x] Wrap the existing controls in .editor-history-controls; remove only their mobile-hide classes. Preserve disabled predicates and handlers. Add scoped 44px/wrapping mobile CSS and atomic status announcements.
- [x] Run focused Playwright suite, store unit tests, typecheck/build and relevant existing mobile/save regression suites.
- [x] Inspect before/after screenshots and capture actual results/limitations.
- [ ] Review bounded diff, commit, push feature branch, open independent draft PR; no merge/deployment.

Alternatives considered: putting controls among primary actions crowds the narrow header; a fixed bottom bar would compete with keyboard and safe-area space. The in-flow row keeps recovery discoverable without either overlap.
