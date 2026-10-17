# Music sources and platform embeds

Retro plays three kinds of music source. The author picks the kind per track.

| Source kind | Who plays it | What is stored |
| --- | --- | --- |
| `uploadedAudio` | Retro's native audio element | a private asset reference (rights note required to publish) |
| `audioUrl` | native audio element | an HTTPS link to an audio *file* (`.mp3`, `.ogg`, `.wav`…) |
| `externalLink` | the original site (opens in a new tab) | an HTTP(S) page link |
| `providerEmbed` | the platform's official player in an iframe | `provider`, `resourceType`, `resourceId`, normalised `canonicalUrl`, and the author's `originalUrl` |

A YouTube or Spotify **web page** is never an audio file. The editor detects these links, explains why
they cannot be played natively, and offers "external link" or the official player. Switching source type
keeps the pasted URL; nothing is replaced with `https://`.

## Platform players (Spotify, YouTube)

- `resolveEmbedUrl` (`packages/shared/src/embed-provider.ts`) accepts only parsed, exact hostnames and paths.
  It rejects look-alike hosts, credentials, ports and non-HTTPS, and it only ever outputs ids Retro assembles into
  the iframe URL itself. Stored text is never used as an iframe `src`; `embedUrlFor` rebuilds it from ids.
- Supported: Spotify track / album / playlist (`open.spotify.com`), YouTube video / playlist
  (`youtube.com`, `m.`, `music.`, `youtu.be`, rendered through `youtube-nocookie.com`).
  Short links (`spotify.link`) and other platforms are not embedded; they stay external links.
- Nothing loads until the visitor clicks "load player" (no iframe, script or cookie before that).
  The visitor can always open the original page.
- Retro does not download, extract or re-host platform audio and makes no promise that Spotify plays in full
  (that depends on the visitor's account, region and cookies; logged-out visitors usually get previews).
- Iframes use `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`,
  an explicit `allow`, `referrerpolicy="strict-origin-when-cross-origin"` (YouTube needs a referrer) and a title.
- A plain iframe cannot be paused from outside. Exclusivity is therefore enforced by **mounting at most one**
  (`mediaSession.ts`): starting an embed stops native audio; starting native audio or another embed unmounts the
  old iframe; minimising/closing the window unmounts it too. The session is keyed by component *instance* because the
  public page also mounts a CSS-hidden desktop tree with the same ids as the phone tree.
- We do not load the YouTube/Spotify iframe APIs, because that would require widening `script-src`.

## Content-Security-Policy (`apps/web/public/_headers`)

| Directive | Value | Why |
| --- | --- | --- |
| `frame-src` | `https://open.spotify.com https://www.youtube-nocookie.com` | exactly the embed origins; nothing else may be framed |
| `media-src` | `'self' blob: https:` | HTTPS and uploaded audio. Without it `default-src 'self'` blocked every `<audio>` source on Pages |
| `script-src` | `'self'` | unchanged |

`securityHeaders.test.ts` pins these values. Local Vite does not apply `_headers`, so verify CSP changes on a real
Pages deployment (see the staging check script described in the PR notes).

Retro's own `X-Frame-Options`/`frame-ancestors` are about who may frame *Retro*; they do not control whether a
third-party site allows being framed, and must not be relaxed to "fix" an embed.

## Effective settings and why (no `unsafe-eval`, no wildcard)

| Setting | Value | Reason |
| --- | --- | --- |
| `media-src` | `'self' blob: https:` | Native `<audio>` for uploaded (signed/proxied, same-origin or blob) and HTTPS audio-file sources. Platform pages are never put here. |
| `frame-src` | `https://open.spotify.com https://www.youtube-nocookie.com` | Exactly the two official embed origins. No `https:` wildcard, no other host can be framed. |
| `script-src` | `'self'` | Unchanged. The platform iframe APIs are not loaded, so no third-party script origin is needed. `'unsafe-eval'` is **not** allowed. |
| iframe `sandbox` | `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox` | `allow-scripts` + `allow-same-origin` are required for the players to run on their own origin (it is a different origin from Retro, so this does not give them access to Retro). `allow-popups(-to-escape-sandbox)` lets "open on Spotify/YouTube" links leave the sandbox. Deliberately **not** granted: `allow-top-navigation`, `allow-forms`, `allow-modals`, `allow-downloads`, `allow-pointer-lock`. |
| iframe `allow` | per provider (`encrypted-media`, `autoplay`, `fullscreen`, ...) | Minimum the provider needs for DRM playback; camera/microphone/geolocation are denied site-wide by `Permissions-Policy`. |
| `referrerpolicy` | `strict-origin-when-cross-origin` | YouTube refuses embeds without a referrer; no path/query leaks cross-origin. |

A harmless `script-src` report mentioning `eval` comes from the zod schema library compiling validators in the browser
(seen on staging). It is a report, not a block, and is intentionally **not** "fixed" by adding `unsafe-eval`.

### Failure and blocking behaviour (covered by `tests/e2e/music-sources.spec.ts`)

- Platform unreachable, aborted, or answering with `X-Frame-Options: DENY`: the explanation text and the
  "在 Spotify/YouTube 開啟 ↗" button stay visible and open the original URL; no frame or timer keeps running after
  "關閉播放器".
- Platform never answers: after 8 s a status line tells the visitor to use the original-site button.
- Switching source, starting native audio, minimizing or closing the window leaves **no** playing media element
  (attached or detached) and no iframe; the CSS-hidden second tree on the public page never mounts a second player.

### Still unverified (by design not claimed)

Real iOS/Android devices, logged-in Spotify full-length playback, and third-party cookie behaviour in each browser.
Staging checks used logged-out desktop Chromium only.

## Adding a provider

1. Extend `resolveEmbedUrl` with exact hosts/paths and spoofing tests (hosts with suffixes, `@` credentials, ports, encoded paths).
2. Extend `embedUrlFor` and the `providerEmbed` enum in `site.ts` and `site-versioning.ts` (strict schema), plus round-trip tests.
3. Add the origin to `frame-src` only, update `securityHeaders.test.ts`, and add an adapter entry (`sandbox`, `allow`, size) in `ProviderPlayer.tsx`.
4. Verify on staging with a real browser: headers, no CSP violations, iframe loads, and exactly one iframe on desktop and phone.
