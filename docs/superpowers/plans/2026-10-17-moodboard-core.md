# #23A Paint-style moodboard core

**Goal:** Add a finite, serializable and accessible Moodboard window without adopting an unneeded canvas framework or exposing an unreliable export action.

**Architecture:** Store board dimensions/background and at most 100 typed elements directly in the versioned window contract. Render elements as DOM layers using percentage geometry, so the same content is responsive, keyboard-readable and safe for Chinese text input. Pointer drag writes through the existing keyed history channel, making one gesture one undo group. Mobile and keyboard users receive explicit position, size and layer buttons.

**In scope:** text, color blocks, uploaded images, select, drag, numeric geometry, front/back, lock, duplicate, delete, save/reload/undo, visitor rendering and semantic description list.

**Deferred to #23B:** PNG export, font-ready export gate, cross-origin diagnostics, crop handles and template library. No disabled or misleading export control is shown in #23A.

**Focused verification:** schema limits and invalid data; registry factory; author create/edit/drag/undo/save/reload; visitor rendering at desktop/mobile; outer window drag remains titlebar-only.
