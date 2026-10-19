# Basic Image staging rollout: release-owner procedure

## Authority and scope

The parent forwarded trusted user approval at2026-10-19T18:06:08Z for **staging-only basic none/simple Image availability after compatibility and privacy acceptance**. Production remains unchanged. This preparation branch does not activate or deploy anything. Its checked-in release file stays `enabled:false`.

Finish the parent's #127 release first. Use one release owner and parent receipts for subsequent work; do not start a competing deployment. Include frozen #128 plus this reviewed rollout source in the parent's chosen candidate, run the applicable combined exact-SHA gate, and record its outcome. No schema/API/DB grants/RLS/security changes are needed for this UI/build preparation.

Basic scope: upload/URL, none/simple frame, alt/caption, fit/crop/background/pixelated, normal history and draft/public reading. Viewer/Paint presets, Image actions, animation lifecycle and all other #51 requirements remain outside this rollout.

## Build contract

- Reviewed allowlist: Web `https://retrodesk-staging.pages.dev`; API `https://retrodesk-api-staging.beibeiz.workers.dev`. Preview deployment URLs and production/localhost/spoofed origins are excluded.
- `apps/web/config/image-staging-rollout.json` is strict JSON with boolean `enabled` and those exact origins. Default is false. `RETRO_IMAGE_RELEASE_CONFIG` may select an explicitly approved release file; it is not a general origin override. Invalid/missing files or unapproved targets fail the build.
- Staging requires an enabled release file, `vite build --mode staging` (package `build:staging`) and exact explicit `VITE_API_URL`. `VITE_IMAGE_WINDOW_WRITER=true` alone does not enable it. Normal production builds remain disabled even with the ordinary flag or enabled release file.
- Runtime additionally requires production staging mode, command-derived non-dev-server metadata, and both exact runtime Web/API origins. Existing ImageWriteProvider still requires the loaded site/API image contract and no upgrade pause. Existing API auth/roles, stored+incoming guards, import protections and version CAS are unchanged.
- Local development opt-in requires an actual Vite `serve` command, development mode and DEV. Builds with `NODE_ENV=development` are rejected; DEV is not trusted as proof of a dev server.
- Every build emits public `dist/image-rollout.json`. Package deployment commands verify this receipt; production rejects staging-mode or enabled artifacts. The receipt is local accident prevention, not an authorization boundary or a signed attestation.

## A. Normal session and disposable site

1. From the parent's known canonical staging entry, use the normal authorized owner login/session. Record the approved site ID and account role without recording cookies, bearer headers, refresh/access tokens or private user data. If no valid owner session exists, report **user login required**. If normal site load/write unexpectedly returns401/403, stop and return the exact operation/status to the parent. Do not try guessed sites/accounts, alternate credentials or permission changes.
2. Through the existing UI, create one synthetic disposable site named `Image canary <candidate-short-sha>`. Retain its ID, handle and current draft version. Use only self-owned fixture images/content. Do not use another author's live site.
3. On authenticated GET `/api/sites/:siteId`, verify owner role and `writeCompatibility.imageWindow:1` with the exact approved API origin. Record Web source SHA/Pages deployment identity and API Worker version separately. Missing/wrong advertisement is a compatibility blocker; do not turn off the guard.
4. Take the existing owner backup of the synthetic fixture. Keep a baseline canonical JSON/version locally, sanitized in receipts. Use the release owner's existing approved authenticated fixture client for the API canaries below; it must obtain authorization through the normal session and must not print/copy credentials. If that client/session is unavailable, stop and request normal login/setup through the parent.

## B. Compatibility and privacy acceptance before UI activation

Use the disposable site only. Fixture preparation may use the already-supported authenticated asset/draft/publish endpoints while Add Image remains off. This establishes deployed backend behavior before global staging UI activation; it does not change API permissions.

1. Upload a small transparent PNG through the existing authorized image asset flow. Expect a stable `retro-asset:` reference owned by this site. Preserve the raw authoring URL/source text only in the owner draft; never persist blob/signed preview URLs as canonical sources.
2. Prepare one valid image window with the reviewed shared factory in the site's current canonical document. PUT `/api/sites/:siteId/draft` using the current `expectedVersion`, `clientImageWindowContract:1` and unchanged appearance capability. Expect200, one version increment and an identical image/crop after authenticated GET. Save no unrelated data.
3. With the image stored, submit a deliberately image-stripped current-version draft **without** the image contract. Expect426 and unchanged document/version. Test unsupported marker as well. A capable deliberate removal with marker1 should succeed; restore the fixture with a fresh version afterward. In an authorized disposable race, a stale stripped submission must not win against a valid image save: expect409/426 rejection, never silent image loss.
4. Check both existing import preview/confirm routes: missing/unsupported image contract is426; compatible imports preserve image parameters and existing missing-media warnings. Use the normal digest/confirmation workflow; do not bypass media acknowledgements. Record blocked or unavailable import coverage honestly.
5. Publish the synthetic image using the existing normal owner operation/current expected version. Verify the real publication/storage path: owner draft retains its private reference/raw authoring text; anonymous public JSON/rendering contains the intended published image, empty image `srcUrl`, and no draft-only OC/post data or private source URL. Verify the actual published image bytes preserve alpha (and GIF animation if tested), not only a200 response.
6. With already-approved test identities, verify viewer write denial, unrelated-account private draft/asset denial, and anonymous draft/private-asset denial. Expected role-denial statuses are negative-test evidence. An unexpected denial for the authorized owner remains a stop condition. Missing approved roles/accounts are an acceptance gap; do not grant access or create credentials to fill it.
7. Exercise the deployed 426 UI using the controlled fixture: local JSON is retained, autosave/publish/migration stays paused, and a fresh compatible reader check does not silently replace/retry the current tab. Do not claim full historical-client coverage from the local frozen-discriminant test alone.

If any required compatibility/privacy canary fails or cannot run, keep the checked-in/default release off and report the blocker. Do not treat user approval as a substitute for those outcomes.

## C. Approved staging artifact and activation, release owner only

After B passes and parent review/gate receipts are complete:

1. Create an explicit release JSON from the reviewed default, change **only** `enabled` to true, and keep the two pinned origins. Record its SHA-256 beside the approved source SHA and conditional user approval. Do not change shared document schemas, server capabilities, credentials or permissions.
2. In the existing approved staging build environment (including its normal Supabase build settings), build:

```sh
NODE_ENV=production \
RETRO_IMAGE_RELEASE_CONFIG=/absolute/path/to/approved-image-staging-release.json \
VITE_API_URL=https://retrodesk-api-staging.beibeiz.workers.dev \
corepack pnpm --filter @retrodesk/web build:staging
```

3. Inspect `apps/web/dist/image-rollout.json`: version1, mode staging, enabled true and exact pinned origins. Run only the local checker before deployment:

```sh
node apps/web/scripts/verify-image-rollout-artifact.mjs staging
```

   Preserve existing deploy-environment verification. `verify-image-rollout-artifact.mjs production` must reject this artifact; do not run a production deployment to test that rejection.
4. The release owner performs the existing staging Pages procedure using this verified artifact, then records Pages identity, exact JS/CSS hashes, source/config digest and actual API Worker identity through the parent. Existing workflows are unchanged by this PR and continue ordinary production-mode/default-off builds; they will not automatically activate this feature. Choose one explicit approved release route rather than dispatching duplicate releases.
5. At the canonical staging origin, reload the authorized disposable owner editor. Verify Add Image is visible; missing API advertisement/426 pause still hides it. On desktop and320/375/430px phone, add/upload/replace/remove; set alt/caption; switch none/simple; change fit/crop; duplicate, undo/redo and save/reload. Verify source/crop are retained when changing frames. Complete real preview/public decorative click-through and Back/focus checks.
6. Verify failure/retry and stale upload versus newer URL input on the disposable site, with approved harmless failure fixtures if available. Mark untested natural failure cases as pending; do not change API/security behavior to manufacture them. Keep mocked and live evidence separate.
7. Report staging availability only after normal authors can actually see/use the entry on that identified deployment. Keep the full #51 issue open. Physical Safari/iOS/Android and actual browser zoom results are separate from local WebKit/viewport checks.

## Stop / disable

If access, compatibility or privacy fails, stop the rollout and use a new default-off staging artifact if activation already occurred. Preserve image-capable readers, API guards and existing documents. Removing the UI entry does not make a pre-image reader rollback safe. Do not delete images/assets or mutate other sites as a rollback. Fixture cleanup requires the release owner's existing disposable-data authorization and a separate receipt.
