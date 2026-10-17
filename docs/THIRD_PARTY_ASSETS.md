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

## Open icon library (bundled, user-selectable)

The icon picker ships a curated library of three open sets so users can pick icons
without installing anything. Each set lives under `apps/web/public/icon-library/<set>/`
with a `NOTICE.txt` (pinned source, license, author, upstream license text) and is
registered as its own collection in the asset manifest.

| Set id | Picker category | Source (pinned commit) | License | Format |
| --- | --- | --- | --- | --- |
| `haiku` | 彩色復古 | https://github.com/haiku/haiku `data/artwork/icons` @ `ac9aaea72eb11a8c425dbdd2d1f47fc9761c70c9` | MIT; Haiku, Inc. asks only that the origin is mentioned ([terms](https://www.haiku-inc.org/trademarks/haiku_icons/)) | SVG, converted at build time by [hvif-tools](https://github.com/threedeyes/hvif-tools) `icon2icon` @ `3789a261230fd6faad0dfda3b7b2743a2d878125` |
| `pixelart` | 彩色像素 | https://github.com/tstamborski/pixelart-icons `png/` @ `aff260c021f9a8053719de0113cd59e428c87eca` | CC0 1.0 (Tomasz Stamborski) | original 32px PNG |
| `pixelarticons` | 單色像素 | https://github.com/halfmage/pixelarticons `svg/` (free series) @ `c9ecc2da61afde85dbe539025e3d931c6152ad75` | MIT (Gerrit Halfmann) | sanitized SVG |

* The hand-written allowlist, zh/en names, keywords, purposes **and the explicit exclusion
  list with reasons** are in [`docs/assets/open-icon-library.curation.json`](assets/open-icon-library.curation.json).
  Per-file source path and SHA-256 (source and output) are in
  [`docs/assets/open-icon-library.provenance.json`](assets/open-icon-library.provenance.json).
* Excluded on purpose: Haiku logo/Leaf and other Haiku, Inc. trademarks, third-party
  application logos and Microsoft Office marks found in the Haiku directory; brand and
  operating-system logos, fictional characters, weapons and tobacco/drug references in
  pixelart-icons; brand-logo icons and the Pro/Mini/Prime series of Pixelarticons.
  Community and brand marks are never assumed to share a set's license.
* Regenerate with `node scripts/import-open-icons.mjs --haiku <clone> --pixelart <clone>
  --pixelarticons <clone> --icon2icon <binary>`. The importer refuses a clone that is not at the pinned
  commit or is modified, fails when an allowlisted icon is missing, and **rejects** (instead of
  silently stripping) any SVG with scripts, event handlers, `<style>`, `<image>`, `<use>`,
  `foreignObject`, external references, or non-local `url()`. Haiku `style` attributes are
  re-emitted as an allowlisted set of presentation attributes.
* `pnpm assets:audit` verifies the tree hash, the per-file hashes against the provenance file,
  and that `NOTICE.txt` records the pinned revision and license.
* Icon ids are stable and package-prefixed (`haiku:folder`). They are stored as plain strings in
  documents, so save/reload, public pages, and JSON export/import carry them unchanged and no
  upstream URL is stored or requested. A renamed icon is mapped through `ICON_ID_ALIASES`
  (`apps/web/src/lib/iconLibrary/library.ts`); an id that no longer exists renders a semantic
  built-in icon. User uploads are separate assets and are never replaced.
* The picker loads the catalog (names/keywords) and thumbnails lazily, only when it opens.

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
