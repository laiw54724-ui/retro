# Self-hosting Retro Desktop

Retro is a React/Vite web app, a Hono Cloudflare Worker, Supabase Auth/Postgres, and an R2 asset bucket. Self-hosting creates an independent deployment; it does not grant rights to redistribute bundled third-party assets or other users' content.

## Prerequisites

- Node.js 22 and pnpm 10.18.2 through Corepack
- a Supabase project with Google OAuth configured
- a Cloudflare account with Workers, Pages, and R2
- a domain or Pages/Workers development URLs

## Reproducible checkout

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install --frozen-lockfile
pnpm security:audit
pnpm assets:audit
pnpm typecheck
pnpm test:unit
pnpm build
```

No production secret is needed for these checks. The strict `pnpm assets:audit:release` gate intentionally fails while the Windows icon collections remain unresolved; see [third-party assets](THIRD_PARTY_ASSETS.md).

## Configure services

1. Copy `.env.example` into `apps/web/.env.local` and `apps/api/.dev.vars` with your own development values.
2. Apply every SQL file in `supabase/migrations` in filename order. Migrations are forward-only.
3. Create the R2 buckets named in `apps/api/wrangler.toml`, or update that configuration.
4. Put Worker secrets with `wrangler secret put`; never prefix a service-role key with `VITE_`.
5. Add each web `/auth` URL to the Supabase redirect allowlist and configure the Google provider callback shown by Supabase.
6. Follow [the deployment runbook](DEPLOYMENT.md) for staging and production.

## Hosted service versus self-hosted copies

The upstream hosted service controls its own accounts, moderation, storage, availability, and data policy. A self-hosted operator is independently responsible for access controls, content policy, backups, abuse response, privacy obligations, and takedown handling. There is no automatic federation or support entitlement.

User uploads, OC art, music, and other authored content are not part of the source distribution. Exported projects may contain external references that the operator or user is not allowed to redistribute.
