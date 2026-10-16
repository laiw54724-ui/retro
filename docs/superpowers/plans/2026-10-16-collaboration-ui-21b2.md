# Collaboration UI 21B2 Implementation Plan

> **For Codex:** Execute this plan task-by-task in the current `codex/collaboration-ui-21b2` worktree. Use focused tests after each task, then run the full release gate once the milestone is complete.

**Goal:** Expose the already-deployed site collaboration backend through a secure, role-aware editor experience, an owner management dialog, and a fragment-safe invitation flow.

**Architecture:** Keep the API as the authorization source of truth. Load `access_role` with the site before mounting any authoring behavior, route viewers to a separate draft reader, and gate owner/editor affordances through small pure decision helpers. Invitation secrets live only in the URL fragment, `sessionStorage`, and the one acceptance request body.

**Tech Stack:** React 19, React Router, Zustand, Vitest, Playwright, Supabase Auth, existing Win98 CSS system.

---

## Task 1: Type the collaboration contract and role decisions

**Files:**
- Create: `apps/web/src/lib/collaboration.ts`
- Create: `apps/web/src/lib/collaboration.test.ts`
- Modify: `apps/web/src/lib/api.ts`

1. Write failing unit cases for owner/editor/viewer action decisions, invite status labels, and terminal invite error classification.
2. Run `pnpm --filter @retrodesk/web test:unit -- src/lib/collaboration.test.ts` and confirm the missing module failure.
3. Add `SiteAccessRole`, member/invite response types, pure UI decision helpers, and the typed API methods for list/create/revoke/update/remove/accept.
4. Re-run the focused test and `pnpm --filter @retrodesk/web typecheck`.
5. Commit: `feat: add collaboration web contract`.

## Task 2: Capture invitation fragments without leaking tokens

**Files:**
- Create: `apps/web/src/lib/inviteToken.ts`
- Create: `apps/web/src/lib/inviteToken.test.ts`
- Create: `apps/web/src/pages/InvitePage.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/pages/AuthPage.tsx`

1. Write failing unit cases for accepting only the expected token shape, writing to `sessionStorage`, immediately removing the hash, reading the stored token, and clearing terminal state.
2. Run the focused Vitest file and confirm failure.
3. Implement token utilities with dependency-injected location/history/storage seams so the raw token is never logged or placed in a request URL.
4. Add `/invite` outside `RequireAuth`; implement loading, signed-out, ready, accepting, success, and terminal-error states. OAuth returns to `/invite`; acceptance calls `POST /api/invites/accept` with JSON and navigates to `/editor/:siteId`.
5. Make `AuthPage` preserve an explicit safe return path rather than always opening the first site.
6. Add focused Playwright coverage in `tests/e2e/collaboration.spec.ts` for fragment removal, signed-out CTA, signed-in accept, terminal error, and 320px layout.
7. Run focused unit/E2E/typecheck.
8. Commit: `feat: add secure collaboration invite flow`.

## Task 3: Branch viewers before authoring effects mount

**Files:**
- Create: `apps/web/src/pages/CollaborativeSitePage.tsx`
- Create: `apps/web/src/features/collaboration/DraftViewer.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/src/styles/global.css`

1. Add Playwright cases that mock a viewer site and assert private-draft banner/device toggle are present while editor controls, autosave mutations, uploads, publish, and collaborator management are absent.
2. Confirm the focused E2E test fails.
3. Move the initial `getSite` responsibility to a thin role-aware route component. Render `DraftViewer` for viewers and mount `EditorPage` only for owner/editor, passing the already-loaded site to avoid duplicate loading.
4. Build the read-only surface from `VisitorDesktop` and `MobileScreen mode="visitor"`; include explicit access role and sign-out/navigation affordances.
5. Run focused E2E and typecheck.
6. Commit: `feat: add viewer-only private draft`.

## Task 4: Make editor behavior role-aware

**Files:**
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/src/features/editor/store.ts`
- Modify: `apps/web/src/features/editor/store.test.ts`
- Modify: `apps/web/src/styles/w98.css`

1. Extend store tests so `setSite` records/reset the site role safely.
2. Pass `access_role` into the editor store and use pure role decisions for the top bar and asset-migration controls.
3. Keep draft editing and private asset upload for editors, but omit publish/retry/migration/collaboration actions and show `編輯者 · 只有擁有者可以發布`.
4. Add Playwright coverage that an editor can edit/save but cannot see owner-only actions.
5. Run focused store tests, focused E2E, and typecheck.
6. Commit: `feat: enforce collaboration roles in editor UI`.

## Task 5: Add the owner collaboration dialog

**Files:**
- Create: `apps/web/src/features/collaboration/CollaborationDialog.tsx`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/src/styles/w98.css`
- Modify: `apps/web/src/styles/global.css`
- Modify: `tests/e2e/collaboration.spec.ts`

1. Add failing Playwright coverage for list loading, empty states, create/copy/revoke invite, role update, member removal confirmation, mutation refresh, inline API error, Escape close, and focus return.
2. Implement owner-only `協作者` entry and the responsive Win98 dialog. Keep the one-time link only in component state and expose a selectable fallback when Clipboard API fails.
3. Use explicit status text (`等待接受`, `已接受`, `已撤銷`, `已過期`), 42px mobile controls, bounded internal scrolling, and an accessible alert dialog for removal.
4. Run the focused E2E file at desktop and 320px plus web typecheck.
5. Commit: `feat: add owner collaboration manager`.

## Task 6: Milestone quality and deployment gate

**Files:**
- Modify: `docs/verification.md`
- Modify any 21B2 file only when a gate exposes a defect.

1. Run placeholder/secret checks: `rg -n "example\\.supabase|token=|console\\.(log|debug)|TODO|FIXME" apps/web/src tests/e2e/collaboration.spec.ts` and manually verify no raw invitation token can reach route paths, logs, analytics, or localStorage.
2. Read the Impeccable craft floor, then run its detector exactly once against the changed UI targets and address material findings.
3. Run the complete release gate: `pnpm test:unit`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e`, and `git diff --check`.
4. Review the final diff for authorization assumptions, async races, focus/accessibility, mobile overflow, and regressions; fix and rerun affected gates.
5. Record commands/results in `docs/verification.md` and commit: `docs: verify collaboration UI milestone`.
6. Deploy only Pages when the API contract remains unchanged: `pnpm --filter @retrodesk/web deploy:staging`.
7. Verify the returned immutable Pages URL and canonical staging URL for `/invite`, owner/editor/viewer mocked or authenticated paths where available, fragment clearing, responsive rendering, and absence of stale bundles. If runtime API changed, also deploy the staging Worker with preserved variables and repeat its auth-boundary smoke tests.
8. Update GitHub Issue #21 with commit, test, deployment, and live-smoke evidence. Close it only when all 21B acceptance criteria are demonstrated.

## Release invariants

- Server permissions remain authoritative; client hiding is never counted as security.
- A viewer must never mount editor autosave/upload/publish behavior.
- An editor can mutate drafts/assets but cannot publish, migrate legacy assets, or manage collaborators.
- A raw invite token exists only in the fragment during first capture, `sessionStorage` while pending, the one-time copy field, and the acceptance POST body.
- Existing owner editor, mobile editor, public visitor, Instagram scrolling, and private-asset flows remain covered by the full regression suite.
