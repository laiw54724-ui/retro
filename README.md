# Retro Desktop

A retro desktop personal-site builder. Arrange windows, edit structured content,
preview desktop and mobile layouts, and publish a visitor site. Built-in apps
include documents, galleries, links, character profiles, music and guestbooks.

## Start contributing

Use Node.js 22 and pnpm 10.18.2:

```bash
git clone https://github.com/laiw54724-ui/retro.git
cd retro
corepack enable
corepack prepare pnpm@10.18.2 --activate
pnpm install --frozen-lockfile
pnpm --filter @retrodesk/web dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`).
The web shell can start without service credentials; signing in, saving and
publishing require your own development services. For a mocked browser test:

```bash
pnpm exec playwright install chromium
pnpm test:e2e -- tests/e2e/collaboration.spec.ts --workers=1
```

See [Contributing](CONTRIBUTING.md) for the fork/branch workflow, focused checks
and the complete pre-merge gate. [Development](docs/DEVELOPMENT.md) explains
service setup, test isolation and troubleshooting.

## Find your way around

| Location | Responsibility |
| --- | --- |
| `apps/web` | React/Vite editor and visitor UI; Pages edge worker |
| `apps/api` | Hono API on Cloudflare Workers; auth, access, storage and publishing |
| `packages/shared` | Site schemas, defaults and validation used by web and API |
| `supabase/migrations` | Forward-only database migrations |
| `tests` | Playwright browser suites and quality fixtures |
| `scripts` | Asset, license and security checks |
| `docs` | [Documentation index](docs/README.md), architecture and verification records |

[Architecture](docs/ARCHITECTURE.md) describes the data flow and security
boundaries. Supabase supplies Auth/Postgres; Cloudflare R2 stores media.

## Main routes

- `/`: landing page
- `/auth`: sign in or sign up
- `/onboarding`: create a desktop
- `/editor/:siteId`: edit a desktop
- `/@:username`: published visitor site

## Self-hosting and security

Use [Self-hosting](docs/SELF_HOSTING.md) to connect your own infrastructure and
[Deployment](docs/DEPLOYMENT.md) for the environment-specific runbook. Contributing
does not require access to the hosted service. Report vulnerabilities through
[SECURITY.md](SECURITY.md); never put credentials or private content in an issue.

## Assets and licensing

Retro Desktop's original source is available under the [MIT License](LICENSE).
The license does not cover user content or separately licensed/excluded assets;
see [third-party notices](THIRD_PARTY_NOTICES.md), the
[asset policy](docs/THIRD_PARTY_ASSETS.md) and
[dependency license inventory](docs/DEPENDENCY_LICENSES.md).

Windows icon binaries are absent from the repository and default build. The app
uses built-in SVG fallbacks. Self-hosters who have reviewed the upstream rights
status may opt in with `pnpm icons:install -- --acknowledge-third-party-rights`.
Run `pnpm icons:remove` before creating a redistributable build.
