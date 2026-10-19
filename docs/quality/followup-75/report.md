# Performance follow-up #75: defer the private editor route

The public and built-in sample routes fetched private editor code in the common entry. `App.tsx` now imports the collaborative editor route only after authentication admits that route. Existing translated loading and retry messages cover pending and failed module requests. No saved document, public projection, API contract, or module behavior changes.

## Revisions and ownership

- Base and before runtime: `fa79436a3b8d7d1433e30b5abe4147c0868c4864` (`main` when this branch was created).
- Final measured runtime: `4f6ec161f68a90e2e63eec86185db58bb68dfa50` on `codex/performance-followup-75`. Later evidence-only commits retain this runtime.
- Sole runtime edit: `apps/web/src/app/App.tsx`. Supporting files: `tests/quality/followup-75.spec.ts`, `tests/quality/editor-route-75.spec.ts`, and this directory.
- No dependency, settings, CSP, schema, registry, editor/store/Inspector/window host, Music, Paint, locale, or CSS source edits. The small CSS chunk is emitted automatically by Vite for the existing editor import graph. Other worktrees are preserved.
- The earlier optional Windows manifest fix is already an ancestor of main. Both optional icon chunk hashes and sizes are unchanged; this work does not repeat it.

## Exact artifact result

| Asset | Before bytes | Final bytes | Change |
|---|---:|---:|---:|
| Initial JS | 1,595,127 | 1,522,481 | -72,646 (-4.55%) |
| Initial JS gzip | 474,665 | 455,069 | -19,596 (-4.13%) |
| Initial JS Brotli | 370,678 | 356,744 | -13,934 (-3.76%) |
| Deferred editor JS | included | 73,809 | authenticated editor only |
| Common CSS | 147,132 | 147,066 | -66 |
| Deferred editor CSS | included | 67 | authenticated editor only |

The before source map contains `EditorPage`, `RightPanel`, `TransferDialog`, and `CollaborativeSitePage`; the final entry map contains none of those sources. Original-source byte sizes in raw JSON are source inventories, not minified bundle contributions. Both icon catalogs remain separate and are absent from every measured initial resource list.

Public/sample cold runs transfer 72,712 fewer resource bytes (JS plus common CSS) with the same number of resource entries. Editor cold runs add two resource entries for the deferred JS/CSS and 1,764 total transfer bytes. Warm JS transfer is zero in both builds. Compression values above are computed locally; the loopback fixture serves uncompressed responses, so they are not production-host transfer measurements.

## Identical bounded fixture

- Production Vite build; Node `v22.23.2`, pnpm 10.18.2, Chromium `156.0.8078.4`, `darwin 24.6.0`, Apple M1 Pro (8 cores). Same locked dependencies and `VITE_API_URL=http://127.0.0.1:5197` for both builds.
- Six cells: heavy editor, heavy public, actual built-in IG sample, each at 390×800 and 1280×800. Three fresh-context cold/same-context warm pairs per cell: 36 navigations per revision. Six editor preview open/explicit-close cycles per revision.
- Heavy document: 10 windows, 8 profile entities, 30 gallery images, 13,512 JSON bytes. Each local PNG is 1024×768, 574,701 encoded bytes, with unique URL per image. Desktop decoded dimensions are asserted. Phone home screens do not mount the gallery thumbnails; this is not a phone gallery-opening measurement.
- Heavy fixture SHA-256: `469b0ceb8500967c3c64dc06062bdffb1937b9ce78ef6e288d03861f690105ff`. PNG SHA-256: `e984a386a2efe7f8cdf2380d640f478b4413491657e793e8915f583d0175aa1a`. Both match before/after.
- Server binds loopback only, rejects writes and never proxies production. HTTPS blocked via CDP; no request routing in measurements, preserving HTTP cache behavior. No CPU/network throttling; observe 800 ms after readiness.
- Warm means same-context navigation. Hashed JS/CSS/images use max-age=3600. The fixture font is no-cache without validators, so warm transfers include its approximately 400 KB body; this does not establish a production font-cache defect.

## Observed timings

Readiness is a Playwright visibility/polling proxy, including navigation and two animation frames for sample opening. LCP is observed within the bounded window; sample LCP belongs to the landing document. These are lab observations, not field CWV/INP, physical mobile-device results, or exact React commit measurements. Three samples do not establish a speedup. Ranges retain run-to-run variation.

| Route | Width | Cache | Ready before ms (range) | Ready final ms (range) | LCP before/final ms | Transfer before/final bytes |
|---|---:|---|---:|---:|---:|---:|
| editor | 390 | cold | 160 (138–161) | 174 (151–187) | 144/172 | 2,174,641/2,176,405 |
| editor | 390 | warm | 72 (69–73) | 72 (71–89) | 64/68 | 431,782/431,782 |
| editor | 1280 | cold | 221 (209–230) | 217 (198–239) | 208/220 | 19,424,671/19,426,435 |
| editor | 1280 | warm | 135 (130–136) | 151 (149–169) | 132/148 | 431,782/431,782 |
| public | 390 | cold | 118 (116–119) | 123 (118–126) | 120/124 | 2,174,328/2,101,616 |
| public | 390 | warm | 59 (49–65) | 73 (72–74) | 52/60 | 431,469/431,469 |
| public | 1280 | cold | 149 (132–151) | 153 (151–156) | 152/176 | 19,424,358/19,351,646 |
| public | 1280 | warm | 76 (74–78) | 88 (75–89) | 72/80 | 431,469/431,469 |
| sample | 390 | cold | 191 (173–207) | 207 (190–224) | 92/96 | 2,143,387/2,070,675 |
| sample | 390 | warm | 109 (108–117) | 110 (109–112) | 48/52 | 400,528/400,528 |
| sample | 1280 | cold | 206 (205–260) | 226 (207–227) | 96/96 | 2,143,387/2,070,675 |
| sample | 1280 | warm | 125 (113–128) | 132 (128–244) | 56/64 | 400,528/400,528 |

The established benefit is the exact public/sample payload reduction. Editor cold readiness on 390px rises from 160 to 174 ms; desktop moves from 221 to 217 ms. The extra editor fetch boundary is a real tradeoff. Timing changes elsewhere are mixed, so no general latency improvement is claimed.

An initial Suspense candidate (`c81b57c0dc7c8625aad8d5cca545722dbb78c84f`) produced 390px/desktop editor cold readiness medians of 898/886 ms and was rejected. `raw/rejected-suspense*.json` preserves that complete run. The final loader resolves the module in an effect with an unmount guard before rendering it, avoiding that candidate’s reveal delay. The final identical run is `raw/after.json`; it is not mixed with the rejected data.

## Interactions, CPU, and remaining work

| Width | Preview open before/final ms | Explicit close before/final ms | Open script before/final ms |
|---|---:|---:|---:|
| 390 | 94.8/103.9 | 66.8/66.7 | 14.0/13.0 |
| 1280 | 147.0/139.4 | 83.3/83.2 | 27.9/30.3 |

All six final cycles return to the same DOM count within that cycle, with no audio/video/iframe remaining. The final DOM count is two higher than the baseline, consistent with deferred-import links; there is no within-cycle growth. Heap-size counters are retained without forced GC; these observations do not prove the absence of retained listeners, timers, object URLs, or leaks. Music/media lifecycle and image-preview opening are not exercised by this slice.

One separate 1 ms CDP CPU sample per revision is stored in `raw/*-cpu.json`, outside the timing matrix. It does not reproduce a second independent bottleneck strongly enough to justify another runtime change. Source attribution uses existing transitive source-map-js only in the harness; no dependency was added. See the [CDP Profiler API](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) for sampling semantics. This is neither an allocation profile nor a React Profiler trace.

The heavy desktop gallery remains a clear fixture payload cost: 30 × 574,701 bytes = 17,241,030 image-body bytes, rendered around 76 px in the editor and 115 px in public. A follow-up should evaluate gallery thumbnail variants in `features/modules/gallery/index.tsx` through `features/modules/ui.tsx` and `lib/assetSource.tsx`, retaining the original for full view/export. That needs an asset-pipeline contract and coordination with the image/schema owner; no thumbnail persistence, migrations, or source replacement is introduced here. General registry view/editor splitting also crosses batch A ownership and is left for that owner. Music files, CSS/locales, and queue callsites remain untouched for batch D.

## Validation and reproduction

- Before production build and 7/7 bounded measurement cases passed (36 observations, 6 cycles, 1 separate CPU diagnostic).
- Final production build, including web TypeScript build, passed. Final browser run: 9/9 cases passed (same 7 plus auth-return/no-chunk and failed-chunk/reload-retry checks). Request assertions confirm the editor chunk is absent on public/sample and present for authenticated editor.
- `git diff --check` passed. No full aggregate gate, merge, deploy, real-user probing, or remote data mutation was performed. The integrator owns the single aggregate gate.

```sh
VITE_API_URL=http://127.0.0.1:5197 pnpm --filter @retrodesk/web build
FOLLOWUP_LABEL=after pnpm exec playwright test --config tests/quality/playwright.config.ts tests/quality/followup-75.spec.ts tests/quality/editor-route-75.spec.ts --output=test-results/performance-followup-75
```

Run from the repository root with locked dependencies and the existing Playwright browser installed. Each label overwrites that label’s raw files. For the before runtime, use the same measurement harness on the base revision and omit the post-change route regression spec. The harness addition for the final run only asserts the new chunk’s request boundary; measurement logic and fixtures are unchanged.

Raw JSON retains every repetition, resource timing/body/transfer entry, FCP, observed LCP/CLS, long tasks, image dimensions, DOM/media counts, CDP counters, fixture hashes, exact asset hashes, and source inventory. Build and test logs are in `evidence/`.
