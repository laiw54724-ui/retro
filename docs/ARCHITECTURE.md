# Retro Desktop — production architecture

## Why the web app uses React + Vite

The editor and visitor UI use React + Vite; Hono owns the API on Cloudflare
Workers. Keeping API routing and authorization in the Worker avoids duplicating
server responsibilities in the web app. The Pages edge worker provides public
metadata handling alongside the client-rendered site.

For setup and test commands, see [Development](DEVELOPMENT.md).

## Runtime topology

```text
Cloudflare Pages
  apps/web
      |
      | HTTPS + Supabase access token
      v
Cloudflare Worker
  apps/api (Hono)
      |------------------> Supabase Auth
      |------------------> Supabase Postgres
      |------------------> Cloudflare R2

Public visitor
  /@username -> web -> GET /api/public/sites/:username
```

## Source entry points

| Concern | Start here |
| --- | --- |
| Web routes and page composition | `apps/web/src/app/App.tsx`, `apps/web/src/pages/` |
| Editor state, canvas and inspector | `apps/web/src/features/editor/` |
| Built-in app registration | `apps/web/src/features/modules/registry.ts` |
| Module rendering and editing | `apps/web/src/features/modules/<module>/` |
| API routes and access checks | `apps/api/src/routes/`, `apps/api/src/lib/access.ts` |
| Publication and public projection | `apps/api/src/lib/publish.ts`, `packages/shared/src/public-projection.ts` |
| Shared document validation | `packages/shared/src/site.ts` |
| Database contracts | `supabase/migrations/`, `apps/api/test/*migration.test.ts` |

Keep changes within the relevant boundary. Changes to shared document contracts
need both editor and API compatibility checks; module UI changes should not move
runtime code between packages solely for cleanup.

## Data model

The editor works on one `SiteDocument` JSON tree:

- site name
- theme tokens
- ordered window modules
- desktop geometry and mobile order
- typed module content

A draft has a monotonic `draft_version`. Saves require `expectedVersion`; a stale browser receives `409 version_conflict` instead of silently overwriting newer edits.

Publishing copies the validated draft into `published_document`, increments `published_version`, stores an immutable row in `site_versions`, and writes a CDN-friendly JSON snapshot to R2.

## Window module registry

Each window type has a schema and shared rendering contract for editor and visitor mode.

Built-in module types:

- document
- gallery
- links
- about
- instagram
- music
- moodboard
- explorer
- minesweeper
- character dialog
- moderated guestbook

Future modules such as diary, character profile and visual novel should be added through the registry without changing unrelated window-manager logic. The registry accepts reviewed built-in modules and data templates, not arbitrary executable plugins.

## Ownership and collaboration

An account may own multiple independent desktops and may be an editor or viewer on other desktops. `sites.owner_id` remains the sole ownership source of truth; `site_memberships` stores non-owner roles. The Worker resolves access on every request even though its service-role database client bypasses RLS. Invite tokens are returned once while only a digest is stored.

### Bundled icon collections

New icon choices are generated from the pinned upstream checkout into the
`/windows-icons/` namespace. Legacy documents may continue to reference the
read-only `/win98-icons/` compatibility namespace. The provenance JSON is
evidence of the importer inputs and outputs, not a license grant.

## Security boundaries

1. Supabase is used for identity, not trusted client-side authorization.
2. Site-management write APIs verify the bearer token and resolve site ownership or membership; owner-only operations such as publishing enforce the owner role. Public guestbook submissions have separate validation and moderation rules.
3. Public reads return only the published snapshot, never the draft.
4. User content is typed JSON. Arbitrary HTML/JavaScript is not accepted.
5. External links are limited to `http`, `https`, and `mailto` schemes.
6. R2 uploads are user/site namespaced, type checked, and subject to media-specific size limits in `apps/api/src/lib/upload.ts`.
7. Draft saves use optimistic concurrency.
8. RLS remains enabled as defense in depth even though the Worker uses a service role for server-side operations.

## Responsive rules carried from the prototype

- Desktop editor: left tools + canvas + right inspector.
- Tablet: side panels become drawers.
- Mobile editor: icon grid + single active window + bottom tools; no free drag.
- Mobile visitor: one window at a time; no scaled-down desktop.

These rules are intentionally product behavior, not just CSS breakpoints.
