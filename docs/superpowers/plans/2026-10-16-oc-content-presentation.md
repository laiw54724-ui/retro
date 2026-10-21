# OC Content Presentation Implementation Plan

**Goal:** Finish Issue #20 with canonical collection authoring, collection/pinned visitor views, natural-ratio post details, and responsive 60-post acceptance coverage.

**Architecture:** Add immutable collection operations beside the post/highlight operations, then expose canonical collections through the existing module boundary and profile directory. Keep square `object-fit: cover` thumbnails in the grid, but render post-detail media with stored/intrinsic aspect ratio and `object-fit: contain`. Use the existing single IG scroll container and button ordering controls; do not add a drag library.

**Tech Stack:** TypeScript, React, Zod, Vitest, Playwright, existing Retro Desktop editor store and Cloudflare staging workflow.

---

### Task 1: Canonical collection operations

**Files:**
- Create: `packages/shared/src/collection-operations.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/collection-operations.test.ts`

- [ ] **Step 1: Write failing operation tests**

Cover collection create/update/delete/reorder, post membership ordering, bidirectional `postIds` / `collectionIds` synchronization, owner scoping, missing posts, and cross-site rejection.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @retrodesk/shared test:unit -- collection-operations.test.ts`

Expected: FAIL because collection operations are not exported.

- [ ] **Step 3: Implement immutable operations**

Export:

```ts
createCollection(document, input, { siteId })
updateCollection(document, collectionId, patch, { siteId })
deleteCollection(document, collectionId, { siteId })
reorderCollection(document, collectionId, direction, { siteId })
setCollectionPosts(document, collectionId, postIds, { siteId })
```

Every successful operation validates the complete v2 document. `setCollectionPosts` accepts only same-site posts owned by the collection owner, de-duplicates IDs while retaining order, and synchronizes each affected post's `collectionIds`. Deleting a collection removes that ID from posts.

- [ ] **Step 4: Run shared typecheck and unit tests**

Run: `pnpm --filter @retrodesk/shared typecheck && pnpm --filter @retrodesk/shared test:unit`

Expected: PASS.

- [ ] **Step 5: Commit the operations**

Commit: `feat: add canonical collection operations`

### Task 2: Collection authoring in the IG editor

**Files:**
- Create: `apps/web/src/features/modules/instagram/CanonicalCollectionEditor.tsx`
- Modify: `apps/web/src/features/modules/instagram/index.tsx`
- Modify: `apps/web/src/features/modules/types.ts`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/src/features/editor/DesktopCanvas.tsx`
- Modify: `apps/web/src/features/site/MobileScreen.tsx`
- Modify: `apps/web/src/features/site/WindowRenderer.tsx`
- Modify: `apps/web/src/styles/ig.css`
- Test: `tests/e2e/oc-profiles.spec.ts`

- [ ] **Step 1: Add a failing reload test**

Create a collection, edit title/description/visibility, select and order posts, reload, and assert the collection and each post's reverse membership survive.

- [ ] **Step 2: Thread canonical collections through `ModuleCtx`**

Parse `CollectionEntityV2Schema` in `EditorPage`, pass `collections` through desktop/mobile renderers, and keep `updateContent` as the only mutation boundary.

- [ ] **Step 3: Implement the focused editor**

Show collections for the selected OC. Provide create/delete/up/down controls, title, description, published toggle, and an ordered checklist of that OC's posts. Selection commits via `setCollectionPosts`; invalid operations surface a visible alert.

- [ ] **Step 4: Run focused E2E and typecheck**

Run: `pnpm typecheck && pnpm exec playwright test tests/e2e/oc-profiles.spec.ts --grep "collection authoring"`

Expected: PASS.

- [ ] **Step 5: Commit the editor**

Commit: `feat: add instagram collection authoring`

### Task 3: Pinned, collection, and natural-ratio visitor presentation

**Files:**
- Modify: `apps/web/src/features/modules/types.ts`
- Modify: `apps/web/src/features/modules/instagram/profileDirectory.ts`
- Modify: `apps/web/src/features/modules/instagram/IgPreview.tsx`
- Modify: `apps/web/src/features/modules/instagram/useIgSession.ts`
- Modify: `apps/web/src/styles/ig.css`
- Test: `apps/web/src/features/modules/instagram/profileDirectory.test.ts`
- Test: `tests/e2e/oc-profiles.spec.ts`

- [ ] **Step 1: Add failing public visitor tests**

Assert pinned posts appear before regular posts, the Collections tab exists only when published collections contain public posts, selecting a collection filters to its ordered posts, and draft collections/posts never appear.

- [ ] **Step 2: Expose canonical collections through the public directory**

Add parsed published collections to each `ProfileDirectoryEntry`. Preserve the projected ordering and filter dead post IDs defensively.

- [ ] **Step 3: Add the third profile tab and pinned section**

Extend the per-profile tab state to `grid | list | collections`. Render a labelled pinned strip only when pinned posts exist. Render collection cards with title, description, item count, and an accessible open button; opening a collection shows its ordered post grid plus a back control.

- [ ] **Step 4: Preserve detail media ratio**

Grid cells remain square crops. Post details use `media[index].aspectRatio` when present and otherwise an image element with `width: auto`, `height: auto`, `max-*` constraints and `object-fit: contain`. Add a separate `.ig-media.detail` style so feed cards remain stable.

- [ ] **Step 5: Run focused responsive E2E**

Run: `pnpm exec playwright test tests/e2e/oc-profiles.spec.ts --grep "collections|natural ratio|pinned"`

Expected: PASS at desktop and phone widths.

- [ ] **Step 6: Commit visitor presentation**

Commit: `feat: present pinned posts and collections`

### Task 4: Capacity, accessibility, and release verification

**Files:**
- Modify: `tests/e2e/oc-profiles.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`

- [ ] **Step 1: Add the 60-post long-Chinese fixture**

Generate sixty published posts with long CJK titles/captions, mixed media ratios, multiple collections, and a draft post. Verify 60 grid buttons, no draft leakage, lazy `img[loading=lazy]`, keyboard scroll-to-bottom, and no horizontal overflow at 320/375/390/430 mobile and 360/480/720 inner-window widths.

- [ ] **Step 2: Run the complete verification gate**

Run:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
git diff --check
```

Expected: all commands PASS. Wrangler's sandbox log warning is non-blocking only when the dry-run prints `Done` and exits zero.

- [ ] **Step 3: Perform independent spec and quality reviews**

Compare each Issue #20 checkbox against code and test evidence. Fix every blocker and rerun the affected gate.

- [ ] **Step 4: Deploy and smoke-test staging**

Deploy the API only if shared/API output changes require it; deploy Pages using the preserved staging runtime values. Verify `/api/health`, canonical bundle hash, public desktop/mobile IG, collections, natural-ratio detail, and scrolling.

- [ ] **Step 5: Update Issue #20**

Record commits, exact test totals, Worker/Page deployment IDs, smoke-test URLs, and checkbox evidence. Close Issue #20 only when all acceptance items are proven.

