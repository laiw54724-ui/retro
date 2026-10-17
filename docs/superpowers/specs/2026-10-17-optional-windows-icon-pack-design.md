# Optional Windows icon pack design

## Decision

The repository owner approved the MIT License for Retro's original source on
2026-10-17. The Windows 95–XP icon collections are not covered by that license
and must not ship in the source repository, default build, CI artifacts, or
open-source release.

## Source and installed states

The clean repository contains the searchable metadata generated from
`trapd00r/win95-winxp_icons` at commit
`728a866ad59a54fd4082dbe000e1e62e50bd90e9`, but no icon image binaries.
Operators may explicitly run the opt-in installer after acknowledging that the
upstream does not grant a redistribution license. The installer fetches the
pinned upstream revision directly and writes ignored files to
`apps/web/public/windows-icons/`. A matching removal command restores the clean
release state.

The unversioned legacy `/win98-icons/` PNG archive has no reproducible source
or redistribution evidence. It is removed without an installer. Existing
documents retain their stored paths; the renderer detects missing images and
uses a semantic built-in SVG fallback instead of a broken image.

## Product behavior

The editor checks for a validated pack marker before presenting Windows icon
search. With no pack, it keeps built-in and user-uploaded icons available and
shows an installation explanation. With a valid pack, the existing curated
and searchable catalog works unchanged. A selected optional icon that later
becomes unavailable falls back to an appropriate built-in icon based on its
name (for example camera, folder, music, user, or document).

## Release gates

The third-party asset manifest distinguishes bundled, confirmed assets from
excluded collections. Normal development audits allow an ignored local pack
and verify its inventory when present. The strict release audit requires both
excluded icon directories to be absent, so a clean clone can pass while a
build that would redistribute the optional pack fails.

CI runs the strict release audit before build. Documentation and the root MIT
license explicitly exclude third-party assets, user uploads, trademarks, and
reference material from the code-license grant.

## Verification

- Audit a clean checkout and prove the release gate passes.
- Install from the pinned upstream with explicit acknowledgement and verify
  count, hashes, marker, picker availability, and normal development audit.
- Prove the strict release gate rejects the installed pack.
- Remove the pack and prove the strict release gate and production build pass.
- Verify missing optional and legacy paths render built-in fallbacks.

