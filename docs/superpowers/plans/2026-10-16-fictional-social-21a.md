# Fictional Social 21A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-authored, same-site OC follows, named likes, ordered character comments, structured extra counts, and public people lists without introducing real collaboration or persistent visitor interactions.

**Architecture:** Extend v2 with a strict `followEdges` entity list and additive structured fields on profiles/posts. Keep all mutations in pure shared operations that validate the complete v2 document and site scope. The editor consumes those operations through the existing `updateContent` history/autosave boundary; public projection removes draft actors before the web directory derives counts and lists.

**Tech Stack:** TypeScript, Zod, React 19, Vitest, Playwright, Vite, Cloudflare Pages.

---

### Task 1: Social schema, migration, selectors, and projection

**Files:**
- Modify: `packages/shared/src/site-versioning.ts`
- Modify: `packages/shared/src/public-projection.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/social-selectors.ts`
- Test: `packages/shared/test/site-versioning.test.ts`
- Test: `packages/shared/test/public-projection.test.ts`
- Create: `packages/shared/test/social-selectors.test.ts`

- [ ] **Step 1: Write failing schema/migration tests**

Cover legacy labels `"1.2K"` and `""` remaining unchanged, new nullable `otherFollowerCount`/`otherFollowingCount`, post `namedLikerIds`/`otherLikeCount`/`actorComments`, and default empty `entities.followEdges`.

- [ ] **Step 2: Add strict additive contracts**

```ts
export const FollowEdgeV2Schema = z.object({
  kind: z.literal("follow"), id: BoundedId, siteId: BoundedId,
  fromProfileId: BoundedId, toProfileId: BoundedId
}).strict();
export const ActorCommentV2Schema = z.discriminatedUnion("authorKind", [
  z.object({ id: BoundedId, authorKind: z.literal("profile"), authorProfileId: BoundedId, text: z.string().max(1000) }).strict(),
  z.object({ id: BoundedId, authorKind: z.literal("legacy"), legacyAuthorText: z.string().max(64), text: z.string().max(1000) }).strict()
]);
```

Profile structured extra counts are nullable and default `null`; `null` means display the preserved legacy label without parsing it. Post fields default to empty named actors/comments and zero extra likes. Include `followEdges` in document scope validation and profile referrer/retarget handling.

- [ ] **Step 3: Implement pure selectors**

```ts
export function socialCounts(document: SiteDocumentV2Input, profileId: string): {
  followerIds: string[]; followingIds: string[];
  followers: number | null; following: number | null;
};
export function postSocial(document: SiteDocumentV2Input, postId: string): {
  namedLikerIds: string[]; totalLikes: number; actorComments: ActorCommentV2[];
};
```

Selectors dedupe IDs, include only same-site existing profiles, and return `null` total while the corresponding legacy count has not been converted.

- [ ] **Step 4: Project only public actors**

Filter follow edges unless both endpoints are published. Filter named likers and profile-authored comments to published profile IDs; keep legacy-text comments. Recompute public structured totals from the filtered lists plus public extra counts so draft actors cannot leak through counts or JSON.

- [ ] **Step 5: Run focused tests and commit**

Run `npm --prefix packages/shared run test:unit -- site-versioning.test.ts public-projection.test.ts social-selectors.test.ts` and `npm --prefix packages/shared run typecheck`.

### Task 2: Validated social operations

**Files:**
- Create: `packages/shared/src/social-operations.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/social-operations.test.ts`

- [ ] **Step 1: Write failing operation tests**

Cover add/remove follow, self-follow, duplicate edge, cross-site/missing actor, set named likers with dedupe, structured extra counts, add/update/delete/reorder profile/legacy comments, full-document validation, non-mutation, and stable typed diagnostics.

- [ ] **Step 2: Implement operations**

```ts
addFollow(document, { fromProfileId, toProfileId }, { siteId, id })
removeFollow(document, edgeId, { siteId })
setProfileExtraCounts(document, profileId, patch, { siteId })
setPostNamedLikers(document, postId, profileIds, { siteId })
setPostOtherLikeCount(document, postId, count, { siteId })
createActorComment(document, postId, input, { siteId, id })
updateActorComment(document, postId, commentId, patch, { siteId })
deleteActorComment(document, postId, commentId, { siteId })
reorderActorComment(document, postId, commentId, direction, { siteId })
```

Every operation validates input, same-site actor membership, semantic document integrity, and output; failure returns `{ ok:false, code:"invalid", diagnostics }` without mutating the input.

- [ ] **Step 3: Run focused tests and commit**

Run `npm --prefix packages/shared run test:unit -- social-operations.test.ts` and shared typecheck.

### Task 3: Owner interaction editor

**Files:**
- Create: `apps/web/src/features/modules/instagram/CanonicalSocialEditor.tsx`
- Modify: `apps/web/src/features/modules/instagram/CanonicalPostEditor.tsx`
- Modify: `apps/web/src/features/modules/instagram/index.tsx`
- Modify: `apps/web/src/features/modules/types.ts`
- Modify: `apps/web/src/styles/ig.css`
- Test: `tests/e2e/oc-social.spec.ts`

- [ ] **Step 1: Write failing editor E2E**

Create A/B/C profiles; select A follows B; set B's anonymous follower count; assign A/B as named likers; add one profile comment and one legacy-text comment; reorder, undo, autosave, reload, and verify exact document state.

- [ ] **Step 2: Build searchable relationship editor**

Expose “角色互動” below profile tools. Use labeled searchable checklists, never raw ID inputs. Authoring B's follower list writes `A → B`; following list writes `B → target`. Structured extra counts use nullable conversion controls that preserve `legacyFollowersLabel`/`legacyFollowingLabel` until the author opts in.

- [ ] **Step 3: Build post actor editor**

Inside each canonical post, add searchable named-liker checkboxes, explicit other-like count, and ordered comments with author selector (`profile` or `legacy text`), text, up/down/delete controls. All changes use `ctx.updateContent` history keys so editor undo/autosave remain authoritative.

- [ ] **Step 4: Run focused web typecheck/E2E and commit**

Run web typecheck and `playwright test tests/e2e/oc-social.spec.ts --grep "author"`.

### Task 4: Public people lists and truthful visitor interaction

**Files:**
- Modify: `apps/web/src/features/modules/types.ts`
- Modify: `apps/web/src/features/modules/instagram/profileDirectory.ts`
- Modify: `apps/web/src/features/modules/instagram/useIgSession.ts`
- Modify: `apps/web/src/features/modules/instagram/IgPreview.tsx`
- Modify: `apps/web/src/styles/ig.css`
- Test: `apps/web/src/features/modules/instagram/profileDirectory.test.ts`
- Test: `tests/e2e/oc-social.spec.ts`

- [ ] **Step 1: Write failing public E2E**

Verify A appears in B's followers, the edge disappears from both sides when removed, liker A/B rows navigate to their OC pages and back, anonymous extras render as “另有 N 位虛構角色（未設定名單）”, ordered actor comments persist, and draft actors never appear in labels/counts/DOM/public JSON.

- [ ] **Step 2: Extend public directory projection**

Include resolved follower/following entries, structured/legacy display counts, named liker directory entries, and actor comments. Derive only from the already-public v2 projection; never infer actors from matching text.

- [ ] **Step 3: Add people-list session route**

Add a `people` screen with history metadata for followers/following/likers. Rows navigate through `navigateProfile` and back restores the list and scroll. Keep the “角色世界觀內容” label visible on profiles, people lists, and authored comments.

- [ ] **Step 4: Make visitor state explicit**

Follow/like/save/comment controls remain local state and display “僅本次瀏覽”. A visitor follow/like must not increment the owner-authored totals, mutate the v2 document, or claim cloud persistence. No invite/collaboration controls are rendered.

- [ ] **Step 5: Run focused tests and commit**

Run web unit tests, web typecheck, and the complete `oc-social.spec.ts`.

### Task 5: Batch release gate and staging

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`

- [ ] **Step 1: Review the complete diff against every 21A acceptance item**

Confirm legacy labels, dedupe/cross-site errors, public draft pruning, undo/reload, navigation/back, and session-only visitor behavior. Confirm 21B remains single-owner with no invite UI.

- [ ] **Step 2: Run the release gate once**

Run shared/API/web typecheck, all unit tests, full Playwright with one worker, shared/web build, API Wrangler dry-run, and `git diff --check`.

- [ ] **Step 3: Deploy and smoke test**

Build with verified staging Supabase/API environment, deploy Cloudflare Pages, then confirm canonical/immutable `200`, API health `200`, correct bundle config, author interaction labels, people-list labels, and absence of invite UI.

- [ ] **Step 4: Record evidence and update Issue #21**

Append exact commits/test totals/deployment IDs to verification.md. Close only the 21A milestone in the comment; keep #21 open until the separately planned 21B security milestone is complete.
