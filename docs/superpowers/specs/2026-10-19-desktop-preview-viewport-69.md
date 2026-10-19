# Issue 69: shared desktop preview viewport

Exact base: main 79e19c0f692334ef81fbe876c9b9fc7e78462c7f, including #98 through #100. Existing R2/R3 already provide source/privacy adapters, honest labels, real URLs, unframed phone rendering and Back/Escape/focus behavior. This slice adds the remaining explicit desktop viewport on phones.

Use one shared DesktopPreviewViewport for sample/owner VisitorPreview and collaborator DraftViewer. Phone widths default mobile, larger widths default desktop; an explicit device choice remains selected across rotation. Both device choices remain available. Never mount hidden parallel renderers. Existing navigation/guestbook preview providers and media unmount shutdown remain intact.

The logical desktop is stable per source, at least 1024×768 and large enough for authored window/icon extents. Fit shows that desktop without enlarging above 100%; 100% and manual zoom are bounded 25–200%. Unscaled controls expose Fit/100%/−/+/Pan and current scale. Native scrolling, explicit pointer pan and keyboard arrows move within the bounded viewport. Scale changes preserve its logical center; source/device sessions retain zoom/pan in memory only and close/reopen resets them. No browser-history state is added beyond the existing preview marker.

Scoped CSS overrides public responsive desktop hiding only inside the preview canvas. VisitorDesktop receives an optional interactionScale (public default 1) and records it per move/resize gesture, dividing pointer deltas by that scale. No other public renderer behavior changes.

Only VisitorPreview, DraftViewer, required VisitorDesktop scale conversion, new geometry/component/scoped CSS, tests and editor:desktopPreviewViewport locale keys are owned. No API/schema/EditorPage/appearance/CSP/permission or persisted document/layout/history changes.

Focused unit geometry plus browser checks cover 320/390/430, 767/768 and landscape; real clicks/taps, pan/zoom, scale-correct drag/resize, device/reopen/Back/Escape/focus, single renderer/media shutdown, guestbook simulation, privacy projection and no autosave/history. Browser work uses isolated port 5201/output test-results/preview-viewport-69 and is coordinated with the image worker. Native phone/browser/pinch testing remains pending; no merge/deploy.
