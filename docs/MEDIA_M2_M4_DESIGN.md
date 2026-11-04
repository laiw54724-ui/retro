# Media follow-ups: M2 failure reasons, M3 video files, M4 SoundCloud

Status at merged [#89](https://github.com/laiw54724-ui/retro/pull/89) head `7070296b231a021f5e8cad77013abadbab305956` (same tree as `main` `539ca50fb80fa9b5b8a43e25857910a5d97f5698`): **M2 generic help and bounded M3 direct HTTPS video are implemented by [#87](https://github.com/laiw54724-ui/retro/pull/87); M4 SoundCloud and a YouTube SDK remain proposals.** This document came from [PR #83](https://github.com/laiw54724-ui/retro/pull/83) `3c39b388968dfe0e9431ea2b8a0c27186d534d3d`, before that implementation. It builds on M1 (`#77`). See the [current dependency and decision checklist](SCENE_MEDIA_RECONCILIATION.md), aligned to [#55's latest execution table](https://github.com/laiw54724-ui/retro/issues/55). No CSP or shared schema change is included here. Original official API statements checked on 2026-10-19 are marked **[verified]**; other provider claims remain **[unverified – check before implementing]**.

## M2 — telling visitors *why* a platform player failed

### What the current iframe cannot tell us
Retro mounts a sandboxed `<iframe>` only after the visitor clicks. From outside, a cross-origin iframe gives us only "it loaded" (`onLoad`) or "it didn't answer in 8 s". We cannot distinguish: embedding disabled by the owner, private/removed content, login or age/region restriction, a blocked third-party cookie, a platform outage, or the "client identification" (Referer) problem. The original design observed a slow-load notice and static platform note. [#87's M2 implementation](music-m2-m3/README.md) now adds explicit and delayed generic help, retry, and the original-site action; it does not diagnose a provider-specific cause.

### What the official APIs really provide
| Platform | Signals | Not provided |
|---|---|---|
| **YouTube IFrame API** **[verified]** (`https://www.youtube.com/iframe_api`, iframe needs `enablejsapi=1`, `origin` recommended) | `onReady`, `onStateChange` (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued), `onAutoplayBlocked`, **`onError`**: `2` invalid parameter · `5` HTML5 player error · `100` not found / removed / private · `101` and `150` embedding disabled by the owner · `153` missing Referer / client identification | No code for "login required", "age-restricted", "region-blocked" or "bot check" (age/region cases are commonly reported as 101/150 **[unverified]**) |
| **Spotify iFrame API** **[verified]** (`window.onSpotifyIframeApiReady` → `IFrameAPI.createController`) | `ready`, `playback_started`, `playback_update` (`isPaused`, `isBuffering`, `position`, `duration`) | **No error event, no "unavailable" event, no login state.** Failures are shown only inside the embed |

So a precise "needs login" / "unavailable" message is **not achievable for Spotify at all**, and only partly for YouTube. We must not promise it.

### What each option costs
* **A. Better generic copy, no SDK (implemented in #87).** Explicit or delayed help shows generic possible causes and keeps the original-site link prominent. It does not infer a specific cause from `onLoad` and needs no CSP change or new third-party code. See [M2 implementation notes](music-m2-m3/README.md).
* **B. YouTube IFrame API for 100/101/150/153 only.** Gives three accurate messages (removed/private · embedding disabled · configuration) and real `playing`/`paused` state. Needs: `script-src` widened from `'self'` to also allow `https://www.youtube.com` (and whatever the API loader fetches from — **[unverified]**, must be observed with CSP reporting on staging), `enablejsapi=1&origin=…` on the iframe, and confirmation that the API works with the `youtube-nocookie.com` host we embed from **[unverified]**. Loaded only after the click, once. Cost: ~100 lines + a test double (CI must not hit YouTube), a weaker CSP for one origin, a new failure mode (script blocked → falls back to A), and a privacy note.
* **C. Spotify SDK.** Adds a script origin and code for **no** new failure information. **Not recommended.**

### Recommendation
**A is implemented in #87/#89.** Collect real staging/device results before deciding on **B**; a YouTube API and CSP change remain unapproved. **C** remains not recommended. Never claim a specific cause we did not receive; keep the original-site link.

### Remaining validation and optional B test plan
M2's implemented generic help has focused local coverage in [#87's evidence](music-m2-m3/README.md). Real YouTube/Spotify and native-device checks remain pending. If B is approved, use controllable adapters/fakes in CI for error-code mapping, single-source and close/minimise behavior, click-gated loading, exact CSP, and four-language copy; record real-device smoke separately.

## M3 — direct video file playback (bounded M3a implemented in #87/#89)

**Delivered scope:** newly pasted direct HTTPS `.mp4`, `.m4v`, `.mov`, `.ogv`, and `.webm` URLs can use a visible native video player after an explicit click. Existing saved `externalLink` entries remain external; the player uses the unchanged `audioUrl` shape. Extensions are hints, and actual container/codec/browser support decides playback. See [M3 implementation notes](music-m2-m3/README.md). Real native-device and provider validation remain pending.

### Smallest compatible plan: no data-format change (M3a)
Reuse the existing `audioUrl` source (a validated HTTPS URL; already accepted by every reader, the API's draft validation, public projection and export/import). The classifier maps a video-file URL to `audioUrl`, and the player picks `<video playsinline controls>` instead of `<audio>` **by file extension at render time**.
* **Old/cached clients** keep working: they treat it as an audio URL and a browser plays the audio track (or shows a normal failure) — no parse error, no blocked editor.
* **API:** no change, so no deploy ordering.
* **Rollback proposal:** stop new writer behavior while retaining a reader for values already stored; stored values remain valid HTTPS URLs. A release rollback still needs validation against real saved data and devices.
* Limits: no poster/mime hint, `.webm` is ambiguous (audio or video) → decided by the browser from the loaded media.

### Only if M3a proves too limited (M3b: explicit variant, unapproved)
Add `{ kind: "videoUrl", url, poster? }` to the track source union in `packages/shared`. Because the API validates drafts with the shared schema, **an old API would reject new documents and old web builds would fail to parse them**, so: (1) ship the reader (API + web) that *accepts* `videoUrl` but nothing writes it; (2) verify old/new round-trip, public projection, export/import; (3) only then enable the web writer; (4) rollback = stop the writer and **keep the reader** (never roll the reader back). Needs staging data backup first.

### Player requirements (both)
One `<video>` registered with the single-source coordinator (starting it stops audio/embeds and vice versa); close/minimise/rotation stop it; nothing preloads before the visitor presses play (`preload="none"`); minimum 200×112 visible size; `playsinline`; keyboard/accessible controls; a clear failure message (unsupported codec / CORS / blocked) with the original link; no autoplay; CSP `media-src https:` already allows it, `img-src` covers a poster. Tests: audio↔video switching, quick track changes, stale events, close/minimise, mobile layout, four languages; real-device smoke recorded separately.

## M4 — SoundCloud (pending, after M3 validation)
* Resolver: accept only `soundcloud.com` track / set URLs; short links (`on.soundcloud.com`) stay external with the existing "paste the full URL" message.
* Embed host `w.soundcloud.com` needs a `frame-src` entry. The Widget API (for play/pause/error events) would need `script-src` for its script **[unverified – read the Widget API docs first]**; without it SoundCloud behaves like Spotify (embed only, no events).
* **Schema:** `providerEmbed.provider` is a closed enum, so adding `"soundcloud"` has the same old-reader problem as M3b → same reader-first rollout and rollback rules.
* Provider flag per #31 (only enabled after real-platform checks).

## What stays true for all of them
Nothing loads from a third party before the visitor's explicit click; one active media source; close/minimise stop playback; exact CSP; the original-site link is always offered; no claim that every URL or song will play.
