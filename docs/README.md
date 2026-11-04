# Documentation guide

Start with [Contributing](../CONTRIBUTING.md) and [Development](DEVELOPMENT.md).

| Need | Read |
| --- | --- |
| Runtime layout and data contracts | [Architecture](ARCHITECTURE.md) |
| Your own service setup | [Self-hosting](SELF_HOSTING.md) |
| Environment-specific rollout | [Deployment](DEPLOYMENT.md) |
| Live acceptance checklist | [Beta acceptance](BETA_ACCEPTANCE.md) |
| Source and asset rights | [License scope](LICENSE_SCOPE.md), [third-party assets](THIRD_PARTY_ASSETS.md), [asset-rights register](ASSET-LICENSES.md) |
| Dependency inventory | [Dependency licenses](DEPENDENCY_LICENSES.md) |
| Vulnerability reporting | [Security policy](../SECURITY.md) |
| Performance and regression evidence | [Performance baseline report](quality/README.md) |

## Design and verification records

Feature documents at this level explain individual contracts such as
[media embeds](MEDIA_EMBEDS.md), [mobile layout](MOBILE_SHELL.md) and
[window chrome](WINDOW_CHROME.md). Check their scope and date against the code
before relying on a rollout claim.

`plans/`, `releases/` and `integration/` contain historical Retro plans and
integration records, not the current backlog. Agent-directed task-plan and
specification Markdown was removed from the public working tree; original
commit history is unchanged. Some raw test logs remain in their historical
locations. For current work use issues, open PRs and the target branch.

`quality/` and `verification/` preserve test results, known failures and
acceptance limits. Results apply to the version and environment recorded there,
not automatically to current main. Some work was AI-assisted; removing
repetitive agent instructions does not change authorship or replace human
review. Existing attribution and source notices are retained.

Recorded local checkout paths may use `<worktree>` to avoid publishing personal
filesystem details. Test outcomes, source identities and relevant stack
locations remain as evidence; path normalization is not a new test run.
