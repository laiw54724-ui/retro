# Image authoring entry #51 — bounded verification

Base: `fa79436a3b8d7d1433e30b5abe4147c0868c4864`. Branch: `codex/image-authoring-entry-51`.

## Implemented slice

- Existing single-image schema, source/asset contract, v1/v2 transport, public privacy projection and defaults retained; no schema/API/SQL changes.
- Local Add Image, desktop selected-image Inspector and phone inline editor reuse the merged image leaf and normal media queue, history, autosave and reload paths.
- `none`/`simple` control changes presentation without changing source/crop. Desktop none removes actual chrome/background/padding; images remain selectable/movable/resizable, including a keyboard move handle.
- Visitor decorative outer host is inert and pointer-transparent. Phone retains Back/editor navigation outside frameless content.
- Add/content writers require a DEV-only opt-in. UI additionally requires the matching current site/API image advertisement and no upgrade pause. Production stays off even with the opt-in supplied. Appearance writer is unchanged and separately gated.

## Focused final results

| Check | Result |
| --- | --- |
| Web gate/context/store/Inspector/registry/leaf/compatibility and four-locale quality | 58 passed, 13 files |
| Shared image contract/public projection | 27 passed, 2 files |
| API image compatibility/publication privacy | 28 passed, 2 files |
| Shared typecheck | passed |
| Shared/API/web lint and applicable types | passed; recursive lint uses the package TypeScript checks; web also checked by production build |
| New local authoring Chromium | 7 passed, one worker, zero skips/retries |
| Production bundle with `VITE_IMAGE_WINDOW_WRITER=true` + existing reader Chromium | build passed; 7 tests passed, zero skips/retries |
| Existing isolated image leaf Chromium | 3 passed after bounded-height correction, zero skips/retries |
| Secret audit / diff whitespace | passed |
| Production entries / disposable fixture exclusion | index.html only; image debug and Paint sources absent from output source maps |

Authoring cases cover protected upload -> stable reference, Inspector alt/caption/fit/crop/frame, undo/redo, keyboard/pointer movement, save/reload and projected public rendering; stale upload vs newer URL; missing API advertisement; real click-through to an underlying window target in preview/public; phone add/edit/frame switching/Back/save/reload at 320/375/430px.

The public fixture uses the actual shared public projection and simulates the existing publication asset-copy stage. The API unit suite exercises real route code with in-memory services. Neither is live publication/storage acceptance. Four-locale resource tests do not establish ja/ko browser acceptance.

## Corrections and retained failures

- Initial focused unit run: 49 passed / 1 failed. A blocked image-content recipe still reached canonical merge and added history. An unchanged-document early return fixed this; affected tests and final focused set passed.
- Initial browser attempt could not bind loopback in the sandbox; the bounded local browser run used approved escalation.
- Browser authoring attempts: 1 passed / 4 failed; then 3 passed / 4 failed; then 6 passed / 1 failed. These were fixture/locator failures: exact wrapped labels, expected async autosave throwing before the first image existed, editor/preview locator ambiguity and an incorrect phone toolbar label. Assertions were corrected to target the actual accessible control and wait for saved data. Final seven cases passed. No automatic retries or assertion/baseline reductions.
- A targeted invocation with an anchored title grep found no tests; it is not counted as coverage.
- An earlier seven-case authoring run reported all tests passed (17.5s), while its shell wrapper exited 1 because the tee destination directory was missing at start. After the necessary leaf-layout correction, the final complete authoring run passed 7/7 (16.6s), including the logging wrapper. Earlier browser traces/screenshots remain outside git in the task evidence folder. No browser rerun was performed solely to repair logging. Final review moved the editor handle inside the image boundary so it stays reachable at canvas edges and added a real pointer drag assertion; the affected desktop case passed separately (1/1, zero skips/retries).
- The isolated leaf initially passed 2 / failed 1: a changed editor height allowed controls to overflow a bounded host and be covered by the following section. Restoring its existing 100% scroll layout fixed the actual integration regression; the final three leaf cases passed.
- Offline dependency install first selected an incomplete task store, then succeeded from the existing cached pnpm store without lockfile changes.

This is success after the recorded corrections, not first-pass success.

## Remaining gates

Draft for independent review and eventual combined integration. No full contributor/integration gate, WebKit, native device, live API/storage/publication or production writer acceptance is claimed. The final combined candidate should run the two new configs alongside existing gates:

```sh
corepack pnpm exec playwright test --config playwright.image-authoring.config.ts
corepack pnpm exec playwright test --config playwright.image-reader-production.config.ts
```

These configs are explicit local checks; this PR does not modify integration workflow triggers or dispatch a workflow. Production image/appearance authoring remains disabled. Release-owner approval and current reader/API/stale-client, asset privacy and cross-browser acceptance remain necessary before any writer rollout. #51 Viewer/Paint presets, UiActions and animation lifecycle/pause controls remain later work. No merge, deployment, infrastructure identity publication or Paint batch integration occurred.
