# Retro Desktop — production architecture

## Why the web app uses React + Vite

The requested stack mentioned “Next.js + Vite”. Those are alternative application build pipelines rather than layers that normally run together. For this MVP, the editor and visitor renderer are implemented as **React + Vite**, while **Hono** owns the server/API layer on Cloudflare Workers.

This keeps the architecture small and avoids duplicating routing, server actions and deployment responsibilities. If public pages later need server-rendered metadata/SEO at scale, add a dedicated Next.js/OpenNext public renderer that consumes the same `@retrodesk/shared` site schema and module registry.

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

The prototype's strongest engineering idea is preserved: each window type is a module with one schema and one renderer shared by editor and visitor mode.

Initial module types:

- document
- gallery
- links
- about
- instagram

Future modules such as diary, guestbook, music player, character profile and visual novel should be added without changing the desktop canvas data model.

### Bundled icon collections

New icon choices are generated from the pinned upstream checkout into the
`/windows-icons/` namespace. Legacy documents may continue to reference the
read-only `/win98-icons/` compatibility namespace. The provenance JSON is
evidence of the importer inputs and outputs, not a license grant.

## Security boundaries

1. Supabase is used for identity, not trusted client-side authorization.
2. Every write API verifies the bearer token and scopes mutations to `owner_id`.
3. Public reads return only the published snapshot, never the draft.
4. User content is typed JSON. Arbitrary HTML/JavaScript is not accepted.
5. External links are limited to `http`, `https`, and `mailto` schemes.
6. R2 uploads are owner/site namespaced, type checked, and capped at 8 MB.
7. Draft saves use optimistic concurrency.
8. RLS remains enabled as defense in depth even though the Worker uses a service role for server-side operations.

## Responsive rules carried from the prototype

- Desktop editor: left tools + canvas + right inspector.
- Tablet: side panels become drawers.
- Mobile editor: icon grid + single active window + bottom tools; no free drag.
- Mobile visitor: one window at a time; no scaled-down desktop.

These rules are intentionally product behavior, not just CSS breakpoints.
