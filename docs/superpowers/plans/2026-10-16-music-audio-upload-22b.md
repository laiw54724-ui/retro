# #22B Music audio upload implementation plan

**Goal:** ship owner-scoped private audio uploads with safe publish projection and browser-compatible media delivery.

**Architecture:** extend the existing `site_assets` pipeline rather than introducing a second storage system. The shared document stores a stable asset reference, the editor resolves private content through an authenticated endpoint, and publish copies referenced audio to the immutable public namespace.

**Tech stack:** React 19, TypeScript, Hono on Cloudflare Workers, R2, Supabase/Postgres, Zod, Vitest, Playwright.

## Task 1: Shared and database contracts

- Add `uploadedAudio` to v1 and strict versioned music source schemas.
- Expand API/web `AssetKind` and module upload callback types.
- Add migration `0007_audio_assets.sql` replacing the kind check with image/icon/audio.
- Add schema tests for accepted and rejected asset references.

## Task 2: Upload validation and quota

- Add audio signature detection and MIME normalization helpers.
- Split image/audio constraints in `assets.ts`.
- Reject oversized bodies/files, unsupported MIME, spoofed bytes, and site quota overflow.
- Persist audio under the existing private draft prefix and roll back R2 after DB failure.
- Add focused API tests.

## Task 3: Media responses and delete safety

- Extract a tested R2 response helper for full, `HEAD`, and single range responses.
- Apply it after authorization on private asset content and to published public assets.
- Reject malformed/multiple/unsatisfiable ranges with `416`.
- Load the current draft/published documents before delete and reject referenced assets.
- Add owner-boundary and reference tests.

## Task 4: Publish projection

- Allow MP3/Ogg/WAV private keys in `copyReferencedAssets`.
- Preserve MIME and immutable cache metadata in the public copy.
- Add publish tests proving audio references become public URLs and foreign keys remain rejected.

## Task 5: Music editor and playback

- Add an Uploaded Audio source tab and file picker.
- Resolve protected references through the existing asset resolver and feed the resulting blob URL to the singleton player.
- Stop the old source before changing or replacing it.
- Require and explain a rights note for uploaded audio.
- Add component/helper tests and styling.

## Task 6: Publish checks and end-to-end verification

- Add a blocking publish check for uploaded tracks missing a rights note.
- Add/update E2E coverage for upload, persistence, reload, and visitor projection.
- Run focused tests after each task, then full typecheck, unit, build, E2E, and code review.
- Commit, merge/rebase to the deployment branch, deploy API migration/Worker and Pages staging, then verify the immutable and canonical staging URLs.

