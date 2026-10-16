# #22 Music Player v1 design

## Goal

Deliver a usable retro music window without weakening the existing image asset boundary. Authors can build an ordered playlist from legal HTTPS audio URLs or external platform links. Visitors explicitly start playback; playback state is never written into the site document.

## Data contract

Each music window stores:

- `tracks`: bounded track records with title, artist, optional cover, source, optional character reference, lyrics and rights note.
- `playlist`: a title plus ordered `trackIds`.
- `audioUrl` sources accept HTTPS only. Empty `https://` remains an editor placeholder but is inert in the visitor.
- `externalLink` sources accept HTTP(S) pages and render as “開啟原連結”; they never masquerade as playable audio.
- Playlist IDs must be unique and must reference a track in the same window. Deleting a track removes its playlist reference.

The v1 and v2 document boundaries accept the same music shape so existing editor projection remains lossless. Character references are same-site profile references; public projection already removes unpublished profiles, so the UI only resolves published directory entries.

## Playback architecture

Use one lazy browser `Audio` instance owned by a small external coordinator, not by a window component. It exposes a subscription snapshot to all views.

- `play(windowId, track)` is the only start path and is called from a user action.
- Starting a different window/track pauses and resets the current source first.
- A minimized window may unmount while the coordinator keeps playing.
- Closing a window calls `stopWindow(windowId)`; leaving the desktop/mobile visitor calls `stopAll()`.
- Rejected play promises, media errors and load timeout become visible error states and never claim “播放中”.
- Duration/seek controls appear only after finite seekable metadata exists. Volume is keyboard-operable and session-only.
- The taskbar subscribes to the same coordinator and marks the active music task as playing.

## Authoring UX

The inline editor stays direct and bounded:

1. Empty state explains the two supported source types and offers “新增曲目”.
2. Each track card edits title, artist, cover URL, source type/URL, optional OC, rights note and lyrics.
3. Cards move up/down and delete; playlist order is the visible card order.
4. The same card has an explicit preview button for playable HTTPS audio. Leaving the editor surface stops preview through the desktop lifecycle.
5. No audio upload control appears in this milestone.

## Visitor UX

The player shows current cover/title/artist, previous/play-pause/next, real progress when seekable, volume, ordered track list and lyrics disclosure. External-link tracks show a link action instead of a play affordance. Empty and broken states remain usable.

Mobile reuses the same module in a single-window sheet. Controls remain at least 42px and do not create horizontal overflow at 320px.

## Non-goals

- No YouTube/Spotify extraction, DRM bypass, third-party iframe or lyric scraping.
- No audio upload, proxying or server-side URL fetching in this milestone.
- No background autoplay or promise of mobile background playback.
- No cross-device playback persistence.

