# IG editor flow — audit-directed batch

Base: main `f11ad8d` (includes #121/#124). Independent branch/worktree: `codex/ig-editor-flow` / `retro-ig-editor-flow`.

Audit: [F02, F05–F08](https://github.com/laiw54724-ui/retro/blob/a5a57ac90ee5ec8d3fe82709f2a9aad1b1c3bcf5/docs/quality/ux-audit-2026-10-19/README.md).

## What was real

- The entry selector changed `window.content.profileRef` while its label only described the character being edited. The persisted operation is unchanged; the compact label now says “此視窗入口角色”. Add/search/duplicate tools live under Manage characters.
- At 320px the upload toolbar, explanations and filters pushed the first post below the viewport. Posts now start with New post, one search input, collapsed filters and the list. New post creates the existing empty canonical draft; file/URL additions happen inside that draft.
- Highlight and collection editors were stacked and auto-expanded. An explicit two-way switch keeps one category visible. Each category starts with a list and opens a focused editor with Back.
- Done editing unmounted local unfinished fields. The memory-only IG session now retains text/numeric/link drafts, image source drafts, pending media-addition URLs and stable custom-field row identities. Inline Cancel restores the canonical field. Reload, site/access changes and undo/redo clear the cache, including while the editor is unmounted. Upstream source values take precedence over drafts whose base no longer matches.

- Phone reorder/delete controls were too small, and repeated accessible names lacked item context. They now have at least 44×44px targets, entity names or sequence numbers, explicit reorder actions and non-overlapping wrapped rows. Task/category tabs also have 44px targets. Active search/filter clearing stays visible outside the collapsed filters.

Primary title/caption/images stay visible in a post editor; date/location and fictional interactions are collapsed below them. Existing five task categories remain. Visited bodies and category panels stay mounted, scoped searches/selections are retained, Back restores list focus/scroll, and preview has an explicit return action preserving task context and source input focus.

## Visual evidence

Before captures use the frozen #124 source (`7670b6b`) on a fresh local server. After captures use this worktree on main `f11ad8d` plus this patch, at 900px height (baseline captures were 950px). The shell's Paint button is an unrelated main integration difference; the IG comparison is the relevant evidence.

| Width | Before | After |
| --- | --- | --- |
| Desktop 1400 | [Before](ig-editor-flow/before-posts-1400.png) | [After](ig-editor-flow/after-posts-1400.png) |
| 320 | [Before](ig-editor-flow/before-posts-320.png) | [After](ig-editor-flow/after-posts-320.png) |
| 390 | [Before](ig-editor-flow/before-posts-390.png) | [After](ig-editor-flow/after-posts-390.png) |
| 430 | [Before](ig-editor-flow/before-posts-430.png) | [After](ig-editor-flow/after-posts-430.png) |

Additional evidence: [focused post + recoverable source error](ig-editor-flow/post-editor-390.png), [invalid Handle after Done editing/re-entry](ig-editor-flow/retained-draft-390.png), [collections alone at 320px](ig-editor-flow/collections-320.png), phone touch controls at [320](ig-editor-flow/touch-controls-320.png)/[390](ig-editor-flow/touch-controls-390.png)/[430](ig-editor-flow/touch-controls-430.png).

## Actual verification

All browser tests use mocked authentication/site/assets/save APIs and local Vite, Chromium, one worker, zero retries. Fresh ports 5297/5298 with `CI=1` disable server reuse. No live staging/production requests.

- **91 unit tests passed**: draft session (8 new), draft validation (5), canonical media (24), avatar media (12), locale (36), resource parity (6).
- **46 distinct functional browser cases passed across focused slices**: 10 new IG flow cases, 11 existing validation/IME cases, 6 avatar/source recovery cases, 6 batch recovery cases and 13 existing OC authoring cases. Final pending-status addition: 21/21 flow + validation/IME cases. Prior affected runs: 13/13 touch/layout/batch/authoring cases, then 10/10 new flow cases at exactly 900px viewport height. Earlier runs: 18/18 flow + validation; 20/20 flow + upload/source + delayed-post regression; earlier authoring contract run passed 12/13 OC cases, with its one corrected fixture passing in the latest 20-case run.
- The new task cases cover first-post visibility at 1400/320/390/430, one visible editor, Back focus, unchanged saved document/history for navigation, preview source-draft/scroll/focus retention, highlight/collection switching, Handle re-entry/cancel/reload, image URLs, pending carousel URL and custom-field name re-entry. Three touch-emulated cases assert target dimensions, item-specific names, first-post visibility, no horizontal overflow and successful post/media/highlight reorder/delete taps at 320/390/430px.
- Existing recovery cases cover partial success, retry in selection order, cancelled/hung/queued files, repeated same-file inputs, deleted draft non-resurrection, original OC ownership and deleted/retargeted highlight stale completion. Upload adapter/queue implementations are unchanged.
- Existing authoring cases cover role add/search/duplicate/retarget, 320/375/430 keyboard reachability, crop/media persistence, collection membership/order/privacy, filtered draft editing, per-role pending URLs and fictional social editing.
- Four baseline capture cases passed separately; screenshots were visually inspected.
- Web TypeScript check, secret audit and `git diff --check` passed. Full suite/build intentionally deferred to coordinated integration.

Commands used: `corepack pnpm --filter @retrodesk/web exec vitest run` with the six named unit files; focused `corepack pnpm exec playwright test` invocations for `ig-editor-flow`, `ig-validation`, `oc-image-recovery`, `ig-batch-media-recovery` and authoring cases from `oc-profiles`; `corepack pnpm --filter @retrodesk/web typecheck`; `node scripts/audit-secrets.mjs`.

Earlier iteration issues were corrected, not counted as passing: a reused port served another checkout (those captures discarded); eager session initialization hit the store/registry import cycle (now lazy); the mobile test assumed an unavailable toolbar Undo button (now asserts actual history); a relative test locator was malformed; the delayed-post fixture needed an existing other-OC post for the new per-post URL flow. The final touch-target slice also exposed CSS specificity overriding tab height and test locators made ambiguous by improved accessible names; both were corrected. All affected cases subsequently passed.

## Integration risks and limits

- Shared runtime touch: `features/modules/ui.tsx` adds an optional controlled draft-state prop to `ImageUrlField`. Default callers retain their local state/validation behavior. Other runtime changes are confined to the IG directory; locale changes are only `instagram.json`. `oc-profiles.spec.ts` and the three prior IG recovery/validation suites now use the new entry paths rather than assuming expanded forms.
- Pending-draft/save-status contract for #133: import `useIgHasPendingDrafts` from `instagram/useIgSessionValue`. It subscribes to `getIgDraftSession().subscribeControls` with boolean snapshot `getHasPendingDrafts`, survives editor unmount, and includes cached text/numeric/link/source input plus pending post/highlight URL additions. Use it to qualify canonical saved status (for example “有效內容已儲存；IG 有未完成輸入，僅保留在此分頁”). It never writes the document, history or save state. IG itself displays a localized explicit unsaved-local-input indicator. Shell consumption after Done is parent integration work; this PR does not edit the other worker’s MobileScreen. The snapshot is conservative across all cached IG scopes in this tab, including retained buffers whose entity was later removed; reload/history/site/access reset clears it.
- MobileScreen integration contract: no new hook is required. Keep `inlineEdit`, `selectedId`, `openId` and the mounted editor unchanged when opening/closing settings. Drafts also survive editor unmount/re-entry; valid blur/Enter commits, invalid input remains local until correction/Cancel, and reload/site/access/history changes clear it. The F11 label worker will need to update new test selectors from `編輯此視窗`/`完成編輯` to `編輯內容`/`完成` at integration. Its settings return only closes the sheet and restores titlebar focus, which is compatible. This PR does not touch MobileScreen or editor locale strings.
- The entry selector still assigns the window's entry character. This batch does not introduce a separate browsing/editor character model.
- Draft retention is in-memory for this browser tab. It is not durable recovery after refresh/browser close; the UI says so. Navigation context itself resets on a full editor remount, but unfinished canonical IG fields remain recoverable on re-entry. Legacy-only `IgEditForm` image fields are outside this canonical flow.
- Existing transport cannot abort an already-started upload; cancelled/stale results are ignored by existing ownership guards. Existing top-level upload-error-banner clearing is unchanged.
- Browser evidence is Chromium with emulated viewport/touch; native devices and other browser engines were not tested.
- No tutorial overlay or public IG redesign. Shared shell dialog/undo issues are separate work. No image gates, server fetch/proxy expansion, schema/migration, Paint changes, deployment or staging-403 bypass. This does not complete the broader #51 image-window release acceptance.
