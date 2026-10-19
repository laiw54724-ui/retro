# Guestbook preview isolation — 2026-10-19

Partial delivery for #42 (guestbook simulation), with the #45 preview/moderation boundary only. #29 navigation targets/picker, general #42 link testing and the broader #45 moderation/filter/busy UI remain outside this change.

## Identity and defect

Repository identity checked against GitHub repo ID **1420412178**, `https://github.com/laiw54724-ui/retro.git`. Latest issues and open PRs checked; #84 is still Draft. Base branch **integration/retro-night-quality-01**, exact starting SHA **a53821189f02f4ad8329d77a9049acefd91f13e1**. Work branch **codex/guestbook-preview-42**. Independent worktree under `task-6/retro-guestbook-preview`; all other worktrees preserved. No `AGENTS.md` or checkout `.agents/skills` was present.

On unchanged a538211, the new owner/1280px regression failed: expected **0** guestbook API requests after opening preview, received **2**. The normal visitor module mounted with a real public site handle. Its handlers also used real submit/report APIs. Collaborator/sample contexts could instead reach the generic “publish first” fallback. This was not satisfied by #84's presentation model.

## Implementation and modified paths

- `apps/web/src/features/modules/guestbook/previewContext.tsx`: explicit React context supplied only by preview hosts; no URL, site-handle or draft-visibility inference.
- `apps/web/src/features/modules/guestbook/PreviewGuestbook.tsx`: local form state and simulated submit/report feedback. Only a translated fictional approved entry is rendered. Submitted text is cleared and never enters the approved list. Disabled guestbooks show the closed state and simulation notice.
- `apps/web/src/features/modules/guestbook/index.tsx`: both visitor and inline-editor exports select the standalone simulation **before** a live component mounts. Even accidental editing/siteId/siteHandle capabilities cannot enable owner moderation inside the provider. Public visitor and real editor implementations are unchanged.
- `apps/web/src/features/editor/VisitorPreview.tsx` and `apps/web/src/features/collaboration/DraftViewer.tsx`: one provider around each preview body. React context reaches both renderers without changing `WindowRenderer`, `MobileScreen`, `VisitorDesktop`, `ModuleCtx` or their props. The requested coordinator-thread lookup returned “thread not found”; no shared renderer interfaces were changed.
- `apps/web/src/i18n/locales/{zh-Hant,en,ja,ko}/modules.json`: only five new keys under `guestbook.preview`: `notice`, `sampleName`, `sampleBody`, `sent`, `reported`. Existing keys and formatting preserved.
- `apps/web/src/features/modules/guestbook/preview.test.tsx`: four context/owner-boundary render checks.
- `tests/e2e/guestbook-preview.spec.ts`: ten dedicated browser cases. Existing public/owner tests left unchanged.
- `docs/superpowers/plans/2026-10-19-guestbook-preview.md` and this evidence directory.

No shared CSS, schema, API, migrations, permissions, secrets, remote records, deployment, main merge or issue closure changed.

## Verification

Environment: macOS, Node **22.23.2**, pnpm **10.18.2**, Playwright **1.64.1**, Chromium. One browser worker at a time, local port 5186. API/auth responses mocked; no live submissions or reports made.

| Check | Result |
| --- | --- |
| `pnpm lint` | PASS across shared/API/web; these scripts are the repository's TypeScript checks (`tsc --noEmit` / `tsc -b`) |
| Web Vitest: guestbook preview, preview model, resources, translation quality, hardcoded text | **28 passed**, 5 files |
| `guestbook-preview.spec.ts` + existing `guestbook.spec.ts` | **13 passed**, no skips/retries |
| `guestbook-preview.spec.ts` + existing `preview-sources.spec.ts` | **26 passed**, no skips/retries (10 guestbook + 16 existing preview cases) |
| `git diff --check` | PASS |

The ten new cases cover owner publishable/draft and collaborator at **1280/320px**, sample at **1280/390px**, disabled state, explicit simulation notice, form submit/report without any guestbook requests, unpublished-message sentinel absence, absence of owner moderation/settings, no draft saves, no new undo entries, mobile app Escape and icon focus, desktop start-menu Escape, overlay Escape, browser Back/focus, reopening with cleared local form state, and real public reporting after leaving preview. The sample test substitutes only sample document windows through a test route, because current built-in samples contain no guestbook; it still executes the real LandingPage → VisitorPreview sample branch.

The four unit cases render both module entry points with real-looking owner capabilities inside the preview context, retain owner controls outside it, and reject missing-handle inference. These are render checks; the E2E request counter verifies actual mounting/effect isolation.

Initial verification exposed test-only issues: status locator also matched the preview bar, and a v1 fixture queued its legitimate load-time migration autosave. Locators now target guestbook status; fixtures are canonical v2 before load. A fixture union narrowing error was corrected. Assertions were not weakened and no tests were skipped.

[Desktop screenshot](desktop.png) and [320px screenshot](mobile-320.png) were inspected: notice, form and sample report controls fit without horizontal overflow. Screenshots are evidence, not updated visual baselines.

## Limits and integrator handoff

The simulation intentionally displays fictional data rather than live approved entries. Local state can reset when its app/source/layout unmounts and always resets when the preview session closes. No preview submission is retained or published.

Physical iOS/Android, native Back/keyboard/rotation, real DB/RLS and deployed guestbook behavior are **unverified**. The existing public submission/rate-limit retry and real owner approve tests pass with mocks; those are not live-service validation. ja/ko copy is AI-assisted, beta, without native-speaker review. Unit startup reports missing Supabase environment variables; auth is mocked in browser tests.

No full `verify:contributor` run was requested here. One final combined integration gate belongs to the integrator; the earlier #84 gate does not validate this new branch. Rebase/cherry-pick only the scoped commit if the integration base moves.
