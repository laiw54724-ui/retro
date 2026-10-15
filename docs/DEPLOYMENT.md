# Retro Desktop deployment runbook

This repository is prepared for two Cloudflare environments:

- **staging** — `retrodesk-api-staging`, `retrodesk-assets-staging`, Pages project `retrodesk-staging`
- **production** — `retrodesk-api`, `retrodesk-assets`, Pages project `retrodesk`

The repository can deploy once the external Supabase and Cloudflare resources exist. Secrets must stay outside git.

## 1. Create Supabase projects

Use separate Supabase projects for staging and production when possible.

For each project:

1. Create the project.
2. Apply every SQL file in `supabase/migrations` in filename order.
3. Copy:
   - Project URL
   - anon key
   - service-role key
4. Configure Auth:
   - enable the Google provider and configure its OAuth client ID/secret
   - add the Pages/custom-domain `/auth` callback URLs to the Supabase redirect allowlist
   - keep Email/Password disabled while the product remains Google-only

The Worker uses the service-role key server-side. Never expose that key to Vite or Cloudflare Pages.

## 2. Create R2 buckets

From an authenticated Wrangler session:

```bash
pnpm --filter @retrodesk/api exec wrangler r2 bucket create retrodesk-assets-dev
pnpm --filter @retrodesk/api exec wrangler r2 bucket create retrodesk-assets-staging
pnpm --filter @retrodesk/api exec wrangler r2 bucket create retrodesk-assets
```

The bucket names already match `apps/api/wrangler.toml`.

## 3. Create Pages projects

```bash
pnpm --filter @retrodesk/web exec wrangler pages project create retrodesk-staging --production-branch main --force
pnpm --filter @retrodesk/web exec wrangler pages project create retrodesk --production-branch main --force
```

The Vite build output is `apps/web/dist`.

## 4. Bootstrap Worker secrets

Deploy the Worker once, then set these secrets for each environment.

Staging:

```bash
cd apps/api
pnpm exec wrangler deploy --env staging \
  --var "ALLOWED_ORIGINS:https://retrodesk-staging.pages.dev" \
  --var "PUBLIC_ASSET_BASE_URL:https://YOUR-STAGING-API/api/assets"

pnpm exec wrangler secret put SUPABASE_URL --env staging
pnpm exec wrangler secret put SUPABASE_ANON_KEY --env staging
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

Production:

```bash
cd apps/api
pnpm exec wrangler deploy --env production \
  --var "ALLOWED_ORIGINS:https://YOUR-WEB-ORIGIN" \
  --var "PUBLIC_ASSET_BASE_URL:https://YOUR-API-ORIGIN/api/assets"

pnpm exec wrangler secret put SUPABASE_URL --env production
pnpm exec wrangler secret put SUPABASE_ANON_KEY --env production
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production
```

Replace the example origins before first real deployment.

## 5. Configure GitHub environments

Create GitHub Environments named exactly:

- `staging`
- `production`

For each environment, configure these **variables**:

| Variable | Example |
| --- | --- |
| `WEB_ORIGIN` | `https://retrodesk-staging.pages.dev` |
| `API_URL` | `https://api-staging.example.com` |
| `ASSET_BASE_URL` | `https://api-staging.example.com/api/assets` |
| `SUPABASE_URL` | `https://project.supabase.co` |
| `DEPLOY_ENABLED` | `true` only after the environment is fully provisioned |

And these **secrets**:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Pages + Workers deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |
| `SUPABASE_ANON_KEY` | injected into the Vite client build |

The Supabase **service-role key is not required by GitHub Actions** after it has been stored as a Worker secret.

For the `production` GitHub Environment, enable required reviewers if available. The production workflow is also manual and requires typing `deploy`.

## 6. Deploy staging

Merging changes to `main` that affect app/package/deployment files triggers `Deploy staging` only when the staging GitHub Environment variable `DEPLOY_ENABLED=true`. Before provisioning is complete, the workflow is safely skipped. It can also be run manually.

It:

1. installs dependencies
2. typechecks
3. builds all workspaces
4. deploys the staging Worker
5. builds Vite with staging API/Supabase values
6. deploys Cloudflare Pages
7. requests `/api/health`

Database migrations are intentionally **not** applied automatically. Apply/review migrations before a deployment that depends on them.

## 7. Deploy production

Open GitHub Actions → **Deploy production** → Run workflow → enter:

```text
deploy
```

Production does not deploy on ordinary pushes.

## 8. Custom domains

The product UI currently presents URLs in the `retrodesk.me/<username>` style. Do not point the real domain until it is owned and configured.

Recommended layout:

- Web: `https://retrodesk.me`
- API/assets: `https://api.retrodesk.me`

Then configure:

- Pages custom domain → `retrodesk.me`
- Worker custom domain/route → `api.retrodesk.me`
- `WEB_ORIGIN=https://retrodesk.me`
- `API_URL=https://api.retrodesk.me`
- `ASSET_BASE_URL=https://api.retrodesk.me/api/assets`
- Supabase Auth redirect allowlist for the web origin

## 9. Staging acceptance checklist

Before production:

- [ ] sign in with a real Google account and confirm the `/auth` callback returns to the app
- [ ] create username and starter desktop
- [ ] edit all five MVP window types
- [ ] upload an image and reload; R2 URL still works
- [ ] autosave and reload restores the exact draft
- [ ] publish, then visit `/@username` without authentication
- [ ] desktop window controls work
- [ ] mobile add/edit/theme/preview works at 320/390/430px
- [ ] another user's site ID cannot be read or mutated
- [ ] `/api/health` returns HTTP 200

## What still requires external access

Repository code cannot create or verify your actual Supabase/Cloudflare account resources without connected credentials. The first real staging deployment therefore remains blocked until those resources/secrets are configured.
