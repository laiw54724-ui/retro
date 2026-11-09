# Public onboarding clarity

Baseline: public repository `0cc4a107ccfc37ed0dee275c6811c58ef8b37d1f`.

## Changes

- Add homepage anchors for the setup steps, examples, FAQ and project resources.
- Explain Google sign-in before the create action and on `/auth`, including the existing Supabase Auth and email data flow.
- Link the existing privacy/deletion document, public Issues, source repository and MIT source license. Mark every new-tab resource link and warn that Issues are public.
- Keep pricing and legal promises out of the new copy. Explain the current lack of self-service whole-site/account deletion.
- Put detailed language caveats behind a native disclosure while retaining the interface-only notice and existing translation availability.
- Make the hero's Start button open the card demo. Explain sample-only interactions and external links.
- Keep the Start menu compact and add Arrow Up/Down, Home/End and Escape focus behavior.
- Retain existing Fit geometry. Current baseline clipping was **not reproduced** in the tested local viewport sizes; no speculative geometry fix is included.

## Focused verification

`tests/e2e/public-onboarding.spec.ts` covers navigation, FAQ disclosure, new-tab destinations, pre-login copy, language persistence, the hero demo, all four sample desktops, Fit/100%, the complete taskbar, keyboard menu navigation, mobile switching, Escape, restored focus, browser Back and no sample API writes.

Run with a separate local server port:

```sh
PLAYWRIGHT_PORT=5517 pnpm test:e2e tests/e2e/public-onboarding.spec.ts tests/e2e/demo-fictional-notice.spec.ts tests/e2e/desktop-preview-viewport.spec.ts --workers=1
```

Initial result: 18/18 Chromium checks passed. Covered viewport widths include 320, 390, 430, 667, 767, 768 and 1280 pixels, including 667×375 landscape. The new tests use no live sign-in. Auth and Fit screenshots were visually reviewed.

All package TypeScript checks passed. Unit suites passed: shared 228, API 265, web 562, plus 3 image-rollout checks. Release assets and dependency-license audits passed. The production web build and API dry-run build passed. The full `pnpm verify:contributor` gate was started separately; its final result must be reported independently of these focused results.

## Boundaries

This is local validation, not deployment acceptance. Google OAuth was not started, and no third-party account, saving or publishing service was exercised. No release, merge or deployment is included. Japanese and Korean remain preview locales awaiting their existing native-language review.
