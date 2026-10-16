# #23A Paint-style moodboard core

**Goal:** Add a finite, serializable and accessible Moodboard window with a verified PNG export path, without adopting an unneeded canvas framework.

**Architecture:** Store board dimensions/background and at most 100 typed elements directly in the versioned window contract. Render elements as DOM layers using percentage geometry, so the same content is responsive, keyboard-readable and safe for Chinese text input. Pointer drag writes through the existing keyed history channel, making one gesture one undo group. Mobile and keyboard users receive explicit position, size and layer buttons.

**In scope:** text, color blocks, uploaded images, select, drag, numeric geometry, front/back, lock, duplicate, delete, save/reload/undo, visitor rendering, semantic description list and exact-size PNG export.

**Export boundary:** Wait for `document.fonts.ready`, draw the bounded scene to a native canvas and test each loaded image in isolation before export. A cross-origin or unavailable image blocks the download and is reported by its authored alt text; the UI never reports an empty or tainted file as success. Crop handles and a template library remain optional later enhancements.

**Focused verification:** schema limits and invalid data; registry factory; author create/edit/drag/undo/save/reload; visitor rendering at desktop/mobile; outer window drag remains titlebar-only; 800×600 PNG download; per-image cross-origin diagnostic.
