# Publish Freshness and Background Parity Design

## Problem

The editor renders uploaded wallpaper images as a centered, non-repeating cover image, while the public page applies only `background-image`. Browser defaults therefore tile the same image on the published desktop. The public-site API also permits CDN/browser stale responses for up to five minutes, so a successful republish can still display an older published document.

## Contract

- Editor preview, visitor preview, desktop public page, and mobile public page must derive wallpaper CSS from `themeView`.
- An uploaded wallpaper uses `cover`, `center`, and `no-repeat` on every surface.
- Pattern wallpapers keep their existing repeat behavior and token-defined size.
- A public-site request must revalidate immediately and must not return a stale published document after republishing.
- Publishing remains draft-version guarded; no database schema or document migration is required.

## Implementation

`PublicSitePage` will use `themeView(document.theme)` instead of maintaining a second background implementation. The public API route will return `Cache-Control: no-store`, and the frontend request will also use `cache: "no-store"` for defense in depth.

## Verification

- An E2E assertion verifies that a public image wallpaper computes to `cover`, centered, and non-repeating.
- An API unit assertion verifies that the public-site response disables caching.
- Existing publish, public visitor, responsive, unit, type, lint, and production-build checks continue to pass.

