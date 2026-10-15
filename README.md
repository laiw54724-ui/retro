# Retro Desktop

No-code retro desktop personal-site builder.

The first production slice is based on the approved prototype: users choose a URL/theme, create desktop windows, edit structured content, preview desktop/mobile, and publish a public site.

## Stack

- **Web:** React + Vite + TypeScript
- **API:** Hono + TypeScript on Cloudflare Workers
- **Auth / DB:** Supabase
- **Media:** Cloudflare R2
- **Hosting:** Cloudflare Pages (web) + Workers (API)

> Note: Next.js and Vite are alternative application build pipelines. For the MVP this repo uses React + Vite because the editor is a client-heavy app and Hono already owns the API layer. If server-rendered public profile pages become necessary for SEO, add a separate Next.js/OpenNext public renderer later and reuse `@retrodesk/shared`.

## Monorepo

```text
apps/web       React/Vite editor + public viewer
apps/api       Hono Worker API
packages/shared  schemas, defaults, validation shared by web/api
supabase       SQL migrations
docs           architecture and implementation notes
```

## Local setup

1. Install dependencies: `pnpm install`
2. Copy `.env.example` values into `apps/web/.env.local` and `apps/api/.dev.vars`.
3. Apply `supabase/migrations/0001_initial.sql` to your Supabase project.
4. Create an R2 bucket named `retrodesk-assets` or update `apps/api/wrangler.toml`.
5. Run `pnpm dev`.

## MVP routes

- `/` landing
- `/auth` sign in / sign up
- `/onboarding` choose username, site name and theme
- `/editor/:siteId` visual editor
- `/@:username` published visitor site

## Security defaults

- Content is stored as structured JSON; arbitrary HTML/script is not accepted.
- Supabase auth tokens are verified by the API.
- Site mutations are owner-scoped.
- Draft writes use optimistic version checks.
- R2 uploads are MIME/size checked and namespaced by user + site.
