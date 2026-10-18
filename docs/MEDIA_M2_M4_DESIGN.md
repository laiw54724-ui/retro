# Media follow-ups: M2 failure reasons, M3 video files, M4 SoundCloud (design only)

Status: **proposal, nothing implemented, no CSP or schema change**. Builds on M1 (`#77`: paste one link, Retro recognises it). Sources checked against the official docs on 2026-10-19 are marked **[verified]**; everything else is **[unverified – check before implementing]**.

## M2 — telling visitors *why* a platform player failed

### What the current iframe cannot tell us
Retro mounts a sandboxed `<iframe>` only after the visitor clicks. From outside, a cross-origin iframe gives us only "it loaded" (`onLoad`) or "it didn't answer in 8 s". We cannot distinguish: embedding disabled by the owner, private/removed content, login or age/region restriction, a blocked third-party cookie, a platform outage, or the "client identification" (Referer) problem. Today the visitor sees the slow-load notice plus a static platform note and the "open on <platform>" button.

### What the official APIs really provide
| Platform | Signals | Not provided |
|---|---|---|
| **YouTube IFrame API** **[verified]** (`https://www.youtube.com/iframe_api`, iframe needs `enablejsapi=1`, `origin` recommended) | `onReady`, `onStateChange` (-1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued), `onAutoplayBlocked`, **`onError`**: `2` invalid parameter · `5` HTML5 player error · `100` not found / removed / private · `101` and `150` embedding disabled by the owner · `153` missing Referer / client identification | No code for "login required", "age-restricted", "region-blocked" or "bot check" (age/region cases are commonly reported as 101/150 **[unverified]**) |
| **Spotify iFrame API** **[verified]** (`window.onSpotifyIframeApiReady` → `IFrameAPI.createController`) | `ready`, `playback_started`, `playback_update` (`isPaused`, `isBuffering`, `position`, `duration`) | **No error event, no "unavailable" event, no login state.** Failures are shown only inside the embed |

So a precise "needs login" / "unavailable" message is **not achievable for Spotify at all**, and only partly for YouTube. We must not promise it.

### What each option costs
* **A. Better generic copy, no SDK (recommended now).** When the player does not report `loaded` in time, or the visitor presses "can't play?", show one honest message that lists the likely causes (embedding disabled by the owner, private/removed, needs login/age/region, blocked cookies, network) and keeps the "open on <platform>" link prominent. Cost: copy in four languages + a test; **no CSP change, no new third-party code**.
* **B. YouTube IFrame API for 100/101/150/153 only.** Gives three accurate messages (removed/private · embedding disabled · configuration) and real `playing`/`paused` state. Needs: `script-src` widened from `'self'` to also allow `https://www.youtube.com` (and whatever the API loader fetches from — **[unverified]**, must be observed with CSP reporting on staging), `enablejsapi=1&origin=…` on the iframe, and confirmation that the API works with the `youtube-nocookie.com` host we embed from **[unverified]**. Loaded only after the click, once. Cost: ~100 lines + a test double (CI must not hit YouTube), a weaker CSP for one origin, a new failure mode (script blocked → falls back to A), and a privacy note.
* **C. Spotify SDK.** Adds a script origin and code for **no** new failure information. **Not recommended.**

### Recommendation
Ship **A** first (a small follow-up to M1, no security change). Collect real staging/device results for how often YouTube 101/150 actually occurs; only then decide on **B**, with the CSP change as its own reviewed step. Skip **C**. In every case: never claim a specific cause we did not receive, never claim the content "can't be played" before a failure signal or the timeout, and always keep the original-site link.

### Test plan (for A, and for B if approved)
Controllable adapters/fakes only (no live YouTube/Spotify in CI): loaded vs timeout vs error-code mapping; single-source rule and close/minimise still unmount the frame; nothing loads before the click; exact CSP header asserted; four-language copy; real-device smoke (desktop Chromium, iOS Safari, Android) recorded separately.

## M3 — direct video file playback (your requirement; not tonight)

**Goal:** paste a direct `https://…/clip.mp4` (or `.webm`/`.mov`/`.m4v`) and visitors play it in the page. M1 already *recognises* video files and stores them as external links.

### Smallest compatible plan: no data-format change (M3a)
Reuse the existing `audioUrl` source (a validated HTTPS URL; already accepted by every reader, the API's draft validation, public projection and export/import). The classifier maps a video-file URL to `audioUrl`, and the player picks `<video playsinline controls>` instead of `<audio>` **by file extension at render time**.
* **Old/cached clients** keep working: they treat it as an audio URL and a browser plays the audio track (or shows a normal failure) — no parse error, no blocked editor.
* **API:** no change, so no deploy ordering.
* **Rollback:** switch the classifier/player back; stored values remain valid HTTPS URLs.
* Limits: no poster/mime hint, `.webm` is ambiguous (audio or video) → decided by the browser from the loaded media.

### Only if M3a proves too limited (M3b: explicit variant)
Add `{ kind: "videoUrl", url, poster? }` to the track source union in `packages/shared`. Because the API validates drafts with the shared schema, **an old API would reject new documents and old web builds would fail to parse them**, so: (1) ship the reader (API + web) that *accepts* `videoUrl` but nothing writes it; (2) verify old/new round-trip, public projection, export/import; (3) only then enable the web writer; (4) rollback = stop the writer and **keep the reader** (never roll the reader back). Needs staging data backup first.

### Player requirements (both)
One `<video>` registered with the single-source coordinator (starting it stops audio/embeds and vice versa); close/minimise/rotation stop it; nothing preloads before the visitor presses play (`preload="none"`); minimum 200×112 visible size; `playsinline`; keyboard/accessible controls; a clear failure message (unsupported codec / CORS / blocked) with the original link; no autoplay; CSP `media-src https:` already allows it, `img-src` covers a poster. Tests: audio↔video switching, quick track changes, stale events, close/minimise, mobile layout, four languages; real-device smoke recorded separately.

## M4 — SoundCloud (after M3)
* Resolver: accept only `soundcloud.com` track / set URLs; short links (`on.soundcloud.com`) stay external with the existing "paste the full URL" message.
* Embed host `w.soundcloud.com` needs a `frame-src` entry. The Widget API (for play/pause/error events) would need `script-src` for its script **[unverified – read the Widget API docs first]**; without it SoundCloud behaves like Spotify (embed only, no events).
* **Schema:** `providerEmbed.provider` is a closed enum, so adding `"soundcloud"` has the same old-reader problem as M3b → same reader-first rollout and rollback rules.
* Provider flag per #31 (only enabled after real-platform checks).

## What stays true for all of them
Nothing loads from a third party before the visitor's explicit click; one active media source; close/minimise stop playback; exact CSP; the original-site link is always offered; no claim that every URL or song will play.
