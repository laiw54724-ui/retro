# Editor collapsible sidebars design

## Goal

Give desktop authors more canvas space without removing the existing add, layer, theme, and inspector workflows. The left tool panel and right property panel can be collapsed independently and restored without reloading the editor.

## Chosen interaction

Use narrow boundary controls between each sidebar and the desktop canvas.

- An expanded panel has a labelled collapse button at its canvas-facing edge.
- A collapsed panel becomes a narrow rail with a labelled expand button; the rail remains visible so recovery is obvious.
- The canvas grows immediately into the released width.
- Left and right states are independent and persist in local storage for this browser.
- Controls expose `aria-expanded`, an accessible name, a visible focus state, and work with keyboard activation.

This is preferred over adding more top-bar buttons because the current top bar is already dense, and over hiding the panels completely because a hidden recovery action is difficult to discover.

## Responsive behavior

- At widths of 1024px and above, both panels support independent collapse.
- From 768px through 1023px, the existing responsive rule keeps the right inspector hidden; the left panel remains collapsible.
- Below 768px, the existing mobile editor flow remains authoritative and desktop sidebar controls are not rendered.

## State and boundaries

The state belongs to `EditorPage`, which owns the editor shell. `LeftPanel` and `RightPanel` remain content components and do not need to understand shell layout. A small reusable boundary control handles the visible label, direction, and accessibility attributes. Sidebar preference is UI-only and must never enter the site document, undo history, autosave, or published payload.

If local storage is unavailable or contains invalid data, both available desktop panels default to expanded.

## Verification

- Component/browser acceptance covers independent left and right collapse, canvas growth, restore, keyboard activation, and persistence after reload.
- Responsive acceptance confirms the medium-width right-panel rule and mobile editor are unchanged.
- The full web unit, typecheck, build, and Playwright suite run before deployment.
