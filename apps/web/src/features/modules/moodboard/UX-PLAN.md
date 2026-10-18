# Moodboard #44 scoped UX plan and evidence

Base: `386c209dd8cb47bae96a749a7751cc7189032183`, integration/retro-preview-r1-r3; run 39145698313 success. Excludes #77 M1, shared mobile shell, preview, OC, API, schema and centralized translations. No AGENTS.md found in repository or ancestor directories. Existing #40 click/Enter/Space selection is already present.

Design: retain the existing canvas and inspector; add a front-to-back, independently scrollable object list so fully covered and locked objects remain selectable. Reuse the existing Moodboard content label rather than introduce untranslated layer terminology. Add X/Y and localized W/H numeric fields using existing model coordinates in pixels. Commit finite numbers on blur/Enter; Escape and blank input restore the stored value. Clamp position and size to the canvas. Keep locked objects selectable and disable movement/size controls, retaining existing content and layer editing semantics. Use a module container query to stack controls for narrow windows as well as phones. Remove the mobile minimum canvas height so editor and visitor retain the stored aspect ratio. Enable vertical scrolling from canvas background while retaining object dragging.

Alternatives considered: a new canvas/zoom engine would exceed scope and risk drag/public parity; numeric-only editing would leave obscured objects inaccessible. The combined small list and inspector extension uses existing update/history/save paths and introduces no schema.

Implementation (inline, no additional implementers):
- [x] Read #44/#40/#55, fetch and verify fixed base/CI, inspect worktrees/open PRs; preserve other work.
- [x] Capture ordinary-click before screenshots at 1440/320/390; confirm missing list and numeric controls.
- [x] Add pure bounded geometry and stable layer reorder helpers with focused unit coverage (ties, gaps, no-op boundaries, finite values, lock).
- [x] Add numeric draft fields, selectable list, alignment controls from existing schema and module-only responsive CSS. Keep existing selection/drag paths.
- [x] Run focused units and web typecheck; run a single-worker desktop/320/390 behavioral batch for overlap selection, dimensions, locking, drag, ordering, undo/redo, saved reload and visitor projection. Reuse #40 keyboard regression.
- [x] Capture ordinary-click/tap after evidence; inspect screenshots. Record limits; commit, push and open Draft PR Refs #44/#40 to the fixed integration branch. Final full gate belongs to the integrator.

All displayed prose reuses existing four-language keys. X/Y are coordinate symbols; no new translation resources are required.

Result: 15 focused unit tests and web typecheck passed; 10 distinct focused browser cases passed. See `tests/e2e/evidence/moodboard-properties/README.md` for commands, screenshots, evidence boundaries and remaining integration/device validation. Review screenshots are isolated under that dedicated test-evidence directory.
