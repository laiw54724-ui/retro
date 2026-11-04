# Issue #43: media text and upload lifecycle contract

The shared schema design was [reported on Issue #43](https://github.com/laiw54724-ui/retro/issues/43#issuecomment-6232228734) before implementation. This document records the limited change for integration with the other editor work.

## Fields and existing data

| Content | New optional field | Absent field | Explicit empty string |
| --- | --- | --- | --- |
| Document image | `caption?: string`, maximum 300 characters | Render the existing `alt` as its historical visible caption. | Render no visible caption; `alt` remains independent. |
| Gallery image | `alt?: string`, maximum 300 characters | Keep the historical `caption || title` alternative-text fallback. | Use empty image alternative text intentionally. |

Neither optional field receives a schema default. Parsing and migration must preserve the distinction between absence and an authored empty value. Readers use `caption ?? alt` for document captions and `alt ?? (caption || title)` for gallery alternative text.

The existing document `alt` limit remains 300 characters. Existing gallery and IG captions retain their 1,000-character limit; legacy captions are not shortened to fit the new gallery alternative-text field.

New document image blocks from `makeBlock("image")` receive `caption: ""`. Filling in their alternative text therefore does not unexpectedly create a visible caption. When editing alternative text on an existing document image without a caption field, the editor should first preserve its current visible caption as `caption: previousAlt` in the same mutation.

The gallery editor displays an absent `alt` as an empty input with help explaining the inherited caption/title fallback. It does not copy the fallback into the input: an existing caption can be longer than the new 300-character alternative-text limit. Typing authors an independent value; the decorative-image action writes `alt: ""`; the fallback action resets `alt` to `undefined`, which JSON serialization omits. These actions do not change the visible caption or title.

## Scope and compatibility

- `DocumentBlockSchema` and the v2 `StrictDocumentBlockSchema` accept the optional caption.
- `GalleryImageSchema` accepts the optional alternative text. The strict v2 gallery schema continues to derive its fields from this schema.
- The original gallery fields are factored into a private base schema used by `IgPostSchema`. The gallery-only `alt` field is not part of the IG post shape. Strict canonical v2 posts reject it; permissive legacy parsing retains its existing unknown-key stripping behavior.
- `makeIgPost` retains its original output. OC alternative text remains in canonical `post.media[].alt`. Because `makeIgPost` still delegates to `makeGalleryImage`, the gallery factory must continue leaving its new optional `alt` absent unless those factories are separated in a later change.
- Existing document/gallery version adapters and public projection retain the new fields through their existing paths. No alternate publication or export representation is introduced.
- Upload task status stays in the editor's transient task controller; this schema change does not persist queues, files, progress, or retry state in the site document.
- Link targets remain on the existing URL/window contract pending #29. Store, registry, and global CSS are outside this contract change.

## Upload tasks and persistence

One editor session owns the shared sequential task queue. Changing the selected window preserves that queue. Each task reports only `queued`, `uploading`, `completed`, or `failed`, with actual item counts; the upload transport does not report bytes, so the UI exposes no estimated percentage.

An item bound to content becomes completed after its returned asset reference is applied through the existing store to the original site, window ID, window type, and still-current source or replacement slot. Icon-pack items complete when stored in the current site's library; they do not change a window icon. Content completion merges with the latest window data. A failed item can be retried independently while its file and target remain valid; successful siblings are not uploaded or committed again. Gallery insertion uses the original selection IDs to place a retry beside surviving siblings without restoring removed rows, overwriting edited metadata, or rearranging existing rows.

Invalidation releases the queue immediately instead of waiting for an abandoned request. Each attempt also has a configurable response timeout, defaulting to 120,000 ms. A timeout becomes a retryable failure, retains the file for an explicit retry, and explains that the original request can still finish in the asset library. The next task can proceed while that abandoned HTTP request remains pending. Each attempt settles independently: its late success or rejection cannot update content, alter the newer retry's state, or prevent the remaining queue from advancing. `whenIdle()` waits for queued/uploading tasks, not abandoned network requests.

| State or data | Lifetime and limits |
| --- | --- |
| Applied asset reference, caption, alt, and other authored fields | Part of the normal site document and store history. Existing autosave must finish before a page reload can recover the latest edit from the server. Public projection and export/import preserve the authored fields through their existing paths. |
| Queue entries, retryable `File` objects, attempt counts, and error text | Memory only for the mounted editor session. They are not saved to the document, browser storage, exports, or the server, and do not resume after a page reload. |
| Pending or retryable tasks after undo, redo, document reload, site/access change, or editor unmount | Invalidated; their late results cannot write into the restored or replacement document. Deleting a target or editing its source also invalidates the original task, even if undo later restores that target. Ordinary focus changes, unrelated edits, and autosave do not invalidate a valid task. |
| Upload requests already sent when their task is invalidated or times out | The current transport cannot abort the server request. A successfully stored but unapplied asset can remain in the owner's library; the task does not delete it or apply it later. Retrying can create another stored asset if the earlier request eventually succeeds. |
| Clearing a completed or failed task record | Removes the task record only. It does not delete a library asset or remove already authored content. |

## Protected image resolution

Protected references remain durable `retro-asset:` values in the document. `AssetSourceProvider` exchanges them for authenticated blob URLs only while rendering the editor; blob URLs never replace the stored references.

Each provider effect setup creates its own resolver and cache. Cleanup permanently disposes that resolver, revokes its object URLs, and prevents late requests from creating URLs. React StrictMode's setup/cleanup/setup replay therefore gets a fresh resolver rather than reusing the disposed instance. A site change stops exposing the old resolver during render, before effects run.

`useAssetSourceState` reports `empty`, `loading`, `ready`, or `failed`; the existing `useAssetSource` API remains a wrapper returning its resolved source. Protected requests that return `null` or reject become failed, while the brief wait for provider initialization remains loading. The hook compares both the original reference and resolver identity before returning a cached result, so the same reference cannot flash a previous site's blob or failure state. A ready result means source resolution succeeded; image elements still handle their own network and decoding errors.

## Integration order

Deploy compatible API and editor/public readers before enabling frontend writes of the new fields. Previously deployed strict v2 readers reject these fields, while older permissive v1 readers can silently strip them during parsing and a later save. An incompatible reader must not rewrite the document through a lossy fallback. No deployment is part of this change.

PR #47's gallery lightbox/focus changes share the gallery renderer; preserve both its interaction improvements and these caption/alt readers during integration. PR #38's appearance work overlaps editor and inspector surfaces that pass media targets. The navigation work in #29/#42 governs later destination and preview changes; this implementation continues the existing URL/window contract. These are coordination points, not a new runtime dependency on another feature branch.

## Contract verification

`packages/shared/test/media-semantics.test.ts` covers:

- Absent, empty, and nonempty fields in v1 and strict v2.
- New-field limits and invalid types without tightening existing caption limits.
- Migration, legacy view/merge, separate text edits, and JSON reload.
- Public projection retaining media text while continuing to filter draft OC profiles and posts.
- Owner-backup and public JSON export/import for both schema versions.
- The original accepted IG post keys and preservation of canonical OC media alternative text and crop metadata.

Final validation in the issue worktree (base `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`):

| Command | Result |
| --- | --- |
| `node scripts/audit-secrets.mjs` | Passed: 330 tracked/untracked paths and 2,679 reachable Git objects. No secret values printed. |
| `node scripts/audit-third-party-assets.mjs --release` | Passed: 2 confirmed bundled files; release exclusions clean. |
| `node scripts/audit-dependency-licenses.mjs` | Passed: 148 packages with asserted licenses. |
| `COREPACK_HOME=/tmp/retro-media-corepack corepack pnpm -r typecheck` | Passed for shared, API, and web. |
| `COREPACK_HOME=/tmp/retro-media-corepack corepack pnpm -r --if-present test:unit` | Passed: 285 tests (shared 87, API 106, web 92); 47 added by this issue. |
| `COREPACK_HOME=/tmp/retro-media-corepack XDG_CONFIG_HOME=/tmp/retro-media-xdg WRANGLER_LOG_PATH=/tmp/retro-media-qa/wrangler.log corepack pnpm -r build` | Passed for shared, web, and API dry-run bundle. No deployment. Existing Zod annotation and large-chunk warnings remain. |
| `node scripts/audit-secrets.mjs --artifacts-only` | Passed: 14 build artifact files. |
| Full Playwright suite, local Chromium fallback | 145 cases executed: 142 passed initially; the three failures described below passed in the targeted rerun. All 27 new browser cases passed in the full run. |
| Targeted rerun of the three failed browser cases | 3 passed in 9.6 seconds after fixing the test/environment causes below. |
| Desktop and narrow-screen visual/interaction checks | Document, gallery, about, and links covered at 320/375/430 px; long strings, empty/broken images, one active properties area, keyboard focus, and mobile bottom controls reviewed. |
| `git diff --check` | Passed. |

The new unit coverage includes 13 schema round-trip tests, 12 queue tests, 16 session/history/target tests, four destination-summary tests, and two additional resolver lifecycle tests. Browser cases exercise five uploads with one failure, retry order and preserved edits, undo/redo/reload/public projection, an in-progress image URL surviving an earlier retry, document block and avatar targeting, explicit icon reselection, and protected-image failures under the actual StrictMode app.

### Browser execution details and limits

The local runtime was Node 24.19.0, pnpm 10.18.2, and Playwright 1.64.1. The pinned Chromium download returned an unusable archive, so browser validation used the already available Chromium 141.0.7390.37 through a temporary config outside the repository. That config keeps the full `tests/e2e` directory, uses this worktree's Vite server on port 49317 with `--strictPort` and `reuseExistingServer: false`, and sets an explicit browser executable. It does not reuse another worktree's server.

Root-level legacy E2E tests import `@retrodesk/shared` without a root workspace dependency. `NODE_PATH` points to this worktree's `apps/web/node_modules` for the full run; no dependency or lockfile changes were made. The reproducible invocation with the local adapter is:

```bash
PLAYWRIGHT_PORT=49317 \
NODE_PATH=/workspace/scratch/bc9e4d8ce879/retro-media-editor/apps/web/node_modules \
node node_modules/@playwright/test/cli.js test \
  -c ../retro-media-validation.config.ts --workers=2
```

The first complete run omitted `PLAYWRIGHT_PORT`, causing the Google redirect assertion to expect 5173 while the application correctly used 49317. The public clipboard test also hardcoded 5173; it now derives the expected origin from Playwright's `baseURL`. The existing icon persistence test accepted the v1-to-v2 migration save before the icon edit's autosave; it now waits for the saved About icon value. Application auth/sharing and OC/IG UI were not changed to satisfy those assertions. Re-running only these three cases with the corrected environment and assertions passed all three; the already passing 142 cases were not unnecessarily repeated.

The contributor gate's audits, typecheck, unit tests, build, and artifact audit were executed individually, followed by the qualified browser run above. This is not a claim that the unmodified one-command gate or the pinned-browser CI run passed. The manual E2E workflow still needs the pinned browser and a resolvable root test dependency before release. Real-device Safari/Android and native IME composition were not tested.
