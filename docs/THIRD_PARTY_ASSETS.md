# Third-party assets and licensing

Retro's MIT License covers only original Retro source and documentation the
granting rights holder controls. It does not relicense user content or
third-party assets. Each asset remains subject to the terms, rights, and
restrictions of its owner or upstream source. See [`LICENSE_SCOPE.md`](LICENSE_SCOPE.md)
and the root [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

The machine-readable inventory is
[`docs/assets/third-party-assets.manifest.json`](assets/third-party-assets.manifest.json).
Run `pnpm assets:audit` to verify every bundled media/font file and any locally
installed optional pack. This is an inventory/integrity check, not a license
grant. `pnpm assets:audit:release` additionally proves excluded icon-pack
directories are absent from the build.

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

The image binaries are not committed or included in the default build. The
generated catalog and provenance metadata remain so the optional installer can
verify the exact pinned source. An operator who has reviewed the rights status
may explicitly opt in:

```bash
pnpm icons:install -- --acknowledge-third-party-rights
```

The command fetches the pinned upstream revision directly and writes ignored
files under `/windows-icons/`. `pnpm icons:remove` restores the clean state.
The older `/win98-icons/` PNG collection had no reproducible source and was
removed without an installer. Existing documents keep their saved IDs and use
semantic built-in SVG fallbacks when either collection is absent.

The importer requires an exact checkout of the pinned commit and records the
upstream path, generated output path, SHA-256 hash, and byte count for every
supported file. `.ani` and `.icl` files are inventory-only and are not copied
to the web output. A local pack is accepted by the development audit but is
always rejected by the strict redistribution audit.

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
