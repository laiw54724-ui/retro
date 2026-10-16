# Third-party assets and licensing

Retro's source code license covers the Retro source code only. It does not
relicense user content or third-party assets. Each asset remains subject to
the terms, rights, and restrictions of its owner or upstream source.

The machine-readable inventory is
[`docs/assets/third-party-assets.manifest.json`](assets/third-party-assets.manifest.json).
Run `pnpm assets:audit` to verify that every bundled media/font file is covered
and unchanged. This is an inventory/integrity check, not a license grant.
`pnpm assets:audit:release` is the stricter redistribution gate and remains
blocked while any collection is marked `needs-evidence` or `replace`.

## Windows 95–XP icons

The primary upstream source is
[`trapd00r/win95-winxp_icons`](https://github.com/trapd00r/win95-winxp_icons),
checked out at the pinned commit
`728a866ad59a54fd4082dbe000e1e62e50bd90e9`. A historical lookup reference is
[WinClassic resources](https://winclassic.github.io/resources).

- Primary source: https://github.com/trapd00r/win95-winxp_icons
- Pinned source commit: 728a866ad59a54fd4082dbe000e1e62e50bd90e9
- License status: NOASSERTION; the upstream repository does not declare a software or asset license.

The local evidence inventory is
[`docs/assets/windows-icons.provenance.json`](assets/windows-icons.provenance.json).
The upstream repository does not declare a software or asset license; its
license status is therefore recorded as `NOASSERTION`. Windows/application
icon rights remain with their respective owners and are not included in the
Retro code license. Review applicable upstream and owner terms before any
redistribution.

The generated `/windows-icons/` collection is currently `needs-evidence`:
source and hashes are confirmed, redistribution permission is not. The older
`/win98-icons/` PNG collection is `replace` and remains read-only only so
existing saved desktops do not break. New picker choices use the pinned
`/windows-icons/` manifest instead.

The importer requires an exact checkout of the pinned commit and records the
upstream path, generated output path, SHA-256 hash, and byte count for every
supported file. `.ani` and `.icl` files are inventory-only and are not copied
to the web output.

## Cubic 11 font

The Cubic 11 font comes from
[`ACh-K/Cubic-11`](https://github.com/ACh-K/Cubic-11). The local license text
is [`apps/web/public/fonts/OFL.txt`](../apps/web/public/fonts/OFL.txt), under
the SIL Open Font License 1.1. The reserved names are **Cubic** and **俐方體**;
do not use those names for modified font versions unless the license permits
it.

## User uploads

Uploaders must own or have the necessary rights and permissions for content
they upload. Deployment operators should define and enforce an upload policy
appropriate to the applicable context. Retro's source-code license does not
relicense, waive, or grant rights to user uploads.
