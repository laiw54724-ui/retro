# Desktop Taskbar and Flow Parity Design

## Goal

Make the editor canvas, visitor preview, and published desktop behave like the same Win98 desktop. The taskbar must be functional rather than decorative, and visitors must see the creator's selected icons and current local time.

## Decisions

- The clock shows the visitor device's local 24-hour time as `HH:mm` and updates when the minute changes.
- The Start button opens a Win98-style menu containing every desktop window, including closed windows.
- Choosing a Start menu item opens or restores that window, focuses it, and closes the menu.
- The menu closes when the user presses Escape, clicks outside it, or chooses an item.
- Taskbar buttons represent open and minimized windows. Closed windows disappear from the taskbar but remain available from Start and desktop icons.
- Desktop icons, Start menu items, and taskbar buttons use each window's configured icon in the editor, preview, and published site.
- Mobile behavior is unchanged; its existing launcher and window flow remain the mobile source of truth.

## Architecture

Create one shared desktop taskbar component used by the editor canvas and `VisitorDesktop`. It owns only transient menu state and the local clock. Window state remains owned by the existing editor store or visitor runtime map and is passed in through callbacks.

The shared component receives:

- the site document and resolved theme view;
- task entries with active/visible state;
- callbacks to open a window and toggle a taskbar item.

The published desktop will also render the configured `Icon` component using the same tile and label styling as the editor. Visitor preview already renders `VisitorDesktop`, so fixing that surface automatically keeps preview and publication aligned.

## Interaction and Accessibility

- Start exposes `aria-expanded` and `aria-controls`.
- The menu is labelled and its choices are real buttons.
- The live clock uses a semantic `time` element with an accessible label.
- Existing focus-visible styling is preserved; Escape works without moving focus unexpectedly.
- Empty desktops show an explanatory empty Start menu instead of a blank panel.

## Verification

- Component/E2E coverage verifies the Start menu opens, opens a closed window, and closes afterward.
- E2E coverage verifies the clock is a time rather than the site name.
- E2E coverage verifies configured desktop icons appear on the published desktop.
- Existing minimize, restore, close, maximize, wallpaper, responsive, typecheck, lint, unit, build, and full E2E suites must continue to pass.
- A live staging pass checks editor preview and the published public route at desktop size.

## Out of Scope

- Configurable owner timezone or seconds display.
- New Start menu system commands such as shutdown, settings, or search.
- Changing mobile navigation or persisted document schema.
