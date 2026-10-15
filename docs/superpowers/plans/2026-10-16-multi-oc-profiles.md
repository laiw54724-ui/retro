# #19 Multi-OC profiles implementation plan

Date: 2026-10-16 (Asia/Singapore)

## Goal

Turn the existing v2 profile entity boundary into a complete owner-authored multi-OC experience without weakening v1 compatibility or the #18 publication/private-media guarantees. Deliver in independently testable staging milestones instead of one large cutover.

## 19A — profile domain contract and deterministic migration

1. Extend `ProfileEntityV2Schema` additively with OC authoring fields: canonical handle/display name, pronouns, custom fields, world tags and an optional content-only theme override. Preserve legacy Instagram presentation fields so already-valid v2 input remains readable.
2. Define one canonical profile-handle policy and helper. Handles are trimmed, case-insensitively unique within a site and keep IDs as navigation authority. Migration of duplicate legacy handles uses deterministic suffixes and preserves the original legacy username label.
3. Add pure shared profile operations for create, update, duplicate, reference inspection and delete/retarget. Operations return typed diagnostics; they never leave dangling Instagram window or post references and never mutate their input.
4. Add fixtures with two legacy Instagram windows sharing a handle. Verify lossless, idempotent migration, stable disambiguation, Unicode display names, invalid/duplicate handles, duplicate-without-relations and delete blockers/retargeting.
5. Allow API draft validation to accept the existing v1 contract or the validated v2 contract, while site creation stays v1 until the editor cutover. Add owner-boundary/API tests and do not enable client v2 writes yet.

Release gate: shared/API/web typecheck, all unit tests, full E2E, production build, independent spec and quality review. Deploy API only if API parsing changes; deploy Pages to keep staging artifacts aligned. Keep #19 open.

## 19B — v2 editor persistence and profile authoring

1. Make the editor store/versioned API types accept `VersionedSiteDocument`; migrate a loaded v1 draft to v2 once with the real site ID and save it through optimistic concurrency.
2. Add site-level profile actions to the editor history boundary so one edit updates every window referencing the same profile and one undo restores it.
3. Build `ProfileSwitcher` and compact `ProfileEditor`: searchable profile list, current/draft badges, add, edit, duplicate and guarded delete/retarget. Keep advanced fields collapsed and maintain fixed save/back controls on phone layouts.
4. Adapt the Instagram module context to resolve `profileRef` plus posts by `authorProfileId`; retain v1 rendering as a read compatibility path during rollout.
5. Verify two windows referencing one profile, reload persistence, one-step undo, validation messages and 320/375/390/430px plus 360px inner-window usability.

Release gate: full local gate, final review, staging deployment and authenticated authoring smoke with a disposable test site/account only when safe credentials are available. Keep #19 open for visitor navigation.

## 19C — visitor entity navigation and completion

1. Replace the single previous-screen flag with a navigation stack keyed by site/window/profile/post and stored scroll position.
2. Add follower/following profile lists backed by stable profile IDs; visitors can navigate A → list → B → post → back without writing server data or seeing draft profiles.
3. Reset a reopened window to its configured entry profile while keeping visit-only likes/saves isolated by site/window/profile/post.
4. Confirm public projection removes draft profile names, avatars, posts and references. Add deep-link/rename tests with IDs as authority.
5. Run accessibility/responsive/interaction E2E, full release gate, staging deployment and live Chromium verification. Record evidence and close #19 only after every acceptance item passes.

## Non-goals

- Multiple real owners or collaborator permissions (future #21B).
- Cross-site OC relationships or OC authentication.
- Rich post authoring beyond the entity binding required here (#20).
- Site/window chrome theming changes (#26); profile theme overrides affect only Instagram content.
