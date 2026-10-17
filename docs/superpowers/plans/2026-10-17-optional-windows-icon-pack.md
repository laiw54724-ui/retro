# Optional Windows icon pack implementation plan

**Goal:** Finish Issue #27 by licensing original Retro code under MIT while
keeping unlicensed Windows image binaries out of all default distributions.

1. Add the root MIT license and update license-scope, asset, setup, contributor,
   and self-hosting documentation.
2. Move both Windows icon binary trees out of Git and ignore their install
   locations; retain only provenance/search metadata.
3. Add explicit install/remove commands for the pinned optional pack, including
   acknowledgement, deterministic checkout, marker generation, and integrity
   verification.
4. Upgrade the asset manifest/auditor so normal development can use an ignored
   local pack while release mode proves excluded collections are absent.
5. Make the icon picker pack-aware and provide semantic built-in SVG fallbacks
   for missing optional and legacy paths.
6. Update focused tests, then run the complete contributor gate once before PR,
   merge, staging deployment, and online verification.

