# Protected draft assets and immutable publication

## Goal

Make every newly uploaded asset private while it is only part of an owner draft, preserve a stable document reference, copy referenced assets to immutable public keys during publication, and provide an explicit migration path for assets uploaded under the legacy public-key design.

## Non-negotiable behavior

- A caller who knows a private R2 object key still cannot fetch it anonymously.
- Draft documents store `retro-asset:<uuid>` references, never bearer tokens or expiring URLs.
- The editor can preview those references only through an authenticated owner endpoint and revokes object URLs when no longer needed.
- A public document contains only ordinary HTTPS asset URLs. Publication fails before the database commit when a referenced private asset is missing, foreign, or cannot be copied.
- Published asset keys are content-stable and immutable. A failed/conflicting publish may leave an unreferenced copy that is safe to garbage-collect later.
- Existing `users/...` objects are labelled `legacy_public`; the UI must not describe them as private until migration succeeds.
- Anonymous asset serving only permits the published namespace and the temporary legacy namespace. It explicitly rejects draft/private prefixes.

## Data model

Add migration `0004_protected_draft_assets.sql`:

- `site_assets.storage_scope`: `legacy_public | draft_private`, default existing rows to `legacy_public`.
- `site_assets.migration_status`: `not_required | pending | migrated | failed`.
- `site_assets.public_url` remains populated for backwards compatibility. New private rows store their stable `retro-asset:<id>` reference in this column.
- Add an owner-only `migrate_site_assets_private` transaction RPC. It locks the site, checks `expectedVersion`, updates the supplied asset rows from their exact old keys/URLs to exact new keys/references, replaces the draft document supplied by the API, and increments `draft_version` once.

## Shared contract

- Add strict helpers to create/parse `retro-asset:<uuid>` references.
- Permit the reference wherever an uploaded image can be stored, including wallpaper and image-valued icons; continue rejecting all other non-HTTP schemes.
- Add a pure recursive replacement/collection helper. It must not mutate its input and must only replace exact scalar string values.

## API implementation

### Upload and preview

- Write new objects beneath `draft/users/<owner>/sites/<site>/<asset>.<ext>` with private/no-store metadata.
- Insert a `draft_private` row and return its stable reference. Delete the newly written object when the database insert fails.
- Add authenticated `GET /sites/:siteId/assets/:assetId/content`, checking owner/site/row and an exact allowed private or legacy prefix before returning bytes with `Cache-Control: private, no-store`.
- Asset list responses include `storageScope`, `migrationStatus`, and whether migration is required.
- Anonymous `GET /assets/*` rejects `draft/` (and any namespace other than `published/` or legacy `users/`) before touching R2.

### Publish

- Project the draft first, collect its asset references, and load every referenced asset scoped to the publishing owner/site.
- Reject missing/foreign references with a useful 400 diagnostic.
- Copy each referenced object to `published/<username>/assets/<asset-id>.<ext>` before the atomic database RPC; preserve content type and set public immutable caching.
- Rewrite the projected document to canonical public URLs and validate it again before committing.
- Retry publish uses the already committed public document and therefore never needs owner draft objects.

### Legacy migration

- Inventory legacy rows in the normal list response and expose `POST /sites/:siteId/assets/migrate` with `expectedVersion`.
- Copy legacy objects to new private keys first, rewrite exact legacy URLs in a parsed draft to stable references, then call the transaction RPC.
- On database conflict/failure, retain legacy rows and objects as authoritative; copied draft objects are harmless orphans.
- After success, delete old legacy objects best-effort only after the database transaction. Report cleanup warnings truthfully.

## Web implementation

- Add an asset-source provider around the authenticated editor. It resolves `retro-asset:<id>` through the owner content endpoint, deduplicates in-flight/cache requests, and releases Blob URLs on unmount.
- Route `SafeImg`, avatar images, image icons, inspector thumbnails, and wallpaper CSS through the resolver. Public pages continue to use HTTPS directly without authentication.
- Upload callbacks keep returning a string, now the stable asset reference, so module editors remain simple.
- Show a concise legacy-public warning with count and a one-click migration action. Migration first saves pending changes, passes the resulting current version, then replaces the editor document/version from the API result.
- Icon-library cells use the same resolver and comparisons remain based on the stable reference.

## Tests

- Shared: reference parsing/validation, exact recursive collection/rewrite, immutability, rejection of lookalike schemes.
- API: anonymous known private key denied; owner preview allowed; other owner denied; upload uses private prefix and rolls back object on DB failure; list reports scope; publish copies/replaces all refs and refuses missing/foreign assets; legacy public read remains available temporarily; migration rewrites exact references and handles version conflicts.
- Web: resolver fetch/dedup/revoke behavior, private image rendering, wallpaper/icon resolution, migration warning/action state.
- Run typecheck, unit tests, E2E, production build, and `git diff --check`.

## Deployment and verification

1. Dry-run and apply Supabase migration.
2. Deploy Worker with staging vars preserved.
3. Build and deploy Pages.
4. Verify API health/public site, unauthenticated draft content denial using a known staging private key, authenticated upload/preview where a safe test account exists, published public asset success, legacy inventory label, and canonical/immutable Pages bundles.
5. Record evidence on Issue #18 and in the verification log.
