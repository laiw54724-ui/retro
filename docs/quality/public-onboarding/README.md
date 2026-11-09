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

The initial independent candidate passed lint, types, units and build. Its full E2E run was deliberately stopped when PR #1 became the integration baseline (209 passed, 9 skipped, 4 interrupted, 732 not run). It was not treated as a full pass. The final integrated result below supersedes that incomplete run.

## Boundaries

This is local validation, not deployment acceptance. Google OAuth was not started, and no third-party account, saving or publishing service was exercised. No release, merge or deployment is included. Japanese and Korean remain preview locales awaiting their existing native-language review.

## Final integrated verification — 2026-11-09

Application/test commit: `2e9f740450e8bb81a40e004cb24a9e7af35ed317`.
Integration baseline: PR #1 head `4b2cac94bb0064e12e0d3fb95d3000831b6f6140`.
The original independent onboarding commit remains `59122b36832c1f27032136d6365496d2f458dcc6`.

The isolated integration keeps PR #1's imagery and adds the verified translation, missing-image and same-origin hosting corrections. No changes were pushed to the original PR branch. The only initial conflict was the hero markup: real images were retained together with the working demo button. A subsequent browser regression found and fixed returning from `/auth` to `/#examples` without scrolling to the rendered anchor.

`PLAYWRIGHT_PORT=5524 pnpm verify:contributor` completed with exit code 0:

- Worktree/history and build-artifact secret scans passed.
- Release asset audit: 352 confirmed bundled files; dependency-license audit: 153 packages.
- TypeScript checks passed. Unit suites: shared 235, API 265, web 566, plus 3 image-rollout checks.
- Web production build and API dry-run build passed.
- Chromium E2E: **936 passed, 20 skipped, 0 failed** (17.1 minutes).
- The 20 existing skips are 9 opt-in appearance-writer cases, 2 preview-locale cases, and 9 Linux-only screenshot baselines. This Mac/default-build run does not claim those configurations passed.
- The 2 Japanese/Korean preview-locale cases were then run with `VITE_I18N_PREVIEW_LOCALES=true` and both passed. Production locale availability was not changed.

The full suite includes actual decoding of all 14 same-origin demo images, zero external image requests, four sample previews at 320/1280 pixels, and the public onboarding regression cases. Final desktop/mobile homepage screenshots were visually reviewed, and all 8 homepage thumbnail images decoded at both sizes. Sample interactions, Fit/100%, Start menu keyboard navigation, Escape, Back, focus return and local sign-in-error recovery passed. No real Google sign-in or private user draft was used.

One non-failing build warning remains from the original public baseline: an extra closing brace in `apps/web/src/styles/w98.css:709`. It was verified in `0cc4a107` and left outside this batch rather than conflated with a new regression.

Only this verification record was updated after the tested application commit. No application code, tests or assets changed after the successful gate. No push, merge or deployment was performed.
