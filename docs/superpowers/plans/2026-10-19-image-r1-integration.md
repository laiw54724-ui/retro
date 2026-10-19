# Combined Navigation R1 and image reader candidate

## Scope and ancestry

Dedicated worktree and branch: `integration/retro-image-r1-01`, from exact main `d366225657604e1515ed4c9075fc8dbf954584a6`.

| Source | Exact merged head | Verified source CI |
| --- | --- | --- |
| #104 Navigation R1 | `10bbd8b2c63851509b39421435677368c5619bdc` | success, run 39221396749 |
| #105 image schema/reader compatibility | `7d4a9038fa3fd94fd79da539aba03332eb5b2cab` | failure, run 39221498960; inherited Inspector fallthrough |
| #106 W3b image leaf | `7b1c23f02eeac5791b0421b642f246e1e62a639f` | failure, run 39221717351; inherited Inspector fallthrough |

All three source heads were reconciled against GitHub before publication. They were merged with ancestry, without conflicts. Source branches/worktrees were not changed. Source CI failures remain failures; the correction and the proof below belong to this combined candidate.

## Combined corrections

- `a8d337a`: minimal explicit read-only image Inspector branch, four translations, static rendering test and selected-image desktop/phone coverage. No Inspector refactor.
- `0dcbb2c`: clear only image `content.srcUrl` in both v1/v2 public projections; retain canonical `src`, alt/caption and all other image properties. Public GET re-projects stored publications, returns only public fields, and fails closed for an invalid document. Artifact synchronization (including retry) projects before promoting assets or writing JSON. Owner drafts and stored input objects remain intact.
- The central registry binds reviewed `ImageView`/`ImageInlineEditor` exports. Central rendering still forces the view and keeps its measured stage. Image creation, duplication and editor capabilities remain disabled. The disposable W3b fixture exercises leaf authoring independently; that is not evidence of production writer enablement.
- The existing integration workflow now includes a separate W3b fixture step alongside W3a. No branch trigger was added and no full workflow was dispatched.

## Focused proof

Implementation tree at `0dcbb2c` was tested locally on macOS with mocked API/storage and disposable browser fixtures. Evidence-only additions follow this commit.

| Check | Result | Evidence |
| --- | --- | --- |
| Shared image/public projection | 27 passed, 0 skipped | [shared.txt](2026-10-19-image-r1-integration-evidence/shared.txt) |
| API publication/public response/retry | 29 passed, 0 skipped | [api.txt](2026-10-19-image-r1-integration-evidence/api.txt) |
| Web Inspector/registry/leaf | 10 passed, 0 skipped | [web-leaf-inspector.txt](2026-10-19-image-r1-integration-evidence/web-leaf-inspector.txt) |
| Web creation/compatibility guards | 11 passed, 0 skipped | [web-guards.txt](2026-10-19-image-r1-integration-evidence/web-guards.txt) |
| Locale resource/catalog/translation checks | 14 passed, 0 skipped | [catalog.txt](2026-10-19-image-r1-integration-evidence/catalog.txt) |
| Shared/API/web typecheck | all passed | [typecheck.txt](2026-10-19-image-r1-integration-evidence/typecheck.txt) |
| Central Chromium reader | 7 passed, 0 skipped, retries 0 | [central-chromium.txt](2026-10-19-image-r1-integration-evidence/central-chromium.txt) |
| W3a isolated Chromium | 5 passed, 0 skipped, retries 0 | [w3a-chromium.txt](2026-10-19-image-r1-integration-evidence/w3a-chromium.txt) |
| W3b isolated Chromium | 3 passed, 0 skipped, retries 0 | [w3b-chromium.txt](2026-10-19-image-r1-integration-evidence/w3b-chromium.txt) |

The new regression tests first reproduced the bug: two shared projection failures and four API publish/public-response failures. After correction all passed. API proof exercises the actual Hono publish route, atomic RPC payload, immutable artifact JSON, public GET and owner GET against an in-memory Supabase/R2 harness, for both versions. It proves private raw authoring text is absent while the private asset reference becomes the intended public URL and the owner retains the original draft. Historical stored JSON is sanitized at public read and artifact retry without mutating that stored input. Existing immutable artifacts are not overwritten or migrated by this change.

The first typecheck command could not find nested `pnpm`; it was rerun with the existing corepack shim in PATH and then passed all three packages. This was a command setup failure, not a successful first attempt. No browser retry or baseline update was used.

## Routine PR CI correction

Routine PR CI run [39223058937](https://github.com/laiw54724-ui/retro/actions/runs/39223058937) on initial candidate `9292cf13f33b328da1f3e7fc1281776d90f56758` failed at the existing catalog parity assertion: the new image discriminant had no `editor.modules.image` label/description in any locale. Shared/API tests passed; web had 343 passes and this one failure. Build/artifact scan did not run. The correction adds localized read-only image catalog entries in all four editor locale files. The assertion and all other gates remain unchanged; 14 focused resource/translation/hardcoded-text tests then passed. The final routine PR CI outcome is recorded in the PR after it reaches a terminal state. This is a corrected candidate, not a first-pass CI success.

## Review hold and remaining gates

Independent review must explicitly clear the central public-data fix before the full integration gate. This report does not claim a full gate result.

| Final gate portion | Status |
| --- | --- |
| lint | pending full gate |
| complete contributor gate | pending full gate |
| ja/ko preview flows | pending full gate |
| dedicated window Chromium baselines | pending full gate |
| dedicated window WebKit smoke | pending full gate |
| W3a 5 / W3b 3 fixtures in CI | pending full gate; local proof above |

After clearance, dispatch the existing Integration candidate verification workflow against the exact stable branch head and monitor that SHA to a terminal result. No changes to SQL, security settings, permissions, deployments or main merges were made. No native browser/device or live service validation is claimed. Leaf-worker coordination delivery returned “An earlier turn submission is not yet confirmed”; the leaf contract and source dependency are unchanged and no leaf rebase is required for this combined correction.
