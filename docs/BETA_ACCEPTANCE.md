# Beta hardening and acceptance

This document separates repository-level checks that can run without production credentials from staging-only acceptance.

## Security changes in this pass

- User-authenticated writes still verify the Supabase bearer token server-side.
- Site reads, draft writes, publishing, and asset uploads remain scoped by `owner_id`.
- Unit regression tests assert that guessed site IDs cannot read another user's site or upload media into it.
- User links are structured data and reject `javascript:` and other unsupported URL schemes.
- Media uploads allow only JPEG, PNG, WebP, and GIF, are capped at 8 MB, and now verify file signatures instead of trusting the browser-supplied MIME type.
- SVG is intentionally not accepted as an upload format.
- Pages responses add CSP, COOP, referrer policy, permissions policy, clickjacking protection, and nosniff.
- Arbitrary user HTML/JavaScript is still not supported.

## Accessibility baseline

Repository-level smoke checks cover:

- keyboard-visible focus rings
- reduced-motion preference
- accessible labels for window controls
- mobile controls that remain visible at 320 / 390 / 430 px
- axe critical-violation smoke test on the landing page

This is not a WCAG certification. Theme color customization can still create low-contrast combinations, so a future theme contrast checker would be useful.

## Performance baseline

- Gallery/document images use lazy loading and async decoding where appropriate.
- Public mobile mode renders one active window rather than a scaled desktop.
- R2 assets use immutable browser caching.
- Published site JSON has edge-cache headers.

Remaining performance work for a larger beta:

- generate thumbnails/variants instead of serving original 8 MB files everywhere
- measure real-world LCP/INP after staging exists
- self-host/subset fonts if external font loading becomes material

## Automated test layers

### Every PR / main push

`CI` runs:

1. install
2. typecheck
3. unit security/schema tests
4. production build

Unit coverage includes:

- bearer token parsing
- upload signature validation
- unsafe URL rejection
- reserved username validation
- owner-scoped site/media regression checks

### Manual E2E

`E2E acceptance` is intentionally manual to avoid spending GitHub Actions browser minutes on every small commit.

It runs Chromium against a local Vite build with mocked public API data and checks:

- public visitor load
- minimize / restore / maximize / close / reopen
- 320 / 390 / 430 px mobile reachability
- horizontal overflow
- critical axe violations on the landing page

## Staging-only acceptance before inviting users

These require real Supabase + Cloudflare resources and therefore cannot be honestly marked complete from repository CI alone.

- [ ] email sign-up / verification / sign-in
- [ ] create username and starter desktop
- [ ] edit all five MVP window types
- [ ] upload JPEG/PNG/WebP/GIF to R2 and reload
- [ ] reject spoofed/non-image upload
- [ ] autosave, reload, and verify exact draft
- [ ] create a deliberate two-tab version conflict and recover without overwrite
- [ ] publish and visit `/@username` while signed out
- [ ] verify another authenticated account cannot read/write the first account's site ID
- [ ] verify another authenticated account cannot upload into the first account's site ID
- [ ] Safari/iOS acceptance at 320 / 390 / 430 px
- [ ] desktop Chrome/Safari acceptance
- [ ] check real public asset caching and CORS
- [ ] run Lighthouse/accessibility smoke on staging
- [ ] review Supabase Auth redirect allowlist
- [ ] review Cloudflare Worker/Pages environment variables and secrets
- [ ] configure abuse/contact channel before public beta

## Release rule

Do not call the product production-ready solely because CI is green.

A public beta can be considered ready after:

1. repository CI is green,
2. manual E2E is green,
3. staging acceptance above is completed with two separate test accounts,
4. no known high-severity auth/IDOR/upload issue remains.
