# Music M2 help and bounded M3 video

Partial delivery for #31/#30, following design PR #83. Branch `codex/music-m2-m3-31` starts at reviewed PR #84 SHA `a53821189f02f4ad8329d77a9049acefd91f13e1` (tree `e29ad14e38423c436f570ceba9909c9e3df4e6ea`). Draft PR targets `integration/retro-night-quality-01`; the remote base was reverified unchanged before publication. The final branch head is recorded in the PR and handoff.

## Behavior and support boundary

- M2: an explicit “Can’t play?” action displays conditional, generic help, retry and the persistent original-site action. An unanswered iframe gets delayed help after 8 seconds. An iframe `load` event is not presented as playback success; a loaded but blocked player retains manual help. Retry replaces the old frame, resets help/timeouts, and preserves single-frame ownership. No login, age, region or provider failure diagnosis is inferred.
- M3: new pasted direct HTTPS `.mp4`, `.m4v`, `.mov`, `.ogv`, `.webm` paths use visible native video with controls, `playsInline`, and `preload=none`. No `src`, poster, thumbnail or SDK is loaded before the explicit load/play click. Extensions are hints; actual MIME/container/codec/browser support decides playback. Wrong MIME/failure gets retry and the original link. WebM may contain only audio. Unsupported extensions and webpages remain external; no arbitrary webpage playback or URL fetching/proxying is promised.
- Existing `externalLink` data stays external, including after reload or re-entering the same URL. Explicit player/external conversion is available. Video reuses the unchanged `audioUrl` shape. Cached pre-M3 clients can still parse/edit/export the data and retain their previous audio-only behavior (audio track or a normal playback failure); they do not gain a visible video player. No API reader rollout, schema migration or persisted-data rewrite is required.
- The existing coordinator now owns either an audio element or the visible video element. Activation releases the previous native element and unmounts any provider iframe. Listeners are removed and stale play promises/timeouts are ignored. Native video pause/resume/volume controls update the same session. Unmount, close, minimize and viewport resize stop media. Cross-host desktop/phone replacement remains covered. Picture-in-picture and remote playback are disabled on the new video element to avoid a second out-of-page playback surface.

No SoundCloud, skins, provider SDK, CSP origin, shared CSS, shared schema, API, dependency/lockfile, deployment or permissions changes. Only the new `m2`/`m3` namespaces were appended to the four Music locale files; existing keys/values were compared with the base and remain identical. Provider host/path/id validation and CSP remain unchanged. Known platform pages with file-like paths stay external rather than becoming native media.

## Validation

macOS, Node 22.23.3, pnpm 10.18.2, Playwright 1.64.1 / Chromium. Checks are focused on this branch; the integrator owns the final combined gate.

| Check | Result | Evidence |
|---|---|---|
| Existing Music baseline | 30 unit tests passed before implementation | Recorded in task tool output |
| Music unit regression batch | 39 passed | [unit.log](unit.log) |
| Web lint / typecheck | Both passed (the repository's lint uses TypeScript) | [lint.log](lint.log), [typecheck.log](typecheck.log) |
| Existing + dedicated Music browser batch | 36 passed, no skips/retries | [e2e.log](e2e.log) |
| ja/ko preview + source recognition | 5 passed, no skips/retries | [i18n-preview.log](i18n-preview.log) |
| Scoped UI detector | No findings | [design-detector.json](design-detector.json) |
| Diff / boundaries | `git diff --check` clean; no shared schema, API, CSP, lockfile or shared CSS diff | Source manifest and Git diff |

The dedicated cases verify no pre-click media/provider request, 320/390/430 normal-click operation, video→audio→iframe exclusivity, remount on retry, original-site popup, close/minimize/resize/host replacement, old external preference, explicit conversion, saved JSON reload and undo. Compatibility unit fixtures exercise v1/v2 parsing, canonical/legacy merging, public projection and both public/owner-backup export/import. These schema implementations are unchanged from the base. Existing export secret scanning still rejects sensitive URL parameters; the compatibility fixture uses a non-sensitive query.

The generated original H.264/AAC fixture actually decodes in desktop Chromium; native-control clicks pause/resume it. The wrong-MIME case uses real browser failure and then a real successful retry. Broader coordination tests use controlled media ports or browser doubles. Provider tests use local intercepted HTML, not live provider playback. Screenshots below are layout evidence with those doubles, not proof of a real provider/phone decoder.

| Width | Video | Help |
|---|---|---|
| 320 | [video-320.png](video-320.png) | [help-320.png](help-320.png) |
| 390 | [video-390.png](video-390.png) | [help-390.png](help-390.png) |
| 430 | [video-430.png](video-430.png) | [help-430.png](help-430.png) |

An earlier parallel browser invocation shared the output directory with a preview run. Two teardown artifacts failed with `ENOENT` after their assertions; [the original log](e2e-output-collision.log) is retained. The final 36-case run used a dedicated output directory and passed. Earlier test development also corrected outdated M1 video copy expectations, duplicate status selection, exact existing labels and Chromium control coordinates; no assertions were removed to hide a runtime failure.

## Modified surfaces and review

- `apps/web/src/features/modules/music/`: ProviderPlayer help; new VideoPlayer and module-local CSS; TrackSourceField classification and explicit conversion; MusicView/inline editor integration; coordinator/session lifecycle; classifier and playback explanation. Dedicated coordinator/classifier/compatibility tests live here.
- `apps/web/src/i18n/locales/{en,zh-Hant,ja,ko}/music.json`: only new namespaced copy.
- `tests/e2e/music-sources.spec.ts`: update M1's video expectations to M3; existing coverage retained.
- `tests/e2e/music-m2-m3.spec.ts`, `tests/e2e/fixtures/music/`: dedicated tests and self-generated test media, with reproduction instructions.
- This evidence directory and [PLAN.md](PLAN.md). [source-sha256.txt](source-sha256.txt) records the tested source/test hashes.

## Remaining risks / unverified behavior

Live YouTube/Spotify accounts, cookies, login/region restrictions, staging CSP/headers, physical iOS Safari and Android, codec/container variants beyond the generated MP4, native fullscreen behavior and real third-party network/server restrictions remain unverified. User-supplied direct media still depends on its host remaining available. No new SDK exists to provide provider error codes or exact provider playback state. The iframe exclusion strategy remains the existing single-source contract. No full repository suite or deployment was run here. No issue/PR closure or main merge occurred. Other AI worktrees were preserved.

Official references checked on 2026-10-19: [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video), [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference), [Spotify IFrame API](https://developer.spotify.com/documentation/embeds/references/iframe-api). The browser reference confirms native controls/playsinline and that preload is only a hint; therefore this implementation withholds the src. Provider references do not justify guessing login or region restrictions from iframe events.
