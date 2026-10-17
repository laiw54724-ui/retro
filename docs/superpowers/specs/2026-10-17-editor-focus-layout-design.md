# Editor focus and left-panel layout design

## Goal

Keep the desktop editor usable when the module catalog is long or text is enlarged, and make the currently selected desktop window visually dominant without changing the Win98 visual language.

## Scope

This change affects only the desktop authoring editor. It does not alter mobile editing, visitor preview, saved documents, window ordering, or published sites.

## Left module list

- Keep the `新增／視窗／主題` tab row fixed inside the left sidebar.
- Make the tab panel the only vertically scrolling region and preserve the sidebar's existing collapse control.
- Give every module card content-driven height, stable internal spacing, and wrapping text that cannot overlap adjacent cards at supported widths, browser zoom, or longer localized copy.
- Keep `即將推出` inside the same scrolling region so every catalog item remains reachable by pointer, wheel, keyboard, and touchpad.
- Use the existing Win98 scrollbar and card styling; do not introduce a new visual component.

## Selected-window focus treatment

- When a visible window is selected in normal edit mode, render one non-interactive black scrim over the desktop background, icons, and non-selected windows.
- Use black at 28% opacity: enough to reduce wallpaper noise while retaining spatial context.
- Render the selected window, its selection outline, resize handle, and selection label above the scrim without mutating the document's persisted z-order.
- Keep the taskbar, edit-mode label, sidebars, and top toolbar above or outside the scrim.
- Set the scrim to `pointer-events: none`, so users can click a dimmed window to select it, click the desktop to clear selection, and continue dragging or resizing the selected window.
- Do not show the scrim in layout mode, when the selected window is minimized or closed, when nothing is selected, in mobile editing, or in visitor preview.
- Respect forced-colors by disabling the translucent scrim rather than hiding content behind an uncontrolled system color.

## Component boundary

`LeftPanel` keeps its current markup; the scrolling and card corrections belong in editor CSS. `DesktopCanvas` owns a dedicated, decorative scrim element because it already knows selection, view state, layout mode, and window layering. A small helper determines whether the scrim should render, keeping the JSX condition explicit and testable.

## Accessibility and interaction

The scrim is `aria-hidden` and cannot receive focus. DOM order and keyboard navigation do not change. Selected and background windows remain operable because the scrim does not intercept input. The left catalog remains one normal tab panel with native overflow scrolling.

## Verification

- Add a focused E2E case proving the left catalog scrolls, module-card rectangles do not overlap, and the last catalog entry becomes reachable.
- Add a focused E2E case proving the scrim appears only for a visible selection in normal edit mode, stays below the selected window and above an unselected window, and does not prevent switching or clearing selection.
- Re-run the existing sidebar-collapse, window drag/resize, layout-mode, responsive desktop-shell, and mobile editor coverage.
- Perform one bounded desktop visual inspection and one confirmation pass after any batched correction.
