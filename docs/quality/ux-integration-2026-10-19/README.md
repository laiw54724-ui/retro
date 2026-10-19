# UX integration candidate — 2026-10-19

Draft candidate for the [all-component UX audit](https://github.com/laiw54724-ui/retro/blob/a5a57ac90ee5ec8d3fe82709f2a9aad1b1c3bcf5/docs/quality/ux-audit-2026-10-19/README.md). This combines the independently cleared mobile history, modal recovery, numeric/retry, IG editing/draft, and content/settings-entry sources. It is not release approval.

## Exact sources

Base: `f11ad8d5cb869d47849834cdd8a692a5059d8021` (latest main when fetched).

| Source | Included head | Integration method |
| --- | --- | --- |
| #130 modal / 409 recovery | `4f0e59e17b5def22a7d41738b0491238c9886f6a` | ancestry-preserving merge |
| #133 mobile Undo / status | `6209d931a19b3935ce80ce01353c8cc730da0d79` | ancestry-preserving merge |
| #134 numeric drafts / URL retry | `02b0829a0ccf2f099a994358e679a0ef292d9fc3` | ancestry-preserving merge |
| #135 IG editing / retained drafts | `83172d8500e097051b098a595e9eeb2b455c2e46` | ancestry-preserving merge after independent clearance |
| #136 content / settings entry | `58e9acadc72c8271ffd5b95c474d0324f84cd927` | ancestry-preserving merge; independent clearance received |
| #133 + #135 status delta | `1c370190eb15e82bb24d267148847d83282e56ba` | only format-patch delta, applied as `25e54bf` |

All five source heads are verified ancestors. The status patch's stable patch-id is identical before/after application: `1bd275a36eb395e6a5482dfde89bf541926e4d92`. Its preparatory source merges/cherry-picks were not imported.

Image rollout #128 `976c217d76eb792e9f1bb270a664af7f65f00f32`, #129 `19121371fa182d31fdddc3708aa81ac1f5afe630`, and #132 `1284b0fccaa7fc33172846b19314b23dcd233759` are verified **not** ancestors. Their dedicated tests/workspaces were not used. #131 audit publication and F12 help remain separate.

## Integration decisions

- The sole source merge conflict was `MobileScreen.tsx`: preserve #130's `ModalDialog`, insert #136's return action as its first body child, keep its content-action ref and `preventScroll` focus return. Preserve mounted content, edit mode, selection, drafts, and scroll.
- Update newly added #130/#133/#134/#135/status/integration test selectors to `視窗設定`, `編輯內容`, and `完成`. Assertions remain scoped to their original behaviors.
- `EditorPage.tsx` combines conflict recovery and mobile history/status. Retained IG buffers qualify only canonical **saved** status; dirty/saving/error/retry remain authoritative. No new Save/Publish disable condition.
- CSS retains one modal scrolling body, in-flow mobile history/status, 44px history/return controls, and readable conflict recovery notice. `ModalDialog.tsx` retains the reviewed topmost Escape, opener restoration, and pending-operation contract.
- Cross-source regression found a missed modal contract: Ctrl+Z on the focused publish Cancel button changed background Minesweeper rows from 10 to 8 despite root `inert`. The red test failed on the value assertion. Integration fix `a9525e3` returns early from EditorPage's global history handler while root is inert. All three phone-width cross-source tests now verify both Ctrl+Z and Cmd+Z cannot change background content. This integration-owned delta remains visible for independent review.

## Validation

Local runtime/test commit: `a9525e3cd350ebdfaea86d7fa4725f6859e70942`, tree `ccf1cc81599a836f55683498cf18fda38dd89069`. Subsequent candidate additions are this report/evidence and the exact-head CI workflow. CI records the complete final candidate SHA/tree itself.

- 58/58 final cross-batch Chromium tests, one worker, no retries: modal focus/409/500/pending publication, IG list/detail/preview and retained drafts, all four status-patch tests, settings return and scroll preservation, mobile Undo/Redo/retry/reduced viewport, and three new numeric → settings → history → preflight/shortcut flows.
- 15/15 additional final numeric/retry and save-session boundary tests: all #134 cases plus stale publish-409 receipt, explicit remote reload, viewer access-loss redirect, and current-session conflict pause. **73 distinct final Chromium cases total** (58 + 15).
- 61/61 focused unit tests across history/local work, Minesweeper, IG drafts/filter/profile, and locale resources.
- One final combined `pnpm build`: shared package, web TypeScript/Vite, and API dry-run all exit successfully. Existing large-chunk and Wrangler environment-selection warnings remain; no deployment occurred.
- `pnpm security:audit` and `git diff --check` passed. Visually inspected 320px settings return and 390px conflict/paused-state screenshots.
- Preliminary three-source assembly passed 37 Chromium / 33 unit tests and one build before #135/#136 were cleared. These overlap the final coverage and are not added to its counts. No per-source full contributor gates were rerun.

Environment: macOS, Node 22.21.0, pnpm 10.18.2, Playwright 1.64.1. Dedicated loopback port **5497**, `--strictPort`, `reuseExistingServer: false`, one worker, zero retries, separate output directories. Tests use synthetic mocked backend writes. New integration/status fixtures block non-loopback requests.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @retrodesk/web test:unit src/features/editor/store.test.ts src/features/editor/editorLocalWork.test.ts src/features/modules/minesweeper src/features/modules/instagram src/i18n/resources.test.ts
corepack pnpm exec playwright test -c playwright.ux-integration.config.ts tests/e2e/ux-integration.spec.ts tests/e2e/editor-modal-accessibility.spec.ts tests/e2e/mobile-history-status.spec.ts tests/e2e/ig-shell-save-status.spec.ts tests/e2e/ig-editor-flow.spec.ts tests/e2e/mobile-content-settings.spec.ts --grep-invert '^.*image: content and window settings'
corepack pnpm exec playwright test -c playwright.ux-integration.config.ts tests/e2e/audit-f09-f10.spec.ts tests/e2e/editor-save-session.spec.ts --grep 'numeric|URL|late.*response|failed retry|publish receipt 409|ordinary remote reload|current-session conflict' --output=../evidence/final-boundaries
pnpm build
pnpm security:audit
```

The task-local Corepack shim supplies `pnpm` for nested package scripts. Initial setup attempts failed before tests/build execution due missing shim and sandbox loopback binding; authorized escalation permitted the isolated browser service. The preliminary build's optional global Wrangler log write was sandbox-blocked but its compilation exited 0; the final build directs logs to task-owned evidence.

## Exact candidate CI and limits

`.github/workflows/ux-integration-candidate.yml` is restricted to this integration branch's PR. It checks out `pull_request.head.sha`, records SHA/tree/lockfile identity, runs focused units, one combined build, and the 69-case selected Chromium batch. It does not invoke the existing Image-heavy integration workflow. Standard repository PR CI also runs independently. Actual final CI status belongs to the PR/run, not this static report.

No merge, main push, deployment, live publication, schema/security change, feature activation, or 403 bypass. No full contributor gate, Safari/WebKit/Firefox, physical-device keyboards/IME, screen readers, staging, or live service acceptance is claimed. Conservative retained buffers from removed IG entities remain a status qualifier and do not newly gate Save/Publish.
