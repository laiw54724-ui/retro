# Usability batch 1 — integration candidate

Local branch `claude/usability-batch1` (not pushed, no PR, no comments, no new deploy). Staging is **not** production.

## Integrated work (SHAs)

| Source | SHA | How it is in the branch |
| --- | --- | --- |
| `main` (includes #48 `codex/editor-focus-layout`, head `e562799`) | `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2` | merge base, untouched |
| #38 `codex/appearance-foundation` | `d47e798bd6cc5bff8f8776748be663b32b058332` (commits `2499d5b`, `d47e798`) | merge commit `93c5bf0` |
| #47 `codex/component-operation-fixes` | `653357373e28dac518d7cb522b497c70cc2e2bc3` (commit `6533573`) | merge commit `e1da274` |

Both were merged with real merges (history kept, authorship intact) on top of #48; nothing was rewritten or reapplied.
Batch work lives in separate commits on top (gallery lightbox, music sources, Explorer, icon library, shortcut integrity).

## Staging as last deployed (read-only lookup; nothing deployed in this round)

| Part | Identifier | Built from |
| --- | --- | --- |
| Web, Pages project `retrodesk-staging` | deployment `5205e370-f4f4-4b83-99cc-80b5bdb42917` (`https://5205e370.retrodesk-staging.pages.dev`) | `6c75656` |
| API, Worker `retrodesk-api-staging` | version `ca4cf50c-f3fc-4ad1-9376-b2d7583e38bf` (deployed 2026-10-17T07:18Z) | the batch API/shared code as of `e724863` |

**Staging is behind this branch.** The icon library (`e21c118`) and shortcut-integrity work (`c03976a`) are not deployed.
The staging Worker's schema predates the optional Explorer `icon` field, so an Explorer folder/shortcut icon saved from a
newer web build would be rejected until the API is redeployed. Redeploy web and API together.
Cloudflare labels the Pages project's `main` deployments "Production"; this is the staging project, not the production site.

## Requirement mapping

| Request | Status | Evidence |
| --- | --- | --- |
| D. Open icon library (Haiku core, tstamborski CC0 generic, Pixelarticons Free) | done, small curated set: **102 + 64 + 165 = 331** icons (+13 built-in) | `docs/assets/open-icon-library.curation.json` (allowlist + exclusions), `.provenance.json`, `docs/THIRD_PARTY_ASSETS.md`, `THIRD_PARTY_NOTICES.md`, per-set `NOTICE.txt`; `tests/e2e/icon-picker.spec.ts` |
| Categories, zh/en search, thumbnails with names, current mark, preview, apply/cancel/reset, own uploads kept | done | picker spec; uploads tab selects but never replaces assets |
| Stable ids, assets shipped with the site, no install command for users | done | ids `haiku:folder`; files under `apps/web/public/icon-library/`; Windows pack stays an opt-in self-hosting note in a collapsed help |
| Reload, editor, public page, mobile, export/import, legacy fallback | covered | picker spec (reload, 320/390px, published page 1440/390), `site-transfer.test.ts` round-trip, `library.test.ts` (alias + removed-id fallback) |
| Shortcut deletion integrity | done; found a real stuck-save path | below |
| Music boundaries | documented and tested | `docs/MEDIA_EMBEDS.md` ("Effective settings and why"), `music-sources.spec.ts` |
| Candidate pinned, lint, verify:contributor, screenshots, limitations | this file + final message | |

### Shortcut deletion: what was wrong and what changed

Before: deleting a window (or character/post) that an Explorer shortcut points at left a dangling shortcut. The document
schema refuses dangling references, so autosave and publish stopped with "請先修正內容格式" until the author found the
broken tile and repaired or removed it. That was reachable by normal operation (delete a window).

Now every edit that would orphan shortcuts is held in the editor store (`pendingIntegrity`) and the author sees a list
(Explorer / folder path / shortcut / what it pointed at). Confirm removes the target **and exactly those shortcuts** in one
history step (undo/redo move both together); cancel changes nothing. It applies to all delete paths because it sits in
the single history choke point (desktop and phone window delete, canonical post delete, legacy Instagram post removal,
character delete). Replacing a character retargets its shortcuts instead of removing them. Shortcuts in other Explorer
windows are included; unrelated shortcuts and folders are never touched.

Also fixed on the way: a published v2 site without a character/Instagram window lost **all** Explorer shortcuts on the
public page (projection scope fell back to `"public-site"`); the scope now also comes from Explorer shortcut targets.

Tests: `packages/shared/test/explorer-integrity.test.ts`, `apps/web/src/features/editor/store.test.ts`, and in
`tests/e2e/explorer.spec.ts` list → cancel, confirm → save → undo/redo → reload, cross-Explorer, post deletion, public
page, phone 390px.

## Remaining limitations

- Real iOS/Android devices, logged-in Spotify full playback, third-party cookie behaviour: **not verified**.
- Browser-only verification so far is Chromium (Playwright) and a logged-out desktop staging check.
- The icon picker, shortcut integrity, and all fixes since `6c75656` have not been exercised on staging.
- Recent/favourite icons are deferred. Explorer drag-and-drop between windows is not part of this batch.
- Windows icon pack: still optional, user-installed, and excluded from redistributable builds.

## Proposed integration PR

One draft PR from `claude/usability-batch1` into `main`, containing the merges of #38 and #47 plus the batch commits.
Because #38 and #47 are ancestors of the PR branch, merging the integration PR marks both as merged by GitHub's ancestry
check; their branches then have no unmerged commits. Plan, pending the owner's approval:

1. Owner confirms. Then push `claude/usability-batch1` and open a **draft** PR titled "Usability batch 1 (integrates #38, #47)".
2. PR body lists the SHAs above, the requirement table, and "supersedes #38 and #47; do not merge them separately".
3. Leave a comment on #38 and #47 pointing at the integration PR (only after approval), and let them close when the PR merges.
   If either has new commits by then, rebase/merge them into the branch first rather than merging the old PR.
4. Squash is **not** recommended (it would hide the merged PR ancestry); use a merge commit.
5. Redeploy web + API to staging from the final merged commit and rerun the staging checks before calling anything released.
