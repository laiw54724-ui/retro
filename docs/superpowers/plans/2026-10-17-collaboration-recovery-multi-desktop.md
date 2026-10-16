# Collaboration Recovery and Multi-Desktop Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore invitation acceptance and expose the already-supported owned/shared multi-desktop model through a responsive Win98 desktop hub.

**Architecture:** A forward-only Supabase migration replaces the ambiguous invite RPC conflict target without changing its signature. The web app keeps `/auth` as both Google login and authenticated desktop hub, rendering a focused `DesktopHub` component from the existing `GET /api/sites` contract; editor navigation links back to the hub. API diagnostics log only database metadata and never invite secrets.

**Tech Stack:** PostgreSQL/Supabase migrations, Hono/Cloudflare Workers, React 19, React Router, TypeScript, Vitest, Playwright, Win98 CSS.

---

## File map

- Create `supabase/migrations/0008_fix_accept_site_invite_conflict.sql`: forward-only RPC replacement.
- Modify `apps/api/test/collaboration-migration.test.ts`: assert migration safety and the named constraint conflict target.
- Modify `apps/api/src/routes/collaboration.ts`: structured, secret-free unexpected RPC diagnostics.
- Modify `apps/api/test/collaboration-routes.test.ts`: assert generic client response and useful server log.
- Create `apps/web/src/features/sites/DesktopHub.tsx`: present owned/shared desktops and all loading/error/empty states.
- Modify `apps/web/src/pages/AuthPage.tsx`: load site inventory instead of auto-opening the first item.
- Modify `apps/web/src/pages/EditorPage.tsx`: brand navigation returns to the hub.
- Modify `apps/web/src/styles/global.css`: responsive hub layout within the incumbent Win98 language.
- Create `tests/e2e/desktop-hub.spec.ts`: owned/editor/viewer, multiple sites, new site, retry, and mobile coverage.
- Modify `tests/e2e/collaboration.spec.ts`: update revoked-editor expectation for the new hub.
- Modify `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`: record staging evidence after deployment.

### Task 1: Lock the database regression with a failing contract test

- [ ] **Step 1: Extend the migration contract test**

Read both migrations and require the new file to recreate `accept_site_invite`, preserve the security-definer/search-path contract and stable errors, use `on conflict on constraint site_memberships_pkey`, and omit `on conflict (site_id, user_id)`.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm --config.verify-deps-before-run=false --filter @retrodesk/api test:unit -- collaboration-migration.test.ts
```

Expected: FAIL because migration `0008_fix_accept_site_invite_conflict.sql` does not exist.

- [ ] **Step 3: Add the forward-only migration**

Recreate the original three-argument RPC with the same return type, validation, row lock, membership upsert, invite update, audit insert, grants and revokes. Change only the conflict target to:

```sql
on conflict on constraint site_memberships_pkey do update
  set email = excluded.email,
      role = excluded.role,
      updated_at = clock_timestamp();
```

- [ ] **Step 4: Run the focused test and verify pass**

Run the command from Step 2. Expected: the collaboration migration test passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_fix_accept_site_invite_conflict.sql apps/api/test/collaboration-migration.test.ts
git commit -m "fix: repair collaboration invitation acceptance"
```

### Task 2: Add safe server-side RPC diagnostics

- [ ] **Step 1: Add a failing route assertion**

In the generic accept-invite database failure test, spy on `console.error`. Assert the response remains `500 db_error`, the log contains route name plus Supabase `code`, `message`, `details` and `hint`, and does not contain the raw 43-character token, invited email or authorization header.

- [ ] **Step 2: Run the focused route test and verify failure**

```bash
pnpm --config.verify-deps-before-run=false --filter @retrodesk/api test:unit -- collaboration-routes.test.ts
```

- [ ] **Step 3: Implement structured diagnostics**

Give `rpcFailure` an operation/context argument and log only the database error fields. Keep all known stable error mappings and the generic client message unchanged.

- [ ] **Step 4: Run the focused route test and verify pass**

Run the command from Step 2.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/collaboration.ts apps/api/test/collaboration-routes.test.ts
git commit -m "fix: add safe collaboration rpc diagnostics"
```

### Task 3: Build the authenticated desktop hub

- [ ] **Step 1: Write failing Playwright acceptance tests**

Create `tests/e2e/desktop-hub.spec.ts` using the existing fake Supabase session. Mock `/api/sites` with owner, editor and viewer records and assert:

```ts
await page.goto("/auth");
await expect(page.getByRole("heading", { name: "我的桌面" })).toBeVisible();
await expect(page.getByText("3 個桌面")).toBeVisible();
await expect(page.getByRole("link", { name: /編輯.*Owned Desk/ })).toHaveAttribute("href", "/editor/owned");
await expect(page.getByRole("link", { name: /協作編輯.*Shared Desk/ })).toHaveAttribute("href", "/editor/shared");
await expect(page.getByRole("link", { name: /查看私人草稿.*Read Only Desk/ })).toHaveAttribute("href", "/editor/viewer");
await expect(page.getByRole("link", { name: "新增桌面" })).toHaveAttribute("href", "/onboarding");
```

Also cover empty inventory, failed inventory with retry, and 320px horizontal overflow.

- [ ] **Step 2: Run only the new E2E file and verify failure**

```bash
pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/desktop-hub.spec.ts --workers=1
```

- [ ] **Step 3: Implement `DesktopHub`**

Render a semantic list with role labels `擁有者`, `可編輯`, `只能查看`; action labels `編輯`, `協作編輯`, `查看私人草稿`; draft/published status; `Intl.DateTimeFormat("zh-TW")` update time; retry, empty state, add, home and sign-out actions. Use `aria-live` for loading/error recovery and retain long-text titles.

- [ ] **Step 4: Replace AuthPage auto-navigation with inventory state**

On authenticated state, call `api.listSites`, store `sites/loading/error`, and render `DesktopHub`. OAuth error/notice messages remain visible. Retry reuses the same loader. Do not redirect when exactly one site exists.

- [ ] **Step 5: Add responsive Win98 styling**

Use a two-column grid above 720px and one column below it. Keep 44px mobile actions, `min-width: 0`, wrapping names and no horizontal overflow at 200% zoom.

- [ ] **Step 6: Run focused E2E and typecheck**

```bash
pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/desktop-hub.spec.ts --workers=1
pnpm --config.verify-deps-before-run=false --filter @retrodesk/web typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/sites/DesktopHub.tsx apps/web/src/pages/AuthPage.tsx apps/web/src/styles/global.css tests/e2e/desktop-hub.spec.ts
git commit -m "feat: add multi-desktop hub"
```

### Task 4: Connect editor navigation and collaboration recovery

- [ ] **Step 1: Update the revoked-access E2E assertion**

After redirect to `/auth?notice=...`, assert the status notice and desktop hub are both visible instead of the old `前往我的桌面` button.

- [ ] **Step 2: Make editor brand navigation explicit**

Change the editor brand to `/auth`, title `回到我的桌面`; add a separate small `首頁` action only where it fits without displacing primary editor actions. Viewer draft header must expose the same return path.

- [ ] **Step 3: Run the focused collaboration and hub E2E files**

```bash
pnpm --config.verify-deps-before-run=false exec playwright test tests/e2e/collaboration.spec.ts tests/e2e/desktop-hub.spec.ts --workers=1
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/EditorPage.tsx apps/web/src/features/collaboration/DraftViewer.tsx tests/e2e/collaboration.spec.ts
git commit -m "fix: connect editors to desktop hub"
```

### Task 5: Milestone verification, review and staging deployment

- [ ] **Step 1: Run the single consolidated pre-deploy gate**

```bash
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false test:unit
pnpm --config.verify-deps-before-run=false test:e2e -- --workers=1
pnpm --config.verify-deps-before-run=false build
git diff --check
```

Expected: all commands pass. Existing non-blocking bundle-size and Wrangler environment warnings are recorded, not silently treated as failures.

- [ ] **Step 2: Run one mechanical UI detector pass**

```bash
node /Users/wen/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/features/sites/DesktopHub.tsx apps/web/src/pages/AuthPage.tsx apps/web/src/styles/global.css
```

Fix mechanical findings once, then rerun only the affected focused check.

- [ ] **Step 3: Review the entire milestone diff**

Inspect database atomicity, token secrecy, membership permissions, error recovery, keyboard order, mobile overflow and existing one-site compatibility. Resolve every blocking finding before deployment.

- [ ] **Step 4: Push the database migration**

Run Supabase dry-run first; require only migration 0008. Push to the linked staging project and confirm remote migration history contains 0001–0008.

- [ ] **Step 5: Deploy API and Pages staging**

Deploy Worker staging with existing vars/secrets preserved, then build the web app with staging env and deploy Pages staging. Record immutable URLs, Worker version and bundle names.

- [ ] **Step 6: Online acceptance**

Verify canonical/immutable Pages and API health. With two verified accounts, create a fresh invitation, accept it, open the shared desktop from the hub, exercise editor/viewer access, create a second owned desktop and switch between both. Clean up only the created test data.

- [ ] **Step 7: Record evidence and commit**

Append exact commands, counts, URLs and observed results to `verification.md`, then commit the verification record.

### Task 6: Continue the approved #23–#28 roadmap

- [ ] **Step 1: Reconcile #27A before importing more assets**

Use the existing #27 spec to complete provenance, license scope, fallback mapping and open-source release decision. Run only asset/provenance checks during the segment.

- [ ] **Step 2: Complete #26 remaining visual contracts**

Reconcile implemented Win98/titlebar/font/taskbar work against the #26 checklist; implement only unmet items and run responsive/theme-focused tests.

- [ ] **Step 3: Implement #23, #24 and #25A as separate milestones**

For each issue, write its implementation plan from the approved issue spec, implement with focused tests, and defer the consolidated full gate to the next deployment boundary.

- [ ] **Step 4: Implement #28A/B, then evaluate #25B and #28C readiness**

Ship safe entity sharing and metadata before export/import. Start public guestbook or owner backup/import only after their moderation, abuse and rights prerequisites are present; stop only for a decision that changes data retention, content policy or redistribution rights.

