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

No new SQL migration or schemaVersion bump is introduced in Q0. Compatible
readers still must precede writers for these additive strict fields:

| Field | Required preservation |
| --- | --- |
| document image `caption?` | Absent means legacy alt-as-caption; empty suppresses caption |
| gallery image `alt?` | Absent falls back to caption/title; empty remains decorative |
| `window.chrome?` | Missing remains legacy default; resetting removes only chrome |
| Explorer folder/shortcut `icon?` | Missing uses semantic default; stable set:name IDs survive |
| `providerEmbed` source | Validated provider/type/ID and original URL; never arbitrary iframe HTML |

After the same commit's full checks and review succeed:

1. Record the CURRENT Worker deployment/version and Pages deployment/source SHA
   separately; back up disposable acceptance-site documents.
2. Deploy the compatible API Worker first. Confirm health, old/new v1/v2 read,
   draft save with all fields, reload, publish projection and cross-site rejection.
   The production account/project/bucket are not part of this rollout.
3. Only then deploy Web built with matching staging configuration and exact
   source commit. Check the real Pages CSP, public module/asset paths and loaded
   bundle identity. Vite tests alone do not apply Pages `_headers`.
4. On a disposable authenticated site test create/edit/upload/partial retry,
   save/reload, publish and anonymous desktop/mobile access. Check unauthorized
   users cannot read drafts/private assets or mutate other sites.

Once new fields are saved, reverting API OR Web to a pre-compatible strict reader
can make documents unreadable or unsavable. Keep compatible readers and roll
forward; stopping a new writer alone does not make an old reader safe. Never
silently strip fields or overwrite a cloud conflict to force rollback. Legacy
transfer repair does not migrate stored sites automatically; it normalizes the
previewed import package and requires the same digest on confirm.

## Staging status and genuine blocker

A read-only `staging` environment preflight was actually run:
https://github.com/laiw54724-ui/retro/actions/runs/39048081647

It stopped at prerequisites because `secrets.CLOUDFLARE_API_TOKEN` was unavailable
to that workflow. Account ID, API/Web origins and Supabase client configuration
were present. No token value was printed, no security setting was changed, and no
API or Web deployment was attempted. Therefore current Worker/Pages versions are
**not verified**. The older versions quoted by source PRs are historical evidence,
not a current alias/version assertion. Configure the scoped token through GitHub
Secrets (never chat or git) before proceeding with the guarded API-first rollout.

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
