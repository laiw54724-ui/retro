# Mobile, onboarding and publishing follow-up

## Candidate and scope

Application/test commit: `8c662bf64cb597666c027803a15b6ddda3ae2708`.

This candidate extends the public-onboarding integration at `1bdf48841891b867560ce122de1b746ea6ea2395`. Remote refs were refreshed after validation: `main` remained `0cc4a107ccfc37ed0dee275c6811c58ef8b37d1f`, and Draft PR #1 remained `4b2cac94bb0064e12e0d3fb95d3000831b6f6140`. Both are ancestors of this candidate. The PR #1 branch was not edited or overwritten.

The integration includes PR #1's example content, verified same-origin CC0/public-domain media and provenance, translations, public navigation and sign-in explanations. This follow-up adds:

- Specific URL validation reasons, distinct neutral/error/success states, a non-color error icon, accessible field errors and persistent format rules.
- One public URL format across onboarding, editor and publish dialogs: the current environment's origin plus `/@handle`. No unverified production domain is promised.
- A return link from every onboarding step to My desktops, and English singular/plural inventory counts.
- An explicit unpublished-address label, selectable publish-dialog URL and plain-language draft/republish explanation.
- Non-blocking overlap warnings for windows that really open on desktop, including auto-show character dialogs.
- Native sharing after successful publication only, silent share cancellation without clipboard side effects, and a manual-copy fallback when copying is denied.
- Visible primary-button keyboard focus, readable disabled button labels, homepage social metadata text, and title cleanup when leaving a public site through SPA navigation.

## Reproduced versus already implemented

Real browser viewport tests at 320, 375, 390 and 430 CSS pixels confirm that the candidate homepage uses one column and the editor hides both desktop sidebars in favor of the mobile authoring surface. Tests also cover 768, 1024 and 1440 pixel desktop/tablet layouts and horizontal containment. Grid-column assertions were strengthened rather than adding another speculative breakpoint. The toolbar can wrap to retain its controls and touch targets.

The candidate already had a landing h1, an operative Try demo button, a default meta description, published-page server OG/Twitter/canonical metadata, and a post-publication copy/open flow. Geometry can already be changed with keyboard-accessible X/Y/width/height fields. These were not reported as missing features.

This is browser viewport validation, not a physical-phone test or native browser-zoom certification.

## Final verification

`PLAYWRIGHT_PORT=5531 pnpm verify:contributor` exited 0 against the exact application/test commit above:

- Secret/history and build-artifact audits passed.
- Release asset audit: 352 confirmed files. Dependency-license audit: 153 packages.
- TypeScript checks passed.
- Unit suites: shared 238, API 265, web 574, plus 3 image-rollout checks.
- Web production build and API dry-run build passed.
- Chromium E2E: **949 passed, 20 skipped, 0 failed**, in 10.7 minutes.

The existing 20 skips are 9 opt-in appearance-writer cases, 2 preview-locale cases and 9 Linux-only screenshots. They are not implied to pass in this Mac/default-build run. The two Japanese/Korean preview-locale tests were separately run with `VITE_I18N_PREVIEW_LOCALES=true`; both passed. Production locale availability was not changed.

The new cases exercise invalid/available/taken/network-error URL states, late responses, retry, return navigation, 0/1/2 desktop counts, real viewport columns, overlapping windows, unpublished-link restrictions, native-share success/cancellation/rejection/absence, clipboard rejection, visible focus, and SPA metadata navigation. Existing preview-source privacy and save-session suites also passed. The 320-pixel onboarding and desktop editor screenshots were visually reviewed.

Earlier validation attempts exposed obsolete assertions for pre-icon status text and the previously unlabeled URL. Those expectations were updated to require the new wording while retaining their stale-response, same-origin and unpublished-sharing guards. The incomplete and failed attempts were not treated as successful full runs; the final complete gate above supersedes them.

Only this verification record changed after the tested application/test commit. No runtime source, tests, dependencies or assets changed after the successful gate.

## Boundaries and remaining work

All authenticated editor, save and publish interactions used synthetic local fixtures and intercepted APIs. No real account draft was read, changed, deleted or published. No merge or deployment is included.

QR generation, direct arrow-key titlebar/resize-handle operation, a broader toolbar redesign, new desktop/account management actions, and image timeout improvements are not part of this batch. Existing geometry fields remain the keyboard alternative. The default published social image is still SVG; crawler-specific image-card rendering has not been certified.

The existing non-failing extra closing brace warning in `styles/w98.css` and large-bundle warnings remain outside this change. See the preceding public-onboarding verification record for the baseline warning evidence.
