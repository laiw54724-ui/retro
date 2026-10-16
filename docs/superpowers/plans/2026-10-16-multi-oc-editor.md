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

## 19C visitor profile navigation

1. Add a read-only `profileDirectory` module boundary containing stable profile IDs and their authored posts. Editor preview may receive the draft directory; public desktop/mobile receive only the already-published projection. Legacy windows remain render adapters and never gain copied profile entities.
2. Until #21 adds explicit `FollowEdge` data, follower/following statistics open a clearly labelled “此桌面的角色” directory. It is discoverability, not a claim that every character follows every other character.
3. Replace the single previous-screen field with navigation frames keyed by `siteId/windowId/profileId/postId`. Push the current inner scroll offset before directory/profile/post navigation and restore it on pop after render. Closing and reopening a window still starts at its configured entry profile.
4. Key visit-only likes, saves, comments, carousel positions, follows and drafts by stable profile/post identity so same-shaped post IDs from different characters cannot share state. No visitor action writes the document or API.
5. Test A → directory → B → post → back → back on desktop and phone, scroll restoration, handle rename stability, per-window session isolation and server/public-projection removal of draft profile names, media and posts.
