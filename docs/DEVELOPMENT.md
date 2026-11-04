# Development and testing

Run commands from the repository root. Use Node.js 22 and the pnpm 10.18.2
version pinned in `package.json`; install with `pnpm install --frozen-lockfile`.

## Work without cloud credentials

`pnpm --filter @retrodesk/web dev` starts the web shell. Missing Supabase settings
produce a warning and disable working authentication; this is expected for an
unconfigured checkout. The unit and mocked Playwright suites do not require
production credentials, database migrations or a deployed Worker.

```bash
pnpm typecheck
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e tests/e2e/collaboration.spec.ts --workers=1
```

The API build is a Wrangler dry run. Browser tests start their own Vite server
and intercept the services needed by their fixtures; they do not prove live
Supabase/R2 behavior. See [beta acceptance](BETA_ACCEPTANCE.md) for live checks.

## Connect your own development services

Use a disposable Supabase project and your own Cloudflare configuration. Do not
use upstream staging or production resources for contributor tests.

1. Create `apps/web/.env.local` with only the three `VITE_*` variables from
   `.env.example`. Vite variables are public browser configuration.
2. Create `apps/api/.dev.vars` with the API section of `.env.example`.
   `apps/api/.dev.vars.example` lists the required Supabase keys. Keep the
   service-role key in the Worker environment only.
3. Apply `supabase/migrations/*.sql` in filename order to your disposable
   database. Do not reapply or edit migrations on a shared database.
4. Review `apps/api/wrangler.toml` and use your own resource identifiers. Follow
   [self-hosting](SELF_HOSTING.md) for R2 and auth callback configuration.
5. Run `pnpm dev`: web normally uses port 5173 and API port 8787. Keep
   `VITE_API_URL` and `ALLOWED_ORIGINS` aligned with the actual local URLs.

Ignored environment files and CLI link state stay local. Do not attach them,
real sessions, invite links or private site exports to a PR.

## Choose the smallest useful check

| Change | Focused check |
| --- | --- |
| API logic | `pnpm --filter @retrodesk/api test:unit test/access.test.ts` |
| Shared schema | `pnpm --filter @retrodesk/shared test:unit test/site.test.ts` |
| Web logic | `pnpm --filter @retrodesk/web test:unit` |
| Browser interaction | `pnpm test:e2e tests/e2e/collaboration.spec.ts --workers=1` (choose the relevant spec) |
| Types | `pnpm typecheck` |
| Bundled assets | `pnpm assets:audit` and `pnpm assets:audit:release` |
| Documentation | Check changed links, commands and `git diff --check` |

Before requesting merge, run `pnpm verify:contributor`. It includes security,
asset and dependency-license audits, typecheck, unit tests, build, artifact
scanning and the full Chromium suite. `pnpm lint` currently runs package
TypeScript checks. Ordinary PR CI runs audits, types, units and build; the
separate E2E workflow is manually triggered. A green ordinary CI run alone does
not establish browser acceptance.

The security audit scans the worktree (including nonignored untracked files),
build artifacts and reachable history. Use a clean checkout; do not place
private scratch material there. Findings print locations, not secret values.

## Parallel work and troubleshooting

- Use a separate branch/worktree for each task. Leave another contributor's
  uncommitted changes and active feature branches alone.
- Stop any unrelated server on the test port, or choose an unused port:
  `PLAYWRIGHT_PORT=5499 pnpm test:e2e tests/e2e/collaboration.spec.ts --workers=1`.
  Playwright can reuse an existing server outside CI; ensure it serves this
  checkout before trusting a result.
- If Chromium is missing, rerun `pnpm exec playwright install chromium` (Linux CI
  may need `--with-deps`). A missing browser is a setup failure, not a passing test.
- Record the tested commit, command, result and relevant limitations. Label
  skipped or unrun checks explicitly; keep failure evidence until resolved.
- Use synthetic data in screenshots and trim logs to useful diagnostics. Replace
  local absolute paths with `<worktree>` while retaining file names and line
  numbers. Never upload tokens, private emails or private service identifiers.
