# Publish Freshness and Background Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make republished sites immediately fresh and render uploaded wallpapers identically in the editor and public visitor page.

**Architecture:** Remove duplicated public-page wallpaper derivation by using the existing `themeView` adapter. Disable public-document caching at both the Worker response and browser request boundaries so a successful publish becomes visible on the next load.

**Tech Stack:** React, TypeScript, Hono, Vitest, Playwright, Cloudflare Workers and Pages

---

### Task 1: Add regression coverage

**Files:**
- Modify: `tests/e2e/public.spec.ts`
- Modify: `apps/api/test/owner-boundary.test.ts`

- [ ] **Step 1: Add a public wallpaper assertion**

Create a public document whose theme uses `pattern: "image"` and a wallpaper URL, then assert `.visitor-page` computes `background-size: cover`, `background-position: 50% 50%`, and `background-repeat: no-repeat`.

- [ ] **Step 2: Add a public response cache assertion**

Request `/api/public/sites/:username` through the existing API test harness and assert the `Cache-Control` header is `no-store`.

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `pnpm --filter @retrodesk/api test:unit -- owner-boundary.test.ts` and `PLAYWRIGHT_PORT=5197 pnpm test:e2e tests/e2e/public.spec.ts`.

Expected: the new cache and background assertions fail against the current implementation.

### Task 2: Unify wallpaper rendering

**Files:**
- Modify: `apps/web/src/pages/PublicSitePage.tsx`

- [ ] **Step 1: Replace the duplicate background calculation**

Derive `tv` with `themeView(document.theme)` and apply `tv.wall`, `tv.wallImageCss`, and `tv.wallSize` to `.visitor-page`, adding centered positioning and non-repetition only when the selected theme pattern is `image`.

- [ ] **Step 2: Run the public E2E test**

Run: `PLAYWRIGHT_PORT=5197 pnpm test:e2e tests/e2e/public.spec.ts`.

Expected: all public visitor checks pass.

### Task 3: Make published data immediately fresh

**Files:**
- Modify: `apps/api/src/routes/sites.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Disable caching on the public-site response**

Set `Cache-Control: no-store` on `/api/public/sites/:username`.

- [ ] **Step 2: Disable browser request caching**

Pass `cache: "no-store"` from `api.publicSite` so intermediary/browser defaults cannot reuse a prior response.

- [ ] **Step 3: Run focused API and E2E tests**

Run: `pnpm --filter @retrodesk/api test:unit` and `PLAYWRIGHT_PORT=5197 pnpm test:e2e tests/e2e/public.spec.ts`.

Expected: all tests pass.

### Task 4: Verify and deploy staging

**Files:**
- Verify all modified source and test files

- [ ] **Step 1: Run repository verification**

Run: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build`, and `PLAYWRIGHT_PORT=5197 pnpm test:e2e`.

Expected: every command exits successfully.

- [ ] **Step 2: Deploy the staging Worker and Pages site**

Run the repository staging API deployment, rebuild the web app with staging environment variables, and run `pnpm --filter @retrodesk/web deploy:staging`.

- [ ] **Step 3: Smoke-test the deployed services**

Confirm the canonical Pages URL, public site endpoint, wallpaper asset, and `/api/health` return successful fresh responses, with the public endpoint carrying `Cache-Control: no-store`.

