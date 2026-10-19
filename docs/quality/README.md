# Fixed performance baseline and optional icon payload fix — #75

This branch measures one pinned candidate and changes only the optional Windows icon manifest loading boundary in `apps/web/src/features/modules/links/IconPicker.tsx`. No API/security policy, Moodboard, preview/mobile shell, Music, Instagram, shared schema, CSS, i18n or CI files were modified. No dependencies were added.

## Source identities and scope

- Before: `386c209dd8cb47bae96a749a7751cc7189032183`, `integration/retro-preview-r1-r3`. Its existing [integration gate 39145698313](https://github.com/laiw54724-ui/retro/actions/runs/39145698313) succeeded; it was not rerun as this branch's gate.
- After measured runtime: `5f29c132ea0ae6abff4a50b2fa9643bd268e8c72`. Later evidence-only commits retain the same runtime. Exact final gate SHA and outcomes are recorded in the Draft PR validation receipt.
- Excluded: M1 #77 (`3d362aba671be19a67b022f97f18cef8c894753b` when inspected), pending R3/TrackSourceField review fixes, later Claude changes, real-device verification, M2/API/CSP work and #76 security investigation.
- Worktree: `task-2/retro-quality`; branch: `codex/quality-baseline-75-76` (name retained after scope narrowed to #75). Remote verified as `https://github.com/laiw54724-ui/retro.git`. No applicable AGENTS.md was found in repository/ancestor checks. Other worktrees and uncommitted work were untouched.

## Confirmed finding and bounded fix

The optional Windows catalog was statically imported by IconPicker, pulling 1,193 records into the shared entry bundle even on public/sample pages and when the optional pack was not installed. The entry source map included the complete 214,022-byte `windowsIconManifest.ts`; the regression in [original-payload-failure.txt](evidence/original-payload-failure.txt) fails on the untouched before build.

The manifest now loads only after an installed pack's Windows tab is selected. Existing localized loading/error/retry copy is reused, other categories remain usable on failure, and stable IDs, file paths, selection, upload guards and persistence are unchanged. The after entry source map no longer contains the manifest. A separate module is retained in the browser module cache after first use, which is intentional.

| Production asset | Before bytes | After bytes | Difference |
|---|---:|---:|---:|
| Initial JS | 1,680,569 | 1,512,817 | -167,752 (-9.98%) |
| Initial JS gzip | 471,526 | 449,568 | -21,958 (-4.66%) |
| Initial JS Brotli | 366,500 | 351,783 | -14,717 (-4.02%) |
| Shared CSS | 139,332 | 139,332 | unchanged |
| Existing open icon catalog JS | 68,192 | 68,192 | unchanged; already lazy |
| Optional Windows module | included in initial JS | 168,345 | requested only for the installed Windows tab |

Raw bundle sizes and compression results are in [before](raw/baseline.json) and [after](raw/after.json). File byte counts are exact; compression sizes are computed locally. Production hosting transfer compression was not measured. Initial request count stays the same; the JS response becomes smaller. Requesting Windows icons adds one deferred JS request. The focused request-boundary tests verify no manifest request on initial load, general picker opening or missing-pack fallback, plus installed-pack search/apply and chunk error/retry.

## Environment and fixtures

Production Vite build, locked dependencies, Node 22.21.0 and pnpm 10.18.2. Full OS/CPU/browser identity is in the raw JSON. Chromium runs headless, no CPU or network throttling, 800px viewport height and widths 320/390/1280. These are browser viewports, not physical iOS/Android devices. Each combination has three fresh-context cold/warm pairs. Warm navigation uses the same context; no Playwright request routing is used by the performance matrix because it disables the HTTP cache. HTTPS is blocked via CDP. All data is synthetic; the server binds only `127.0.0.1:5197`, rejects fixture writes and never proxies production.

| editor/public fixture | Windows | Published profile entities | Gallery images | Document JSON bytes |
|---|---:|---:|---:|---:|
| empty | 0 | 0 | 0 | 499 |
| normal | 3 | 1 | 6 | 3,006 |
| heavy | 10 | 8 | 30 | 13,512 |

All gallery sources use a deterministic locally generated 1024×768 RGB PNG (574,701 encoded bytes) with unique URL per image; its natural decoded dimensions are asserted in desktop nonempty cases. Actual requested/rendered images are logged per row; phone home screens intentionally do not mount gallery thumbnails until the app opens. Homepage samples use the real built-in card (2 windows), ig (1) and oc (3) examples. There is no empty sample option, so none is invented or injected into runtime. Native samples use their existing placeholder images, not the heavy fixture.

Fixture JSON SHA-256: `044ce5218c8271a3d37063756d2a93e91dbd40b1ca5793dd34051b4088caf0d0`; PNG SHA-256: `e984a386a2efe7f8cdf2380d640f478b4413491657e793e8915f583d0175aa1a`. Both hashes were identical before/after. An earlier measurement preflight accidentally populated only `srcUrl`, leaving `src` empty. That preflight was discarded and the fixture corrected before both published datasets; the decoded-dimension assertion prevents recurrence.

## Results and interpretation

See [matrix.md](matrix.md) for all 27 fixture/width combinations, cold/warm readiness, FCP, resource transfers and interaction profiles. Raw datasets contain 162 navigation observations each, including resource types, timings, transfer/body sizes, natural/rendered image dimensions, DOM counts, long tasks, observed LCP/CLS and CDP runtime counters. Observations are medians of three, with original individual values retained.

The demonstrated improvement is the initial payload reduction. These loopback timings include Playwright readiness polling and are too short/noisy to establish a field latency improvement. Reported click-to-two-frames and CDP script/layout work are laboratory proxies, not INP or React commit counts. LCP after opening a sample is still the landing document's LCP, because the click ends LCP observation. No Lighthouse score or user-device speedup is claimed.

The server intentionally serves hashed JS/CSS and fixture images with an hour cache lifetime. The font uses the harness's `no-cache` fallback without validators and is transferred again on warm navigation (400,228 body bytes); that is a harness policy, not a finding about deployed CDN cache behavior. API envelopes are synthetic and carry draft/published copies for frontend fixtures; backend performance and authorization are not measured. Resource counts omit document navigation; `transferSize > 0` counts transferred Resource Timing entries. Transfer bytes include browser-reported header overhead, not a packet capture.

The bundled open icon catalog was already deferred and icon images use lazy/async loading; no duplicate React or Supabase runtime version was found in entry source-map package paths. Oversized source images can still cost decode/memory in a many-image fixture. That observation does not justify changing asset contracts or creating a new image pipeline in this batch.

## Render and media lifecycle coverage

Three open/close preview cycles at each width use the heavy fixture; phone cycles also open/leave Photos.exe. [Before](raw/baseline-interactions.json) and [after](raw/after-interactions.json) contain CDP script/layout deltas, layout/style counts, close latency, heap snapshots, DOM counts and remaining media nodes. DOM counts after close were stable across cycles; there were no residual preview/media DOM nodes. Three unforced-GC heap samples do not establish absence of memory leaks.

The fixture has no playing audio/embed, so its zero media count is not playback-stop evidence. Existing `audioCoordinator`, `mediaSession` and asset resolver tests cover one active source, cancellation, timer invalidation, in-flight deduplication and object URL revocation. Source review confirmed ProviderPlayer clears its slow-load timeout and disposes its active iframe session on unmount; gallery Lightbox removes its key listener; asset resolver disposal revokes cached URLs and ignores late results. New code adds no listeners, timers or object URLs. Existing music-source/public/preview E2E coverage belongs to the final gate receipt. Real provider playback, Safari media policies and physical-device tests remain unverified.

## Validation and reproduction

- Before: performance 27 tests + interaction 3 tests passed; original entry-payload regression failed as expected. [Logs](evidence/).
- After measured candidate: 4 production icon-loading regressions and 44 focused unit tests passed; performance/interaction 30 tests passed. [Logs](evidence/).
- The final Draft PR receipt identifies the exact final SHA and one applicable full gate (audits, lint/typecheck, all unit, build, artifact scan, general E2E and WebKit icon loading). It also lists inherited screenshot cases not applicable on macOS. No assertions, retries, skips or screenshot baselines were changed to gain a pass.

From repository root, with dependencies installed and an available serialized browser-test slot:

```sh
VITE_API_URL=http://127.0.0.1:5197 pnpm --filter @retrodesk/web build
QUALITY_LABEL=after pnpm exec playwright test --config tests/quality/playwright.config.ts tests/quality/performance.spec.ts tests/quality/interactions.spec.ts
pnpm exec playwright test --config tests/quality/playwright.config.ts tests/quality/icon-loading.spec.ts
```

For before reproduction, create a separate checkout of the pinned before SHA and copy only this branch's `tests/quality` and `scripts/quality-server.mjs` harness into it, leaving runtime and lockfile untouched; build with the same environment, then run the measurement command with `QUALITY_LABEL=baseline`. The before entry-payload regression must fail. The standalone quality config runs one worker with zero retries; it does not alter the normal E2E configuration. Generated fixture binaries/JSON remain in ignored `tests/tmp`.

This completes one measurement round and one evidence-backed fix. Remaining work: validate the final combination after other authors' changes, real devices/provider playback, deployment-specific caching/headers and realistic network/CPU profiles. No merge, deployment, issue closure or security-policy modification occurred. Automatic approval review rejected a #55 ownership-update comment because explicit commenting authority covered #75/#76; scope/progress was registered in #75, and the #55 step was not bypassed.
