# Music M2/M3 implementation plan

Goal: deliver generic actionable provider help and bounded direct HTTPS video playback for #31/#30, based on reviewed a53821189f02f4ad8329d77a9049acefd91f13e1 and design PR #83.

Architecture: retain provider iframe isolation and existing `audioUrl` persistence. Recognize .mp4/.m4v/.mov/.ogv/.webm as video hints, never arbitrary webpages. Browser decoding determines real support. Use a visible `video` with controls/playsInline/preload=none and no src until a click. Register its element with the existing coordinator; discard prior native media and iframe on activation. Module-local styles; new m2/m3 translation namespaces only.

- [x] Verify immutable source identity, current issue/PR scope, and available instructions.
- [x] Prove unchanged v1/v2 `audioUrl` readers, JSON reload, legacy merge, public projection and both export/import scopes with direct-video fixtures.
- [x] M2: explicit help plus delayed generic guidance independent of iframe load; retry remount, original-site action, no diagnosis or SDK/CSP changes. Guard stale iframe events.
- [x] M3: centralized extension hints/classifier, explicit external/player conversions without rewriting saved external links, video component and shared native lifecycle ownership. Reject invalid URLs and retain unsupported-format fallback.
- [x] Focused source/coordinator/compatibility units; existing Music E2E plus dedicated M2/M3 clicks at 320/390/430 and desktop; applicable lint/typecheck. No full suite.
- [x] Record exact outcomes, changed files, scope/risks, screenshots and unverified native/live behaviors; commit/push own branch and create Draft PR on integration/retro-night-quality-01.

No schema change, migration, SDK, CSP, SoundCloud, skins, server URL fetch, deployment, main merge or issue closure. Old clients retain valid `audioUrl` data and their prior audio-only behavior; video visibility requires the new reader. Existing external links remain external until explicitly converted/re-pasted.
