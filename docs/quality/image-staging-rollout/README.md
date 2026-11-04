# Default-off basic Image staging rollout preparation

Stacked on frozen #128 `976c217d76eb792e9f1bb270a664af7f65f00f32`; branch `codex/image-staging-rollout-51`. Tested runtime `9dded7664e58f76a1e1afa6fc4addea16f985402`, tree `f2b5eb5b19dc6921eee18cad6f483e7fe8fb1ca4`. Later commits add evidence only.

**Checked-in configuration remains disabled. No activation, merge or deployment was performed.** Parent forwarded conditional user approval for staging basic none/simple availability after compatibility/privacy acceptance at18:06:08 UTC. The release owner finishes #127 first, then follows [the exact session/site/canary and release procedure](RELEASE.md). An unavailable normal owner session or unexpected owner401/403 is a blocker; no access workaround is provided.

## Implemented contract

- Strict release JSON pins the canonical staging Web/API pair from existing repository staging configuration; it defaults to false. No schema/API/DB permissions/workflow changes.
- Only an explicit staging **build**, enabled release config, exact build API origin, and exact runtime Web/API origins permit the staging writer. The ordinary env flag alone is insufficient. Missing/invalid/unapproved configuration fails closed.
- Production builds stay off even with the ordinary writer env flag and even with an enabled release config. Test-enabled staging compilation occurs only in temporary local fixtures. Production package deploy verification refuses staging-mode or enabled artifacts.
- Local authoring requires Vite's actual serve command, development mode and DEV. Release builds reject `NODE_ENV=development`. Dedicated build metadata and the runtime predicate avoid treating DEV alone as proof of a development server.
- Existing site/API advertisement, 426 pause, API raw stored/incoming marker guards, imports, roles/auth and version CAS remain unchanged. They are tested separately and require deployed canaries.
- Added `build:staging`, artifact receipt/verification, focused origin tests and actual in-memory Vite build tests. The Node build tests also run after web unit tests in routine CI. Existing deployment workflows remain unchanged/default-off.

## Local proof

| Portion | Result | Evidence |
| --- | --- | --- |
| Web creation/runtime-origin/context/compatibility tests | 35 passed | `evidence/web-gates.txt` |
| Existing API image preservation/import tests | 21 passed | `evidence/old-client-api.txt` |
| Node strict-config/artifact/real-Vite matrix | 3 top-level tests passed | `evidence/build-matrix.txt` |
| Production full web build with ordinary flag=true | Passed, receipt disabled | `evidence/production-build.txt`, `production-receipt.json` |
| Staging full build with default false + ordinary flag=true | Passed, receipt disabled | `evidence/staging-off-build.txt`, `staging-off-receipt.json` |
| Full staging build with temporary explicit enabled config | Passed locally under `/tmp`, receipt enabled; production target rejected | `evidence/staging-enabled-local-build.txt`, `staging-enabled-local-receipt.json` |
| Local desktop/320px authoring + absent API advertisement | 3 Chromium passed | `evidence/local-authoring-browser.txt` |
| Production reader/hidden creation/426 recovery | 7 Chromium passed | `evidence/production-reader-browser.txt` |
| Web TypeScript | Passed through final full builds | Build logs |
| Independent read-only review | P1 corrected and cleared; no remaining blocker reported | Review account below |
| Diff whitespace | Passed | `git diff --check 976c217...HEAD` |
| Full contributor/integration, fresh ja/ko or WebKit/native/live | Not run in this branch | Parent owns combined release gate; #128's earlier local WebKit proof remains separate |

Totals: **35 web +21 API +3 Node matrix tests, 10 focused Chromium cases; zero skips/retries**. Node matrix contains four successful gate compilations (production false/true config, staging false/true config), wrong API/origin rejection, and NODE_ENV development rejection in production/development/staging build modes. Runtime checks cover production, preview/spoofed origins, missing location, localhost and mismatched API. Full enabled output is a synthetic local build, not evidence of deployment or authenticated canary success.

The deployed service identities, old browser tabs, real upload/storage/publish/privacy, approved cross-account denials and native acceptance remain release gates. The UI/build rollout marker is not authorization and does not resolve #76/#96's separate DB boundary review. Disabling Add does not permit rollback to a pre-image reader after image documents exist.

## Review corrections and limits

Initial TypeScript check/full build failed because the Vite config directly used Node `process` without Node typings. Environment/file handling moved into the declared `.mjs` build helper; no dependency was added. Corrected full builds pass. A root-directory manual artifact check initially used a cwd-relative dist path; the checker now resolves its artifact relative to its own script and works from either package/root.

Independent review then found a P1 by source inspection: explicit NODE_ENV development can make Vite DEV true during a production build, bypassing the first local-dev branch while a disabled receipt was emitted. The source was corrected before final proof: command-derived serve capability, mode restriction and release-build rejection now cover that path. The expanded real-build matrix passes and the reviewer cleared the fix. No claim that the initial narrow tests covered this case or that the initial candidate was first-pass successful.

No source baseline, test assertion or API contract was weakened. No additional feature scope beyond basic none/simple Image rollout was added. Full #51 Viewer/Paint presets, actions and animation lifecycle remain open.

## Focused reproduction

```sh
corepack pnpm --filter @retrodesk/web test:image-rollout
corepack pnpm --filter @retrodesk/web exec vitest run src/lib/imageWindowCreation.test.ts src/lib/imageAuthoringGate.test.ts src/features/editor/ImageWriteContext.test.tsx src/lib/imageCompatibility.test.ts
corepack pnpm --filter @retrodesk/api exec vitest run test/image-compatibility.test.ts test/transfer-routes.test.ts
VITE_IMAGE_WINDOW_WRITER=true VITE_API_URL=https://retrodesk-api-staging.beibeiz.workers.dev corepack pnpm --filter @retrodesk/web build
VITE_IMAGE_WINDOW_WRITER=true VITE_API_URL=https://retrodesk-api-staging.beibeiz.workers.dev corepack pnpm --filter @retrodesk/web build:staging
```

The committed config stays false in both commands. Test-only enabled configs are created and removed by the Node matrix. The full enabled build receipt was captured from a separate `/tmp` output; deployable package dist was subsequently rebuilt by the production-reader fixture and verified disabled.
