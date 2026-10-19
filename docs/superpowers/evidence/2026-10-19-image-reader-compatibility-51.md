# Image #51 reader and preservation evidence

Base: main `d366225657604e1515ed4c9075fc8dbf954584a6`. Shared contract baseline sent for leaf coordination: `642895a898f1b60102f74342af319a4417f06dfc`, branch `codex/image-reader-compat-51`. The image worker confirmed the field/default contract and later confirmed finding that exact pushed baseline. The leaf remains separately owned and reviewed.

## Scope

Strict image windows in v1/v2, explicit safe defaults, existing migration/projection/merge preservation, content-alt warning, export/import media-reference coverage, and unchanged private publication pipeline. Independent `writeCompatibility.imageWindow: 1` and `clientImageWindowContract: 1` guard incoming or stored raw image windows before create/save parsing. Save uses the existing stored snapshot and conditional version CAS. Both import endpoints require the separate image contract before parsing, including stripped packages; the appearance requirement is unchanged.

The client sends both independent transport contracts without storing them in documents. Neutral recovery retains local canonical JSON, pauses autosave/publish/migration through the existing 426 path, and checks image support when either local or stored data contains an image. Existing appearance helpers, writer flag, and appearance locale keys are unchanged. Added neutral recovery keys are aligned in all four locales.

A minimal central read-only adapter uses merged W3a presentation. All Add lists exclude image; direct store add and image duplication are blocked. No image editor leaf, outer frameless host, Inspector integration, action, viewer/Paint preset, new uploader, SQL, permission setting, remote write, or writer enablement is included.

## Focused checks

- Shared image contract: 20 tests pass; existing versioning/transfer/asset versioning checks: 38 pass.
- API image/appearance compatibility, transfer, and publication assets: 46 pass. Covers raw incoming/stored detection, exact markers, separate namespaces, preserved CAS under a competing image save, auth/access, import preview/confirm/digest/missing-media confirmation, original media stream staging, and foreign-site asset rejection.
- Web image metadata/recovery, existing appearance metadata/senders, registry, and store creation guard: 26 pass.
- Chromium image reader: 5 pass, no skips/retries. Desktop/phone reader, ordinary edit/save/reload, both transport markers, phone Add list, local JSON retention, missing image advertisement, and no automatic save retry after 426 are covered with local fixtures and mocked APIs.
- Existing appearance and migration 426 browser checks: 9 pass; 4 opt-in appearance control advertisement cases intentionally skip in the default-off build. Existing opt-in writer code is unchanged and no fresh enabled-writer claim is made.
- Shared/API typechecks pass. `git diff --check` passes.

The first image browser run exposed a zero-height stage in the new central adapter and overlapping fixture windows. The adapter now supplies a bounded grid area; fixture placement uses the actual window index. Four affected tests passed after correction; the final five-test image suite passed after the phone Add assertion was added. These are corrected test results, not a first-pass claim.

## Integration blocker and limits

Web typecheck fails only in the deferred `InspectorContent.tsx` Instagram fallthrough after extending the window union. Navigation R1 (#104) owns that file and has not landed. Selecting an image through that legacy Inspector path is not accepted. Do not integrate or deploy this Draft until R1 lands, an explicit read-only image Inspector branch is added, and web typecheck plus the focused selection path pass. No assertion was weakened and no compiler gate was excluded.

No full contributor/integration suite ran for this patch. Browser receipts are local Chromium emulation, not native devices or live-backend acceptance. Existing outer shells still apply: `frameMode: none` data is retained but does not establish a complete frameless desktop host or outer pointer-through behavior.

Frozen pre-image discriminants reject the new `image` type (the focused test freezes that type boundary, not a full old UI build). After image documents exist, readers and preservation guards must remain deployed; disabling creation alone does not make an old-reader/API rollback safe. Restore image-free documents before any such rollback. Imported private references retain missing-media/re-upload warnings and gain no media bytes or redistribution rights.
