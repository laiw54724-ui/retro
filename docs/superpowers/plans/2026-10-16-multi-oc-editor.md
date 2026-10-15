# #19B Multi-OC editor and v2 runtime implementation plan

Date: 2026-10-16 (Asia/Singapore)

## Runtime cutover

1. Introduce one versioned-document loader for API/editor/public use. It parses v1/v2, migrates editor v1 input to v2 with the real site ID, and returns typed diagnostics instead of casting invalid JSON.
2. Keep site creation on v1. On first editor load, a valid v1 draft becomes v2 in memory and is marked dirty so optimistic autosave persists the exact migrated document once. Existing v2 remains validation-only and is not rewritten.
3. Change editor/store/canvas/mobile/preview document types to v2 after load. Public visitor accepts either validated v1 or v2 so an older publication stays readable during rollout.
4. Preserve all non-Instagram modules through a narrow structurally-compatible adapter. A v2 Instagram window resolves `profileRef` and author posts into a legacy-shaped render model only at the module boundary; no duplicate profile data is written back into the window.

## Profile authoring

1. Add editor-store site-level actions: create, update, duplicate, switch a window entry profile, inspect references, and delete/retarget. Each successful action goes through the existing one-document history boundary so shared-profile edits update all referring windows and one undo restores the entire change.
2. Add `ProfileSwitcher`: searchable site profile list, current marker, draft badge, add and duplicate actions. Switching only rewrites the selected Instagram window's stable `profileRef`.
3. Add `ProfileEditor`: compact default view for handle, display name, avatar, bio and pronouns; advanced disclosure for custom fields, world tags, visibility, legacy presentation controls and content-only accent/background. Reuse protected upload/Blob resolution.
4. Guard delete with the shared reference report. The dialog lists referring windows/posts and requires a valid replacement profile when references exist; unreferenced profiles may delete directly.
5. Mobile uses the existing full-screen window editor and keeps profile switch/add/back actions sticky/reachable at 320/375/390/430px. Desktop inner window remains usable at 360px.

## Rendering and validation

1. Update Instagram preview to accept a resolved profile/posts pair and use canonical `handle`/`displayName` with legacy fallbacks. Keep likes/saves/comments visit-only.
2. Profile theme override changes only Instagram content accent/background. Site font and window title bar remain owned by the site/window theme.
3. Draft validation uses `parseSiteDocument` plus route scope. Public projection continues to remove draft profiles/posts and Instagram windows whose entry profile is not public.
4. Missing refs produce an explicit repair state in the editor and are rejected by persistence/publish; never silently fall back to another character.

## Tests and release gate

1. Store/unit: v1 load migration, v2 idempotence, shared profile update across two windows, one-step undo, switch, duplicate-without-relations, delete blocker and retarget.
2. Component/E2E: create two OCs, switch/reload, shared edits appear in two IG windows, validation for duplicate/case handle and empty display name, avatar/protected reference rendering, desktop/mobile switcher usability.
3. Regression: all current editor/public/Instagram/responsive tests continue passing; add public v2 rendering/projection coverage.
4. Run independent spec review and quality review, typecheck, all unit tests, full serial E2E and production build. Deploy Worker only if API changed; deploy Pages, run canonical/immutable and real-Chromium desktop/mobile smoke, update Issue #19 and keep it open for 19C.
