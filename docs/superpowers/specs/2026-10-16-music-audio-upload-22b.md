# #22B Music audio upload design

## Goal

Add owner-scoped MP3, Ogg, and WAV uploads to Music Player without weakening the existing private-draft asset boundary. Draft audio remains private; publishing creates an immutable public copy. Both authenticated draft delivery and public delivery support media headers, `HEAD`, and single byte ranges.

## Options considered

1. **Authenticated Worker upload (selected).** Reuse the existing site access checks, validate a bounded multipart file in the Worker, persist to private R2, and record it in `site_assets`. This is the smallest secure extension of the deployed architecture.
2. **Presigned direct-to-R2 upload.** Better for large media, but requires a quarantine/finalize flow because size, MIME, ownership, and magic bytes cannot be trusted before the object is accepted. This is deferred until files exceed the first-release limits.
3. **External URLs only.** Already supported by #22A, but does not complete the requested private upload workflow.

## Upload contract

- New asset kind: `audio`.
- Accepted containers: MP3 (`audio/mpeg`), Ogg (`audio/ogg`), and WAV (`audio/wav` or browser alias `audio/x-wav`, normalized to `audio/wav`).
- Maximum file size: 16 MiB.
- Maximum audio storage per site: 100 MiB, calculated from the site's recorded `audio` assets before each insert.
- The API rejects a request with a declared multipart `Content-Length` above 18 MiB before parsing. This is defense in depth; the parsed `File.size` remains authoritative.
- File bytes must match the declared media type:
  - MP3: ID3 header or a valid MPEG audio frame sync.
  - Ogg: `OggS` capture pattern.
  - WAV: `RIFF` plus `WAVE` form type.
- R2 keys remain under `draft/users/{ownerId}/sites/{siteId}/{assetId}.{ext}` with `private, no-store` metadata.
- The DB row uses a stable `retro-asset:{uuid}` reference. No private R2 URL is stored in the document.
- Database migration expands the `site_assets.kind` check to `image | icon | audio`.

## Document and editor model

`MusicSource` gains `{ kind: "uploadedAudio", asset: AssetReference }`. The music editor exposes three explicit sources: uploaded audio, HTTPS direct audio, and external page. Uploading a file selects `uploadedAudio`; switching source stops preview first.

Uploaded audio requires a non-empty rights note before publish. This is a publishing safety check, not a claim of legal verification. The UI explains that only audio the author created or is authorized to use should be uploaded.

The existing module upload callback is widened to accept `audio`. Image modules remain unchanged.

## Delivery and playback

- The authenticated content endpoint authorizes the user/site before touching R2.
- `GET` accepts a single RFC byte range through the R2 `range` option and returns `206`, `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`, the stored `Content-Type`, and private cache headers.
- `HEAD` returns the same metadata without a body.
- Malformed or multiple ranges return `416` with `Content-Range: bytes */{size}`.
- The public asset endpoint provides equivalent `GET`/`HEAD` range behavior with immutable public caching.
- In the editor, a protected asset is resolved to a short-lived blob URL through the authenticated asset resolver. Published documents contain immutable public audio URLs, so visitor playback can use browser-native range requests directly.

## Publish, deletion, and quotas

The generic asset-reference collector already finds nested `retro-asset:` values. Publish copying is extended to allow audio extensions and preserves the stored content type. The public projection rewrites the stable reference to `/published/{username}/assets/{id}.{ext}`.

The delete endpoint must reject assets still referenced by the current draft or current published document. This closes the existing gap where deleting a referenced object could silently break content. Unreferenced audio and image assets remain deletable.

## Failure behavior

- Unsupported type, spoofed bytes, oversized file, quota exhaustion, and cross-owner access return distinct JSON error codes.
- A failed DB insert deletes the just-written private R2 object.
- Playback failures remain local to the music window and do not affect other apps.
- No server-side fetch or proxy of user-entered audio URLs is added, avoiding SSRF.

## Verification

- Unit: audio signatures, normalization, size/quota, owner scoping, private `GET`/`HEAD`/range, public `GET`/`HEAD`/range, publish copy, referenced-delete guard, schema parse/projection.
- Web: editor upload source selection, protected resolver URL, preview lifecycle, rights-note publish check.
- E2E: upload an original short fixture, save, reload, publish, and confirm public playback metadata/range behavior.
- Run full typecheck, unit suite, build, E2E, diff review, staging deploy, and live verification.

