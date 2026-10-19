# Image authoring entry and host integration

**Base:** `fa79436a3b8d7d1433e30b5abe4147c0868c4864`.

**Goal:** Complete the existing single-image authoring flow locally while production writers stay disabled.

## Design and ownership

Batch A owns registry, image creation gate, editor store, EditorPage, Inspector/RightPanel, desktop/mobile hosts, the image leaf and its four locale blocks. No shared schema change is needed. Keep `src`, raw `srcUrl`, asset references, v1/v2 adapters, preservation transport and public privacy projection unchanged. No Paint, Scene, action or new chrome preset work.

Reuse the merged image editor in the desktop Inspector and phone inline editor. Keep the desktop canvas as a visual image with selection/move/resize affordances. A development-only `VITE_IMAGE_WINDOW_WRITER=true` opt-in and a site/API-scoped image preservation advertisement gate authoring controls. Production is off even when that variable is set. Appearance authoring keeps its independent gate.

Frameless desktop hosts omit chrome, face background and padding. A selected image remains operable using a keyboard-accessible selection/move handle and existing layout mode. Visitor decorative hosts are inert and pointer-transparent at the outer window boundary. Mobile keeps Back/edit navigation outside the frameless content; decorative content is inert without disabling the host Back control.

## Implementation plan

- [x] Connect scoped local writer gate to Add, Inspector, phone and existing store guards.
- [x] Add none/simple author control without changing schema/defaults or rewriting image sources.
- [x] Integrate transparent hosts and desktop selection/move behavior; preserve phone navigation.
- [x] Add focused gate/store/host and browser coverage: add, upload/URL, stale upload protection, editing, undo/redo, save/reload, preview/public pointer-through, phone and default-off compatibility.
- [x] Run focused lint/types/tests once the slice is assembled; diagnose only observed failures. No full integration gate, merge or deployment.
- [x] Open one Draft PR with exact evidence and remaining rollout gates.

## Acceptance and release boundary

Local fixtures/mock API prove wiring, not live Supabase/storage or native phone acceptance. Writer rollout additionally needs reviewed current reader/API preservation deployment, stale-client and asset privacy acceptance, cross-browser/mobile acceptance and explicit release-owner enablement. This slice does not close all of #51: Viewer/Paint chrome, action interactions and animation lifecycle controls remain future work.
