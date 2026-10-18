# Night quality integration preparation

Base: `386c209dd8cb47bae96a749a7751cc7189032183`. Worktree: `task-2/retro-night-quality`; branch: `integration/retro-night-quality-01`. The original #80 worktree/branch remains clean and untouched.

## Fixed reviewed sources

| PR | Exact merged source head |
|---|---|
| #74 | `e174d9d93dd8cef349c2ca51905faee34c77b079` |
| #77 | `3d362aba671be19a67b022f97f18cef8c894753b` |
| #79 | `bc44a2fc92c63498175f610f23a97fe36dfb220f` |
| #80 | `bd0031934fce8be5d82a03f0394c855c8834ac58` |
| #82 | `279451d44cb57660d807a1a2be3d5448dabe1cc0` |

All heads matched the supplied values after fetch. Five merge commits preserve their ancestry. No conflicts or integration runtime fixes were needed. The source merge snapshot is `d8fc380e93fd122986848991265bdec961fddef7`, tree `4b654587817df94bb6283d8b551c642c4b59407d`; this document and the additional phone-boundary test are committed afterward.

**#78 is not included.** Its last supplied head `c685388c5ec22e461e5aed9825854b6dcda98644` is under further independent review for an existing RLS/published_artifact_key trust-boundary question. Wait for the parent to provide the final reviewed head and authorize the one final complete gate. This candidate is not release-approved.

Excluded by ancestry: R4 `f0b351f2dce503b1ae057606a297043d30c7d6cb`, docs #83 `3c39b388968dfe0e9431ea2b8a0c27186d534d3d`, and #78. No unpublished phone UX or additional PRs were silently included.

## Existing overlapping candidate

At the initial check, `integration/retro-preview-media@3b5feb302dd1e4dcf1d6b0638effafe0ed93979f` was running [39148791420](https://github.com/laiw54724-ui/retro/actions/runs/39148791420). It includes #74/#77/#82 and excluded R4, but not #79/#80/#78. It is a different combination, not evidence for this candidate. Its job was not stopped or reused. No matching full night combination was found in remote branches/open PRs/worktrees. No actual local test/Runner.Worker job was seen before the focused run (idle Playwright MCP servers existed).

## Bounded interface verification

- Shared `w98.css` retains all pinned R1/R2/R3 rules. Relative to the base it has exactly the eight M1 added lines; no removals. Workflow and shared schema files match the base.
- `viewDrafts` remains optional in ModuleCtx, WindowRenderer, VisitorDesktop and MobileScreen. Authorized DraftViewer passes it on both desktop and phone; VisitorPreview passes it only for the draft source. Public callers do not enable it. IgPreview's extra-details gate uses editing/viewDrafts/published visibility as reviewed.
- 28 focused unit tests passed: preview model 10, source classifier 7, Moodboard editing 6, edge worker metadata 5. [Log](focused-unit.txt).
- Eight existing focused E2E cases passed in the first batch: six Moodboard pointer/blank/layer geometry commits across 1440/320, and M1 successful-upload/Undo source-field cleanup.
- Seven preview-boundary cases then passed: four new owner/viewer × 320/390 tests and the three reviewed desktop draft/public detail cases. [Log](preview-boundary.txt). The new phone cases use synthetic data and verify authorized private fields render before confirming no private character/fields in the public directory.
- One initial new-test fixture preflight failed because it had only one published profile, so the public UI correctly omitted the multi-character directory button. A second published fixture profile was added, preserving the original private-content assertions. The failed preflight is retained [verbatim](fixture-preflight.txt). No runtime, existing assertion, retries, skips or screenshot baselines changed. Passed Moodboard/M1 cases were not rerun to correct this fixture.

All browser checks used one local Chromium worker, zero retries and an isolated Vite port 5299. No production endpoints/accounts were used. These frontend fixtures do not establish real API/RLS authorization or deployed CSP/cache correctness. No complete gate has run for this combination. Real iOS/Android/provider playback/deployment remain unverified. Do not merge main, deploy, close sources/issues or change secrets/permissions.
