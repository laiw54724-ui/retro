# Scene and media design reconciliation

This is a review checklist for the design files from [PR #58](https://github.com/laiw54724-ui/retro/pull/58) and [PR #83](https://github.com/laiw54724-ui/retro/pull/83), not a separate roadmap. Follow the [latest top section of issue #55](https://github.com/laiw54724-ui/retro/issues/55) for execution order. The work began at reviewed [PR #89](https://github.com/laiw54724-ui/retro/pull/89) head `7070296b231a021f5e8cad77013abadbab305956`. On 2026-10-19, #84 and #89 merged into `main` at `539ca50fb80fa9b5b8a43e25857910a5d97f5698`; that main tree equals the reviewed #89 tree.

## Provenance and current boundary

| Source | Exact source head | Carried files | Current status |
| --- | --- | --- | --- |
| [#58](https://github.com/laiw54724-ui/retro/pull/58) | `5f1bad114219aaba283b3b84c5b631343a015d83` | [Scene design](superpowers/specs/2026-10-17-scene-builder-design.md), [phased acceptance](superpowers/plans/2026-10-17-scene-builder-acceptance.md), [docs checker](research/scene-builder/verify-design.mjs) | Historical source audit at `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`; D-01–D-08 and all SC-01–SC-40 remain proposals/unrun. |
| [#83](https://github.com/laiw54724-ui/retro/pull/83) | `3c39b388968dfe0e9431ea2b8a0c27186d534d3d` | [M2–M4 design](MEDIA_M2_M4_DESIGN.md) | M2 generic help and bounded M3 HTTPS video were later implemented by [#87](https://github.com/laiw54724-ui/retro/pull/87) in #89; M4 and YouTube SDK remain proposals. |

The source commits were merged with ancestry preserved because each source commit adds only the listed docs files. This reconciliation adds status annotations and adjusts the docs checker; it does not approve a schema or a runtime design.

## Review before implementation

- [x] Reuse [#65](https://github.com/laiw54724-ui/retro/pull/65) WindowChrome and #38/#47 work. Check #49's remaining acceptance items against the existing implementation; avoid reopening completed work.
- [x] Use [#84](https://github.com/laiw54724-ui/retro/pull/84) preview source and public projection contracts as the current baseline. Its staging checks do not establish Scene behavior or complete native-device validation.
- [ ] Decide #54 D-01–D-08, especially v3 ownership and limits, reader-first parsing, public projection and asset traversal, save/downgrade guard, and rollback with loss reporting. Coordinate #29/#50 navigation and actions, #51 image, and #41 presentation interfaces before a Scene writer or UI. No v3 reader, writer, or SC-01–SC-40 implementation is claimed here.
- [x] Treat [#87](https://github.com/laiw54724-ui/retro/pull/87) M2 help and M3 bounded direct HTTPS video as implemented in merged #89, with unchanged `audioUrl` storage and no provider diagnosis.
- [ ] Validate M2/M3 on real providers and native devices. Decide whether YouTube SDK error signals justify a separate CSP and adapter review; no precise login/age/region diagnosis is promised.
- [ ] Treat M4 SoundCloud and any new provider enum or video variant as a separate reader-first contract and rollout decision. Keep the old reader compatibility and rollback questions explicit before enabling writers.

This docs handoff does not close [#54](https://github.com/laiw54724-ui/retro/issues/54), [#30](https://github.com/laiw54724-ui/retro/issues/30), or [#31](https://github.com/laiw54724-ui/retro/issues/31). Remaining release validation and deployment belong to the release owner under #55.
