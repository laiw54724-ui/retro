# Guestbook Preview Implementation Plan

**Goal:** Isolate the #42 guestbook preview subset, retaining real public submissions and owner moderation (#45 boundary only).

**Architecture:** The two preview hosts explicitly provide a guestbook simulation context. Both guestbook entry points select a standalone local simulation before live components mount, even if an editing/site-owner context is accidentally passed. No URL inference, live reads, pending submission data, draft mutation, or renderer interface changes.

**Tech Stack:** React context/state, existing guestbook layout classes, i18next, Playwright.

- [x] Add a dedicated guestbook preview regression: mock public and owner endpoints, count every request, and assert owner preview never reaches either. Run against a538211 to record the failure.
- [x] Add `features/modules/guestbook/previewContext.tsx` and `PreviewGuestbook.tsx`; select simulation in both exports of `guestbook/index.tsx`. Simulation renders one translated fictional approved message, local form fields, simulated pending/report status, and the disabled state. Submitted text never enters the approved list.
- [x] Wrap preview bodies in `VisitorPreview.tsx` and `DraftViewer.tsx` with the explicit context. Leave WindowRenderer, MobileScreen, VisitorDesktop, ModuleCtx and editing/data APIs unchanged.
- [x] Add only `guestbook.preview` keys to the four `modules.json` resources; preserve surrounding keys/formatting.
- [x] Cover owner publishable/draft and collaborator, desktop/phone, sample context with an isolated host fixture, no autosave/history change, nested Escape, Back and session reset. Retain public submit/report and owner moderation regression coverage.
- [x] Run focused E2E, scoped unit tests and workspace lint/typecheck. Record exact results, modified paths and native/live limits; commit/push own branch and create Draft PR against integration/retro-night-quality-01. Final combined gate belongs to integrator.

The user delegation supplies the approved design and scope. Context and plan reviewed against those boundaries; no schema/navigation picker or broader #45 work.
