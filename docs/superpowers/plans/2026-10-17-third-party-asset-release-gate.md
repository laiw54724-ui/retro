# #27A Third-party asset release gate

**Goal:** Make every bundled third-party visual/font asset traceable and make unknown additions fail a deterministic audit before release.

**Decision:** Keep the already-shipped compatibility icon namespace intact. Record it honestly as `needs-evidence`; do not imply that a Windows icon collection is MIT merely because its source is known. The normal audit verifies coverage and integrity. A stricter `--release` mode additionally refuses `needs-evidence` or `replace`, so an open-source source archive cannot be called redistribution-ready prematurely.

## Implementation

1. Add `docs/assets/third-party-assets.manifest.json` with source, revision, author/rightsholder, license, notice, permitted scope, review status, file count and deterministic tree hash.
2. Add `scripts/audit-third-party-assets.mjs` to enumerate distributable media/font files, reject uncovered or multiply-covered paths, validate status/license invariants and verify the recorded tree hashes.
3. Expose `pnpm assets:audit` and `pnpm assets:audit:release`; keep Windows importer verification as the deeper per-file provenance check for the pinned `/windows-icons/` collection.
4. Document the difference between a passing inventory audit and redistribution approval in `docs/THIRD_PARTY_ASSETS.md` and the contributor workflow.

## Verification

- Focused audit passes for the current repository and reports confirmed/needs-evidence counts.
- A temporary unknown public asset makes the audit fail; removing it restores pass.
- Tampering with an expected hash in a temporary manifest makes the audit fail.
- `--release` intentionally remains blocked while Windows icon collections have `NOASSERTION`/`needs-evidence` status.
- No product runtime code or user content is changed in this milestone.
