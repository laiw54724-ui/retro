# Paint operation UI (Issue #53, partial W5b)

`PaintWorkspace` is an isolated React host for the merged W5a `PaintEngine` and `PaintPointerController`. It supplies real tool, size, color, shape fill, zoom, history, clear, New, and local PNG controls. The host owns one engine for its mounted lifetime. Pointer moves remain entirely in Canvas 2D; React reads state only after a gesture, picker result, or command. The debug fixture exposes its engine only for pixel tests.

Keyboard users can focus the canvas, move a visible logical-pixel cursor with arrows (Shift moves ten), press Space or Enter to start and finish a stroke or shape, and press Escape to cancel. Holding Space or Enter cannot repeat the start/finish action; repeated arrows still move and draw. An active captured pointer stroke cannot be moved, finished, or canceled by keyboard drawing keys, and a pointer press cancels an unfinished keyboard stroke before taking over. Home and End jump to canvas corners. Ctrl/Command+Z and Shift+Z or Ctrl+Y handle history; Ctrl/Command+E downloads a PNG. Shortcuts do not intercept input, select, textarea, or editable content. The drawing area prevents touch scrolling while surrounding controls and the scrollable viewport remain usable.

New canvas offers 320×240, 640×480, and 1024×768. W5a still enforces a maximum of 1024×768, eight RGBA history snapshots, 0.5–4 display zoom, and effective DPR at most 2. Its calculated directly managed maximum is 44,040,192 bytes (42 MiB), including bitmap, display backing store, eight history snapshots, and an active gesture; browser overhead and PNG encoding are additional. The UI neither changes these limits nor claims hardware Pencil performance. PNG encoding uses logical dimensions and preserves alpha. Clear is undoable; New discards history after confirmation of unsaved work.

Local image import accepts selected PNG, JPEG, and WebP files of 1 byte–8 MiB. Decoded sources must be at most 2048 × 2048 and 4,194,304 pixels. The image is centered and scaled to fit the current canvas, preserving transparency and existing pixels outside the image. It commits as one undoable overlay; the source file is never changed. A newer selection, Cancel, edit command, pointer stroke, or keyboard stroke invalidates pending work. `createImageBitmap` cannot be interrupted mid-decode, so late results are discarded and closed. Invalid type, encoded size, decoded dimensions, decode failure, and inaccessible source pixels have distinct notices. `PaintEngine.importImage` checks a staging canvas for taint before changing working pixels.

The 8 MiB file cap is checked before decode, but decoded dimensions can only be checked after browser decode. This does not bound transient decoder memory. A 2048² source has 16 MiB of RGBA pixels; browser implementation may use additional copies. At the maximum Paint canvas, staging uses a 3 MiB canvas and a transient 3 MiB readback on top of the W5a 42 MiB directly managed canvas/history budget. PNG export still uses the 1024 × 768 logical canvas maximum and retains alpha.

This is not a registered Paint module. It does not edit site documents, upload assets, save to a site, publish visitor work, or add a product entry. The English labels in `operationLabels.ts` are proposed Paint-only copy; integration into shared locale catalogs requires coordination. The outer WindowChrome, author/visitor modes, #51 image handoff, and asset flow remain later work.

Focused checks:

```sh
corepack pnpm --filter @retrodesk/web typecheck
corepack pnpm --filter @retrodesk/web exec vitest run src/features/paint/keyboardCursor.test.ts
corepack pnpm exec playwright test --config playwright.paint-operation.config.ts
```
