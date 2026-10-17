# Contributing to Retro Desktop

Thanks for helping build Retro. This repository accepts reviewed built-in apps, schemas, themes, and data templates. It does not load arbitrary third-party JavaScript as a plugin.

## Start locally

1. Install Node.js 22 and enable Corepack.
2. Run `corepack prepare pnpm@10.18.2 --activate`.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm exec playwright install chromium` once for browser tests.
5. Copy `.env.example` values into `apps/web/.env.local` and `apps/api/.dev.vars`; use local or disposable development credentials only.
6. Apply every file in `supabase/migrations` in filename order to a development Supabase project.
7. Run `pnpm dev`.

The app must build and test without production credentials. See [self-hosting](docs/SELF_HOSTING.md) and [architecture](docs/ARCHITECTURE.md).

## Before opening a pull request

During development, run the focused typecheck or test that covers your change. Before requesting merge, run the single complete gate:

```bash
pnpm verify:contributor
```

That gate scans tracked files and reachable Git history for common secret formats, audits bundled assets and the frozen dependency-license inventory, then runs typecheck, unit tests, build, and E2E. Migration contract tests live under `apps/api/test/*migration.test.ts` and run with the unit suite.

Windows icon binaries are ignored and must never be committed. To test the
optional pack locally after reviewing its unresolved rights status, run:

```bash
pnpm icons:install -- --acknowledge-third-party-rights
```

Run `pnpm icons:remove` before the complete contributor gate. If you change the
importer or generated catalog, run the deep reproducibility check with an exact
upstream checkout using
`pnpm icons:audit -- --source=/absolute/path/to/win95-winxp_icons`.

## Assets and content

- Add every bundled font, icon, audio file, or image to `docs/assets/third-party-assets.manifest.json` with a source revision, rights holder, license, notice, allowed scope, review status, count, and deterministic hash.
- `pnpm assets:audit` must pass. A public redistribution release additionally requires `pnpm assets:audit:release`.
- Do not commit reference screenshots, user uploads, private signed URLs, or media without redistribution permission.
- User content remains the user's content; a source-code contribution does not transfer rights to unrelated uploads.

## Database and security

- Add forward-only numbered migrations; never edit a migration that may already be deployed.
- Add a migration contract test and document rollout/rollback limitations.
- Never commit `.env`, `.dev.vars`, tokens, private URLs, or production identifiers.
- If a secret is discovered, revoke or rotate it first and report privately under [SECURITY.md](SECURITY.md). Do not rewrite shared history without coordinating with the maintainers.

## Pull requests

Keep changes scoped and explain user impact, schema/asset changes, focused checks run, and final verification. Accessibility requires keyboard operation, visible focus, semantic labels, and mobile coverage for interactive UI.
