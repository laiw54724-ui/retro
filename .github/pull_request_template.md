## Outcome

<!-- State the problem, resulting behavior and related issue. Keep one concern per PR. -->

## Scope and risk

<!-- Note schema/migration, asset/license or compatibility changes; write "none" if absent.
     Identify dependencies on other PRs and any work intentionally left for later. -->

- [ ] Changes contain no credentials, private content, account details or personal local paths
- [ ] Attribution and third-party notices are preserved; new assets have manifest/provenance entries
- [ ] Any migration is forward-only and includes a contract test and rollout limitations

## Verification

<!-- List exact commands, results and tested commit. Say what was not run and why.
     Ordinary PR CI does not include the full browser suite. -->

Focused checks:

Before requesting merge:

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm verify:contributor`
- [ ] Keyboard, mobile/touch, loading, empty and error states reviewed where applicable

## Review notes

<!-- Include demo/redacted screenshots for UI changes. Summarize material AI assistance
     and how the result was checked. Do not paste raw sessions or private audit details. -->
