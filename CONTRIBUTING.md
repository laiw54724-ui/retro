# Contributing to Retro Desktop

Thanks for helping build Retro. This repository accepts reviewed built-in apps, schemas, themes, and data templates. It does not load arbitrary third-party JavaScript as a plugin.

## Start locally

Follow [Development](docs/DEVELOPMENT.md) for Node/pnpm setup, a credential-free
web shell, mocked tests and optional service integration. The app must build
and test without production credentials. Use the [documentation guide](docs/README.md)
to find design contracts and historical evidence.

## Make a focused contribution

1. Check open issues and PRs for overlapping work. For a substantial change,
   propose the problem, scope and acceptance criteria in an issue first.
2. Fork the repository, fetch the latest upstream `main`, and create a topic
   branch. If working alongside another contributor or agent, use an independent
   worktree; never reset or stash someone else's uncommitted work.
3. Keep one behavior or documentation concern per PR. Avoid unrelated formatting,
   module moves and schema changes. Preserve comments that explain constraints.
4. Add focused regression coverage for behavior changes and run the checks below.
5. Open a PR against `main` with the outcome, verification and remaining limits.
   Use a draft while checks or design decisions are still pending. Maintainers
   review and merge; opening a PR does not authorize deployment.

Before committing, check the name/email Git will publish. Use an identity you
have verified in your GitHub settings; do not invent a noreply address or change
another contributor's author information. AI-assisted contributions are welcome;
review the output and report material assistance honestly. Keep valid attribution,
copyright and third-party notices.

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
`pnpm icons:audit -- --source=../win95-winxp_icons`.

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

Explain user impact, schema/asset changes, focused checks run, and final verification. Include only the logs needed to reproduce the result; redact local paths and private account details. Use synthetic example accounts such as `contributor@example.com`. Accessibility requires keyboard operation, visible focus, semantic labels, and mobile coverage for interactive UI.
