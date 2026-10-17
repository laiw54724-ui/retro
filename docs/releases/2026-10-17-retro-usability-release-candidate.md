# Retro Q0 — integrated usability candidate

This file supersedes the earlier partial-candidate notes. It records the code
boundary and reproduction procedure, not an automatic declaration of acceptance.
The final verified commit, CI run, screenshots and remaining failures belong in
the candidate PR and its immutable verification artifact. No source-branch test
counts are added together to imply integrated coverage.

## Source graph and ownership

| Source | Pinned commit | Treatment |
| --- | --- | --- |
| main / already merged PR #48 | `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2` | Preserve catalog scrolling and focus scrim |
| previous integration candidate | `61aa099fd78204e15d9968f8d47d73addcf6a364` | Includes #38 / #47 / #59 / #60 |
| PR #63 mobile gate | `bdc50f55d2507dd9a734c0413e8e3fba45e8d013` | First parent; complete sibling-FAB selectors and 390px remain |
| PR #61 usability batch | `3cbfc2c9f2e4e4927c1300381a2ba3e5b4ee10ef` | Second parent; actual three-way merge, not a new implementation |
| PR #59 / Issue #43 media | `2fc71457e2ffab6dea9ec1d7e8b9c0e8c878bf2d` | Ancestor of first parent; queue, stable targets, caption/alt retained |
| PR #60 / Issue #49 chrome | `7998764bf4e4917d50a76ec8a44907a3b85da115` | Ancestor of first parent; structure, slots and state retained |
| PR #38 appearance P1 | `d47e798bd6cc5bff8f8776748be663b32b058332` | Ancestor of both sources; do not cherry-pick again |
| PR #47 operations | `653357373e28dac518d7cb522b497c70cc2e2bc3` | Ancestor of both sources; keyboard, focus and minesweeper retained |

The isolated worktree was created from main, fast-forwarded to #63, then merged
with #61. The nine conflicts were reviewed in RightPanel, Gallery, IconPicker,
Links, MobileScreen, VisitorDesktop, EditorPage, editor-media and explorer tests.
The previous checksum-pinned integration overlay was only a reviewed handoff:
its outdated release note was not used, and the actual runtime/test changes below
were added after inspection. No source branch, original worktree, local Mac files,
branch protection or deployment configuration was reset or overwritten.

## Included product behavior

- Full-viewport portal gallery viewer, contained images, inert background,
  Escape/arrows/Tab handling, return to opener and single-image controls.
  Independent gallery `alt` uses nullish fallback; empty alt stays decorative.
- Existing native/uploaded music plus explicit click-to-load official Spotify and
  YouTube frames. Switching sources, close, minimize, back and leaving dispose
  media. Unsupported/error cases retain the original-site action. There is no
  server proxy, audio extraction or claim that iframe load proves playback.
- Explorer selection/open separation, drag and accessible move dialogs, full
  paths, confirmed deletion and undo. Target deletion removes precisely affected
  shortcuts in the same transaction; save/reload/public without OC is covered.
- Three bundled icon sets: Haiku 102, CC0 pixelart-icons 64, Pixelarticons Free 165,
  plus 13 original built-ins. Categories/search/purpose, stable IDs, local preview,
  apply/cancel/default, own uploads and missing-ID fallback remain available.
  The optional Windows pack stays excluded from default/release assets.
- #43 session upload queue with real item states, partial retry/order retention,
  stable site/window/item writes, no invented byte percentage, and scoped basic
  document/gallery/links/about editors.
- #49 Classic 95 / Classic 98 / Compact 98 WindowChrome, slots, preset controls,
  preview/cancel/apply/reset, shared appearance and persistent content state.
  Demo Paint/Recorder shells are not new drawing/recording engines.

## Integration fixes discovered during review

1. Preserve the new icon-library UI and #43 upload queue together. Upload results
   stage a preview; only Apply writes content. The dialog invalidates pending AND
   completed-but-unapplied selections after history travel, reload, permission
   loss, source change, deletion/recreation or site change. Explorer folder versus
   shortcut identity is explicit, even if IDs match; updates read current data.
2. Render protected uploaded icons through the authenticated asset resolver,
   never `img src="retro-asset:..."`; keep stable references in stored JSON.
   Failed bundled/remote image icons have semantic fallbacks rather than broken
   images. Icon E2E now checks actual rendered image pixels, not CSS storage form.
3. Accept ephemeral authorized `blob:` playback URLs inside the native runtime,
   without permitting blob URLs in the canonical source schema. A generation-
   checked resolver/play promise cannot revive audio after close, pause, timeout
   or a newer native/embed selection. Invalid new URLs stop the old source.
4. Unmount an active embed synchronously before native playback. Public pages
   mount only the current desktop OR mobile host, not two CSS-hidden app trees.
   Explicit preview entry stops background audio; native Audio identity remains
   independent of window chrome, appearance and same-source playback controls.
5. Validate scope for Explorer-only documents as well as OC-backed documents.
   Legacy v1 transfer exports now normalize local references and import confirm
   rebinds them to the new site. Coherent old v1 packages are safely normalized
   only when semantic migration validates their targets; mixed/dangling scopes
   are rejected rather than silently stripped. Both v1/v2 combined fixtures keep
   chrome, all three icon IDs, provider sources and caption/alt distinctions.
6. Retain #63 mobile sibling-FAB targeting and geometry assertions. Preserve
   existing tests while adjusting selectors to the actual portal/dialog layout.

7. Uploaded window/link/Explorer icons are included in transfer media notices.
   Import preview derives missing private bytes from the validated document, not
   merely a user-supplied manifest. Older or edited manifests cannot omit the
   required re-upload acknowledgement; supplied provenance remains unchanged and
   no private asset bytes are copied or published by acknowledging the warning.

## Verification strategy and reproduction

During development only focused typechecking, media/music/icon/reference tests
and combined API/transfer tests run. Full verification occurs once the candidate
is frozen, and again only when a discovered failure requires a changed candidate.

The development container has Node 22.23.3, pnpm 10.18.2 and frozen dependencies
obtained via an authenticated, read-only GitHub artifact. This is an isolated
checkout, not the user's Mac. Its system Chromium rejected localhost navigation
with `ERR_BLOCKED_BY_ADMINISTRATOR`; that run was stopped and is NOT a pass.
No browser policy was changed. Browser validation is performed in GitHub-hosted
Linux with the repository's pinned Playwright browsers.

The candidate workflow records exact HEAD/tree, dependency lock hash and tools;
executes the unchanged full gate and dedicated visual suites; checks tracked code
is unchanged; and uploads separate logs and test attachments. It is read-only and
contains no deployment credentials. Full E2E is no longer repeated automatically
for every ordinary PR: the existing fast PR CI remains, and the full workflow is
restricted to explicit integration-candidate pushes or a manual run.

```sh
corepack prepare pnpm@10.18.2 --activate
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium webkit
pnpm lint
pnpm verify:contributor
pnpm exec playwright test --config=playwright.chrome.config.ts --project=chrome-linux --workers=1
pnpm exec playwright test --config=playwright.chrome.config.ts --project=chrome-webkit --workers=1
git diff --exit-code && git diff --cached --exit-code
```

The nine existing screenshot cases intentionally run in the dedicated Linux
project, not the general Chromium project. Their skip in the general project is
not acceptance; the dedicated 27 unchanged PNG baselines must also pass. Do not
update them merely to make integration green. Public/editor/preview behavior,
320/375/390/430px and actual state/round-trip assertions remain required.

## API-first staging rollout and rollback

No new SQL migration or schemaVersion bump is introduced. These additive fields are **strict** in every reader that
predates them:

| Field | Required preservation |
| --- | --- |
| document image `caption?` | Absent means legacy alt-as-caption; empty suppresses caption |
| gallery image `alt?` | Absent falls back to caption/title; empty remains decorative |
| `window.chrome?` | Missing remains legacy default; resetting removes only chrome |
| Explorer folder/shortcut `icon?` | Missing uses semantic default; stable set:name IDs survive |
| `providerEmbed` source | Validated provider/type/ID and original URL; never arbitrary iframe HTML |

### Read -> edit something else -> save (verified, no loss and no noise)

- `tests/e2e/compat-roundtrip.spec.ts` loads a legacy v1 document and a canonical v2 document that carry **every**
  field above through the real editor, renames an unrelated window, waits for the autosave, and compares the saved
  body with the source: only the rename (and the selection's z-order raise) differs. A third case loads an *old*
  document that has none of the fields and asserts the save adds none of them (no `chrome`, no `providerEmbed`, no
  library icon ids), so an old document is never made unreadable for an old reader by merely opening and saving it.
- `apps/api/test/draft-validation.test.ts` asserts the API stores the submitted v1 and v2 drafts unchanged.
- `packages/shared/test/additive-fields-public.test.ts` asserts the public projection keeps the fields.
- `packages/shared/test/site-transfer.test.ts`, `tests/e2e/transfer.spec.ts`: export/import keep them.

### Compatible versions and rollback targets (explicit)

| Component | Compatible reader/writer (target after rollout) | Valid rollback target |
| --- | --- | --- |
| API Worker | the Worker built from the final candidate SHA; the version id must be recorded at deploy time | **none older than itself** once any document with a new field was saved |
| Web | the Pages build of the same SHA | **none older than itself**, same condition |
| previously recorded staging versions (Worker `ca4cf50c-f3fc-4ad1-9376-b2d7583e38bf`, Pages `5205e370-f4f4-4b83-99cc-80b5bdb42917`, built before the icon library/integration) | not compatible readers | valid **only before** any new-field document exists, and only after the scan below finds none |

Older strict readers reject (API) or fail to load (Web) a document containing any of the fields. Therefore a previous
deployment is **not** a rollback target after new writes. Deleting user fields is not an acceptable default, and
nothing here strips them.

Before any rollback to an older build, run this read-only check on the staging database (it only counts):

```sql
select count(*) as docs_with_additive_fields
from sites
where draft_document::text ~ '"(chrome|providerEmbed)"|"icon": ?"[a-z0-9]+:[a-z0-9-]+"'
   or published_document::text ~ '"(chrome|providerEmbed)"|"icon": ?"[a-z0-9]+:[a-z0-9-]+"';
```

The pattern is deliberately conservative (it also counts window/link icons using library ids, which older readers would
actually accept). A non-zero count (or unknown) means: roll forward to a fixed build of this line instead. Caption/alt are not caught by
that pattern because an old document may legitimately contain `alt`; they are covered by the strictness table above.

**Blocker for production, not for disposable staging:** there is no emergency "tolerant older reader" build. If a
rollback target older than this line is required before production, it must be created first as a separate, reviewed
change (a build of the previous line whose schemas accept and preserve these fields), then verified with the
round-trip spec above. Until then the staging acceptance must use disposable sites only, and an incident response is
"roll forward", never "roll back".

### Rollout order

After the same commit's full checks and review succeed:

1. Record the CURRENT Worker deployment/version and Pages deployment/source SHA separately; back up disposable
   acceptance-site documents.
2. Deploy the **compatible API Worker** (final candidate SHA) first. Confirm health; read old and new v1/v2 documents;
   save an old document and a document with every additive field; reload both; publish projection; cross-site
   rejection. The production account/project/bucket are not part of this rollout.
3. Only then deploy the **Web** built from the same SHA with matching staging configuration. Check the real Pages CSP,
   public module/asset paths and loaded bundle identity. Vite tests alone do not apply Pages `_headers`.
4. Smoke on a disposable authenticated site: edit, publish and anonymous public page on desktop and phone; create/edit/
   upload/partial retry; unauthorized users cannot read drafts/private assets or mutate other sites.
5. Record the new Worker version id and Pages deployment id as the compatible rollback target.

Legacy transfer repair does not migrate stored sites automatically; it normalizes the previewed import package and
requires the same digest on confirm.

## Staging status and genuine blocker

A read-only `staging` preflight was run: https://github.com/laiw54724-ui/retro/actions/runs/39048081647. It stopped
because `CLOUDFLARE_API_TOKEN` was not available to the workflow.

Non-sensitive inspection of the repository (names only, nothing printed or changed):

- GitHub environment `staging` exists (no protection rules). Its **secrets** are `CLOUDFLARE_ACCOUNT_ID` and
  `SUPABASE_ANON_KEY`; **`CLOUDFLARE_API_TOKEN` is not defined** in `staging` (or at repository level, where no secrets
  exist). Its variables are `API_URL`, `ASSET_BASE_URL`, `DEPLOY_ENABLED`, `SUPABASE_URL`, `WEB_ORIGIN`;
  `DEPLOY_ENABLED` is `false`, so pushes to `main` do not deploy.
- `.github/workflows/deploy-staging.yml` and the preflight read the token as `secrets.CLOUDFLARE_API_TOKEN` inside
  `environment: staging`, so it must be created as a **staging environment secret** with that exact name.
- No `production` environment exists; production is not part of this rollout.

Current Worker/Pages versions therefore remain **unverified by CI**. Minimum maintainer steps: create a Cloudflare API
token scoped to this account with Workers Scripts: Edit, Pages: Edit and R2: Edit, store it as the `staging`
environment secret `CLOUDFLARE_API_TOKEN` (never in chat or git), then run the staging preflight again.

## Exclusions, manual acceptance and issue closure

Q0 does not integrate #56 i18n or #57 OC/IG workspace yet; they retain their queued
positions in #55. #58 is design-only. Full #29/#30/#31 (including SoundCloud),
#35/#36 appearance/templates, #41/#42 presentation/navigation, remaining #44/#45,
#50–#54 actions/image/layouts/Paint/Scene and full #33 translations remain open.

Real Safari/iOS/Android, native IME/assistive-technology checks, logged-in Spotify
full playback/cookie/region behavior, real R2/Supabase and deployed CSP are not
substituted by Chromium/WebKit mocks. No claims of complete platform support or
production acceptance follow from this candidate. Inspect screenshots, and retain
unmet mandatory issue criteria until recorded manual acceptance exists.

After this candidate is reviewed and accepted, #38/#47/#59/#60/#61/#63 can be
considered covered by content/ancestry, but do not close source PRs automatically.
#48 is already in main. Close functional issues only on full DoD and main/staging
acceptance evidence; #35 P1 is not all #35, Spotify/YouTube is not all #31, and
neither a design document nor a green build completes #54/#55.
