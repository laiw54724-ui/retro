# #20A OC content entities implementation plan

Date: 2026-10-16 (Asia/Singapore)

## Delivery boundary

This slice establishes backward-compatible v2 contracts, deterministic migration, legacy adapters, semantic validation, and public projection for richer OC content. It deliberately does not expose unfinished editor controls or named social interactions. Existing v1 and early-v2 documents must continue to render and edit without data loss.

## Canonical contract

1. Add `PostMediaV2` with stable ID, image/asset reference, source URL, alt text, optional crop and optional intrinsic aspect ratio. Array order is canonical; up to ten media items are allowed.
2. Extend `PostEntityV2` with defaulted `media`, `worldDateLabel`, `taggedProfileIds`, `collectionIds`, `pinned`, and optional ISO `createdAt`/`updatedAt`. Keep legacy `src`/`extra` fields during the rollout so old clients and the current editor remain lossless.
3. Add site-level `HighlightEntityV2` with owner, visibility, title, cover image/source/alt/crop, and up to fifty stable frames. A frame supports image/source/alt/crop plus short text. Keep embedded profile highlights as a deprecated compatibility projection until #20B switches authoring to entities.
4. Add site-level `CollectionEntityV2` with owner, visibility, title, optional description, and ordered post IDs. `entities.highlights` and `entities.collections` default to empty arrays so existing raw v2 documents remain valid.
5. Extend entity refs/resolution and semantic validation for highlight/collection identity, site scope, owners, tagged profiles, post collections, and collection post references. Reject missing/cross-site references rather than silently dropping them at the draft boundary.

## Migration and compatibility

1. v1 → v2 converts the main post image followed by `extra[]` to ordered media with deterministic bounded IDs, preserving every existing item up to the already-enforced ten-image limit. Existing src/extra/comments remain unchanged.
2. Each legacy single-image highlight becomes a deterministic highlight entity with one frame and the same image as its cover. The embedded highlight remains available to the current legacy editor.
3. Re-running migration on valid v2 stays validation-only and preserves the caller's exact raw object.
4. v2 → legacy prefers non-empty canonical media/highlight entities and otherwise falls back to legacy fields. It maps media item one to `src` and the remainder to `extra` without changing post IDs.
5. Legacy editor merges regenerate canonical media for changed posts and synchronize an owner's highlight entities when embedded highlights change. Site-level IDs stay stable where matching IDs already exist.

## Public projection and privacy

1. Retain only published profiles/posts/highlights/collections in the current site. Posts require a published author; highlights/collections require a published owner.
2. Strip tagged profile IDs that are not public. Strip collection post IDs and post collection IDs that do not resolve to retained public entities.
3. Frames and media live inside their owning public entity; draft owners/entities therefore cannot leak image URLs, text, titles, or metadata.
4. Reparse the projected document after filtering. The API publish path continues using this shared projection as the authority; the browser projection remains defense in depth.

## Verification and release

1. Add shared tests for deterministic lossless v1 migration, limits/defaults, early-v2 compatibility, legacy projection and merge synchronization.
2. Add semantic tests for duplicate IDs, missing/cross-site owners, tagged profiles, collections and post references.
3. Add public-projection tests proving draft highlight frames, covers, collections, tagged profiles, post media and URLs cannot leak.
4. Run shared and API unit tests first, then the full typecheck/unit/E2E/build gate. Perform independent spec and quality review.
5. Deploy Pages if runtime projection changes affect the public app; deploy the API only if Worker source or shared Worker bundle behavior changes. Verify canonical bundle and desktop/mobile public smoke before updating Issue #20.

## Follow-up slices

- #20B: media/highlight/collection CRUD, sorting, retryable uploads, and mobile editor flow.
- #20C: natural-ratio detail layout, pinned/collection tabs, lazy loading, keyboard/paused highlight viewer, 60-post responsive/performance coverage.
