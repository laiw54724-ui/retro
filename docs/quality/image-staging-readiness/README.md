# Image #51: staging readiness, not a completion claim

## Current answer

**The basic single-image component works in local fixtures but is not available for authors to add on staging.** It must not be called finished or staging-ready while its creation entry is inaccessible. No date or duration is supported by the current evidence.

Main checked during this audit: `8e2e54241ecca4c79cb5d6190e7b4b0beb804075`. Independent branch: `codex/image-staging-readiness-51`. Local cross-engine test addition: `ee11942e1dbe252d4a8a1a4361bed7a07f3c82f7`. Final scoped runtime fix: `80079e668ce81011129ca0525e9300f41bea545d`. Later commits contain evidence only. The only application-source change from main is `ImageEditor.module.css`; all gates, schemas, API runtime, credentials, permissions and deployments remain unchanged.

## Concrete blockers to a usable staging first slice

| Area | Current evidence | Remaining work / owner |
| --- | --- | --- |
| Creation is inaccessible | `imageWindowCreation.ts` requires **DEV AND VITE_IMAGE_WINDOW_WRITER=true**. Staging uses the ordinary Vite production build. Registry/Add lists, store add/duplicate/content writes, Inspector and phone controls consume the gate. A production build with the variable supplied still passes all seven reader/hidden-authoring checks. | A reviewed **staging-only rollout code/build contract** is required. Setting the existing environment variable alone cannot work. This task does not introduce or activate that contract. Keep ordinary production creation off and retain the current site/API advertisement and 426 pause conditions. |
| Local basic implementation | Existing schema, registry, upload/URL, alt/caption, fit/crop, transparent/checker/color background, pixelated, none/simple, move/history/duplicate, save/reload and projected public reading exist. New two-engine checks cover the actual authoring UI. | No further core creation/source defect was found in this bounded local matrix. The newly reproduced phone help-text contrast defect is fixed here. This is evidence for the basic none/simple slice, not all #51 requirements. |
| Old-client preservation | Current API checks raw incoming **or stored** image discriminants before parsing; exact `clientImageWindowContract:1`, version CAS and both import guards exist. Web sends the marker, binds `writeCompatibility.imageWindow:1` to the loaded site/API, and pauses on 426 with canonical recovery JSON. Local stale/stripped write, CAS, auth and import tests pass. | Release owner must identify and verify the **deployed** API/reader versions and advertisement, stripped saves at current version, first-write race, imports, deliberate removals and 426 recovery. Frozen old-discriminant testing is not a full old-browser-build test. Do not roll back to pre-image readers after image documents exist; disabling Add does not make that safe. |
| Real authenticated data/media | Browser auth/site/upload/public responses are synthetic; API unit tests use in-memory services. They exercise real app/route code, not live storage or publication. | On an authorized disposable staging site, verify owner upload → stable private reference → save/reload/duplicate → publish → anonymous rendered asset, plus owner draft/raw URL retention and public raw-URL/private-data exclusion. Verify approved viewer/unrelated/anonymous denial cases. Record Web SHA/Pages identity and API version separately. |
| Existing 403 stop | No live staging request or authorization workaround was attempted in this task. Existing owner-session/site access was reported blocked in the parent handoff. | Obtain a valid normally authorized test session/site through the release owner. An unexpected owner 403 stops the canary; record it and hand it back. Do not guess other sites/accounts, alter permissions or bypass the denial. No token or secret should be pasted into the report. |
| Release and acceptance | Local WebKit now passes authoring, production reading/recovery and rendering checks. Physical Safari/iOS/Android, actual browser 200% zoom, live upload/CSP/storage and deployed stale-client checks remain unverified here. | Parent owns combined exact-SHA gate and release decisions. Native/device acceptance must be recorded separately. Local WebKit is not native-device evidence. The separate #76/#96 database-write-boundary decision is not resolved by this cooperative API marker. |

**Approval alone is insufficient.** The smallest release path is: agree that the first staging release is the explicitly bounded basic none/simple Image slice; prepare/review the staging-only gate/build change with production-off tests; verify/deploy compatible API/readers under the release owner's existing authorization; establish a valid authorized canary session; approve activation only for that staging target; pass the live canaries above. All of those steps remain outside this PR's activation authority. Do not ask the user merely to set the current flag: it cannot expose the component in a production build.

**Earliest evidence-backed readiness statement:** the basic first slice has local Chromium and WebKit proof and can proceed to that controlled rollout process. It becomes usable staging functionality only when the entry is actually enabled on the approved deployment and the authenticated canaries pass. Until then its status is **locally verified, staging authoring blocked**.

## Original #51 acceptance versus the first slice

Original acceptance: [issue #51](https://github.com/laiw54724-ui/retro/issues/51). Do not silently reduce its completion definition.

| Requirement | Status |
| --- | --- |
| Standalone image schema/defaults/registry/versioning/public projection; source, crop, alt/caption and none/simple authoring | Implemented; bounded local checks pass; production authoring unavailable. |
| Transparent OC image + none/decorative, real pointer-through with editor move/select | Local authoring/preview/public fixtures pass; real upload/publication acceptance pending. |
| JPEG/PNG/WebP/GIF | Local JPEG URL encode/decode/save/reload/public test added; existing PNG/WebP transparency and GIF DOM preservation checks run in WebKit. API private-public copy/MIME/foreign-site checks cover all four formats. This is not live upload evidence for all formats. |
| Four interchangeable frames | Only none/simple exist. Image Viewer and Paint Canvas presets require implementation and a reviewed strict-contract extension; this task changes no schema. Configurable border/shadow/outline options are also not established by the fixed simple-frame CSS. |
| Click enlargement, window/OC/post/music actions | Not implemented for Image; depends on #50 action contract. No clickable/action discriminant is admitted by the current image schema. |
| GIF/animated-WebP preview pause, offscreen/inactive policy, reduced motion | Not implemented. Preserving the same img element on a style change does not establish animation lifecycle or pause support. |
| Mobile single-window/full-width/hidden modes | Current mobile single-window path is verified. No full-width/hidden presentation contract is established; current mobile layout stores order only. |
| Save/reload, duplicate/history, projection, JSON transfer and private references | Covered by local browser/store/shared/API tests. Actual publish/storage, deployed import/export and cross-account canaries remain pending. |
| 320/375/430, 200% zoom, slow/broken/extreme sources, native devices | Phone authoring and WebKit renderer/fallback/extreme-source checks pass. Actual browser 200% zoom and native-device acceptance remain open. |

Viewer/Paint presets, Image actions, animation lifecycle and the remaining presentation choices are **actual implementation gaps for full #51**. They need not be misrepresented as completed in order to release a clearly labeled basic first slice.

## Work completed in this branch

- Adds `playwright.image-readiness.config.ts` with authoring / production-reader / isolated-renderer modes and separate Chromium/WebKit projects. It reuses existing fixture server/gate settings; it changes no rollout flag source or deployment.
- Adds actual locally encoded JPEG authoring/save/reload/public-reader coverage and JPEG private-public copy/MIME/foreign-site coverage.
- Visual review found help text over the frameless phone wallpaper at **1.641:1** contrast. The Image editor controls now have their own opaque surface and text color; the preview and artwork retain transparency. A computed help-text contrast check requires at least 4.5:1 at 320/375/430px. This is one measured pair, not a full accessibility audit.
- Independent read-only review cleared the bounded CSS/config/test changes; the reviewer ran no tests.

## Exact local results and accounting

| Check | Result |
| --- | --- |
| Shared image contract | 22 passed |
| Web gate/scoping/store/leaf | 24 passed |
| API preservation/import/publication/public response | 40 passed |
| Chromium authoring | 10 passed before the CSS fix; affected phone 3 + desktop 1 passed after it |
| WebKit authoring | 10 passed before the CSS fix; affected desktop/phone 4 passed after it |
| WebKit production reader, hidden creation, 426 recovery | 7 passed on the same runtime before the controls-only CSS change |
| WebKit isolated renderer | 5 passed: pixel placement/alpha, GIF element retention, fallback, pointer-through, extreme/WebP and late protected source |
| Final web typecheck and production build | Passed; build supplied the existing opt-in and remained a production reader build. Existing dependency annotation/large-chunk warnings remain. |
| Standalone root lint / contributor / full integration gate | Not run locally; parent owns combined gate |
| Fresh ja/ko resource/browser matrix, physical devices, live staging | Not run in this branch |

Totals: **86 distinct units and 32 browser case/engine combinations passed** (Chromium 10; WebKit 22). Eight affected checks were repeated after the scoped CSS fix and are not additional coverage. Final successful selected runs have zero skips/retries. This was not first-pass success: the first WebKit attempt lacked the locked browser executable (one setup failure/eight not run), the new JPEG test initially threw before autosave produced its image (harness observation corrected), and the measured contrast regression failed before the CSS fix. Historical logs are retained.

Reproduction (install the locked browsers first; this host installed WebKit under `/tmp/retro-image-readiness-browsers`):

```sh
PLAYWRIGHT_PORT=5341 corepack pnpm exec playwright test --config playwright.image-readiness.config.ts --project=chromium --workers=1 --retries=0
PLAYWRIGHT_PORT=5341 corepack pnpm exec playwright test --config playwright.image-readiness.config.ts --project=webkit --workers=1 --retries=0
IMAGE_READINESS_MODE=reader PLAYWRIGHT_PORT=5342 corepack pnpm exec playwright test --config playwright.image-readiness.config.ts --project=webkit --workers=1 --retries=0
IMAGE_READINESS_MODE=renderer corepack pnpm exec playwright test --config playwright.image-readiness.config.ts --project=webkit --workers=1 --retries=0
```

Logs, source identity and screenshots are in `evidence/`. Screenshots are synthetic local UI captures and do not show staging availability. The desktop/320px post-fix captures were opened and visually checked.
