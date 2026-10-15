# Responsive Audit and IG Scrolling Design

## Goal

Make every Retro Desktop route usable across phone, tablet, and desktop sizes while preserving the Windows 98 visual language. Fix the desktop Instagram window so its application content—not the desktop or window frame—is the single scrolling region.

## Responsive contract

- **Phone, 320–767 px:** Landing, authentication, and onboarding become single-column. The editor hides both desktop side panels and its desktop-only history/device controls, then gives the shared `MobileScreen` the remaining viewport. Visitor pages render only the mobile surface.
- **Tablet, 768–1023 px:** Marketing and onboarding use fluid widths. The editor keeps the desktop canvas but collapses secondary panels so the canvas remains usable. Controls retain 44 px touch targets for coarse pointers.
- **Desktop, 1024 px and above:** Preserve the complete editor with both panels, draggable windows, and compact pointer-oriented controls.
- Apply safe-area insets to fixed mobile chrome and prevent horizontal document overflow without clipping legitimate module content.

## Instagram window scrolling

The desktop remains fixed. The RetroWindow title bar and Instagram top/bottom navigation remain fixed inside the window. `.ig-scroll` is the only vertical scroll owner and must have a resolved flex height through every ancestor (`RetroWindow` body → module frame → IG app). The outer RetroWindow body must not create a competing scrollbar for the Instagram module.

Mouse wheel, trackpad, scrollbar drag, touch pan, Page Down, and arrow-key scrolling must work when the IG content has focus. Switching IG screens resets the internal scroll position to the top. Window resizing recomputes the available content height through flexbox rather than JavaScript measurements.

## Route coverage

- Landing and interactive demos
- Google authentication
- Three-step onboarding, including themes and five templates
- Editor desktop/tablet/phone shells
- Visitor preview and public visitor page
- Document, gallery, links, about, and Instagram modules
- Conflict, publish, success, asset, lightbox, story, and bottom-sheet overlays
- Loading, error, and empty states

## Verification matrix

Automated screenshots and overflow assertions run at 320, 375, 390, 430, 768, 1024, and 1440 px. Portrait phones and a tablet landscape viewport are included. E2E tests explicitly verify editor panel visibility, fixed/mobile chrome, IG wheel and keyboard scrolling, and no horizontal overflow. Existing unit, typecheck, build, accessibility, editor, and module journeys remain green.

Visual QA uses one broad inspection pass across phone/tablet/desktop, one batched correction, and a final confirmation pass. After success, deploy only to staging for user review.

## Non-goals

- No replacement of the retro visual identity.
- No production deployment.
- No mobile drag-and-drop window manager; phone editing continues to use the bottom toolbar and sheets.
- No unrelated content or backend changes.
