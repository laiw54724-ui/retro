# Appearance P2 implementation plan

Goal: deliver bounded optional colors with reader-first compatibility.
Architecture: optional shared fields; pure scoped window/content/label resolvers; reader branch plus default-off writer branch. React/Zustand/Zod/Vitest/Playwright.

- [x] Reader: site.ts optional strict color contract inherited by site-versioning strict schemas; validate and roundtrip in shared/test/window-appearance.test.ts.
- [x] Reader: windowAppearance.ts handles partial inheritance, title, frame, content scope and label style; unit tests cover missing/overrides/two windows and contrast sampling.
- [x] Reader: WindowChrome, WindowRenderer, DesktopCanvas, VisitorDesktop, MobileScreen consume scoped resolver values. Content scope limited to document/gallery/links.
- [x] Reader: focused unit/type gate, commit and Draft PR stacked on #89.
- [x] Writer: default-off build gate, shared optional color controls with reset and preview; window draft/apply/cancel; preserve unrelated fields on title reset.
- [x] Writer: ThemeAppearanceEditor reuses controls inside existing theme transaction; four scoped locale namespaces.
- [x] Writer: focused store/persistence/browser coverage including mobile 320/390/430 and two-window isolation, lint/types; commit and Draft PR depending on exact reader head.
- [x] Record commands/results, rollout blockers and exact dependency in delivery evidence. Integrator owns final aggregate gate.
