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
| #81 R4 (subsequently approved by parent) | `f0b351f2dce503b1ae057606a297043d30c7d6cb` |

All heads matched the supplied values after fetch. The first five merge commits preserve their ancestry; R4 was added in a sixth merge after the parent approved its bounded review. No conflicts or integration runtime fixes were needed. The source merge snapshot is `d8fc380e93fd122986848991265bdec961fddef7`, tree `4b654587817df94bb6283d8b551c642c4b59407d`; this document and the additional phone-boundary test are committed afterward.

**#78 is not included.** Its last supplied head `c685388c5ec22e461e5aed9825854b6dcda98644` is under further independent review for an existing RLS/published_artifact_key trust-boundary question. Wait for the parent to provide the final reviewed head and authorize the one final complete gate. This candidate is not release-approved.

Excluded by ancestry: docs #83 `3c39b388968dfe0e9431ea2b8a0c27186d534d3d`, and #78. R4 was initially excluded and later included only after explicit parent authorization of its exact head; no other phone UX or additional PRs were silently included.

## Existing overlapping candidate

At the initial check, `integration/retro-preview-media@3b5feb302dd1e4dcf1d6b0638effafe0ed93979f` was running [39148791420](https://github.com/laiw54724-ui/retro/actions/runs/39148791420). It includes #74/#77/#82 and excluded R4, but not #79/#80/#78. It is a different combination, not evidence for this candidate. Its job was not stopped or reused. No matching full night combination was found in remote branches/open PRs/worktrees. No actual local test/Runner.Worker job was seen before the focused run (idle Playwright MCP servers existed).

## Bounded interface verification

- Before R4, shared `w98.css` retained all pinned R1/R2/R3 rules and differed from the base by exactly the eight M1 added lines, with no removals. The later R4 merge adds its reviewed shell/music CSS and its existing workflow branch entry. Shared schema files still match the base; M1 source-input styles and viewDrafts propagation remain present.
- `viewDrafts` remains optional in ModuleCtx, WindowRenderer, VisitorDesktop and MobileScreen. Authorized DraftViewer passes it on both desktop and phone; VisitorPreview passes it only for the draft source. Public callers do not enable it. IgPreview's extra-details gate uses editing/viewDrafts/published visibility as reviewed.
- 28 focused unit tests passed: preview model 10, source classifier 7, Moodboard editing 6, edge worker metadata 5. [Log](focused-unit.txt).
- Eight existing focused E2E cases passed in the first batch: six Moodboard pointer/blank/layer geometry commits across 1440/320, and M1 successful-upload/Undo source-field cleanup.
- Seven preview-boundary cases then passed: four new owner/viewer × 320/390 tests and the three reviewed desktop draft/public detail cases. [Log](preview-boundary.txt). The new phone cases use synthetic data and verify authorized private fields render before confirming no private character/fields in the public directory.
- One initial new-test fixture preflight failed because it had only one published profile, so the public UI correctly omitted the multi-character directory button. A second published fixture profile was added, preserving the original private-content assertions. The failed preflight is retained [verbatim](fixture-preflight.txt). No runtime, existing assertion, retries, skips or screenshot baselines changed. Passed Moodboard/M1 cases were not rerun to correct this fixture.

All browser checks used one local Chromium worker, zero retries and an isolated Vite port 5299. No production endpoints/accounts were used. These frontend fixtures do not establish real API/RLS authorization or deployed CSP/cache correctness. No complete gate has run for this combination. Real iOS/Android/provider playback/deployment remain unverified. Do not merge main, deploy, close sources/issues or change secrets/permissions.

## Approved R4 addition

After parent confirmation, exact source `f0b351f2dce503b1ae057606a297043d30c7d6cb` was merged without conflict in `99c34bc9eb4b5ace131acfe2207e75ced4d1fc59`. This adds the reviewed #70/#71 phone shell alongside the existing private draft, Moodboard, icon-loading and edge metadata sources. It does not make the other candidate's gate evidence transferable.

The one bounded review follow-up changes MobileEdit's defaultOpen checkbox from `mobileScreen.openAutomaticallyWhenVisitorsArrive` to the existing four-language `mobileEditor.openByDefaultWhenVisitors`, whose wording explicitly says desktop only. No translation resource was modified. One assertion was added to the existing phone-editor-shell test to verify the checkbox's accessible name. That test and the four night owner/viewer × 320/390 draft/public checks passed: [5-test receipt](r4-interface.txt). No existing assertion was removed or weakened.

#78 remains absent and the final complete gate remains paused pending the parent's final reviewed security head.
