# Asset rights and source records

Retro Desktop's [MIT License](../LICENSE) applies to the original source it is authorized to license, **not** automatically to third-party media, optional icon packs, trademarks, user uploads or externally referenced work. This factual register preserves important historical asset-source decisions without implementation work orders. The current authoritative scope and inventory remain [Third-party assets](THIRD_PARTY_ASSETS.md), [Third-party notices](../THIRD_PARTY_NOTICES.md), [License scope](LICENSE_SCOPE.md) and the [machine-readable asset manifest](assets/third-party-assets.manifest.json).

## Windows 95–XP icon source and distribution boundary

| Item | Source and restriction |
| --- | --- |
| Primary source | [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons) |
| Pinned upstream revision | [`728a866ad59a54fd4082dbe000e1e62e50bd90e9`](https://github.com/trapd00r/win95-winxp_icons/tree/728a866ad59a54fd4082dbe000e1e62e50bd90e9) |
| Historical cross-reference | [WinClassic resources](https://winclassic.github.io/resources), **not** a grant to redistribute files |
| License status | **NOASSERTION** — the upstream collection declares no redistribution license |
| Rightsholders | Microsoft and the respective Windows/application icon owners retain their rights; Retro's MIT license does not cover these graphics |
| Recorded provenance | [Windows icon inventory](assets/windows-icons.provenance.json): upstream paths, generated paths, sizes and SHA-256 hashes |
| Distributed by Retro | No optional Windows icon binaries in Git or the default redistributable build; searchable metadata and built-in SVG fallbacks remain |

A historical October 2026 source-tree review at the pinned revision recorded **1,201 entries**: 1,191 ICO, 2 PNG, 3 ANI, 4 ICL and one README. These describe the upstream snapshot rather than the count shipped by Retro. Only browser-compatible ICO/PNG were import candidates; ANI and ICL were inventoried, not distributed.

A self-hoster who has independently checked the rights can run `pnpm icons:install -- --acknowledge-third-party-rights`. This optional command populates ignored `apps/web/public/windows-icons/` locally; `pnpm icons:remove` restores a clean state. The release gate `pnpm assets:audit:release` refuses excluded icon binaries. The former unversioned `/win98-icons/` PNG archive lacked adequate reproducible provenance and is not reintroduced; older documents can retain those references but use built-in fallbacks if the image is unavailable. **A source URL, a hash or a public GitHub repository is not permission to redistribute copyrighted artwork.**

## Currently bundled open icon subsets

Each of these curated sets has a bundled `NOTICE.txt` with source revision and applicable terms:

| Set | Pinned upstream revision | Recorded licensing / exclusions |
| --- | --- | --- |
| [Haiku icons](https://github.com/haiku/haiku) | `ac9aaea72eb11a8c425dbdd2d1f47fc9761c70c9` | MIT; source attribution retained; Haiku trademarks and third-party brand logos excluded |
| [Pixel-Art Icons](https://github.com/tstamborski/pixelart-icons) | `aff260c021f9a8053719de0113cd59e428c87eca` | CC0 1.0, Tomasz Stamborski; curated exclusions apply |
| [Pixelarticons, free collection](https://github.com/halfmage/pixelarticons) | `c9ecc2da61afde85dbe539025e3d931c6152ad75` | MIT, Gerrit Halfmann; Pro/Mini/Prime and other non-free collections excluded |

The [allowlist/exclusions](assets/open-icon-library.curation.json) and [per-file provenance](assets/open-icon-library.provenance.json) are the detailed source-of-truth, not a blanket authorization to add arbitrary files from a referenced repository.

## Cubic 11 web font

The bundled [Cubic 11](https://github.com/ACh-K/Cubic-11) font is under **SIL Open Font License 1.1**, whose text is retained at [`apps/web/public/fonts/OFL.txt`](../apps/web/public/fonts/OFL.txt). Recorded reserved names include **Cubic** and **俐方體**; modified fonts must respect the OFL naming terms. Do not assume the font has complete Japanese, Korean or Unicode coverage.

## Earlier license research — not current package approvals

Early project comparisons considered MIT-licensed 98.css and distinct React95 projects. One React95 project's licensing explicitly did not extend to Windows-related pictures. The research also flagged **tldraw** as having custom, non-MIT terms with possible production-use limitations, and did not verify a redistribution license for one Instagram-clone example. These were **historical candidate assessments**, not claims that Retro bundles the libraries or a current legal opinion. Recheck upstream terms, exact versions, transitive dependencies and assets before adoption. [Dependency licenses](DEPENDENCY_LICENSES.md) records the actual installed dependency inventory.

## User works and verification

User-uploaded OC art, icons, photos, music, lyrics, avatars, exported sites and reference screenshots do not become MIT-licensed merely because Retro stores or displays them. Redistribution requires appropriate permissions or other lawful rights.

Run `pnpm assets:audit`, `pnpm assets:audit:release` and `pnpm licenses:audit` before release. Inventory coverage and checksum success **do not independently prove redistribution rights**. The rights notices and pinned provenance files must remain part of the release.
