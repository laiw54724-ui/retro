# i18n foundation and integration contract

This is the incremental foundation for [#32](https://github.com/laiw54724-ui/retro/issues/32). Full business-module translation, terminology review, native Japanese/Korean review and the broader device matrix belong to [#33](https://github.com/laiw54724-ui/retro/issues/33).

## Scope and release status

| Locale | UI preference | Release selector | Current resources |
| --- | --- | --- | --- |
| Traditional Chinese | `zh-Hant` | Enabled | Core shell and examples |
| English | `en` | Enabled | Core shell and examples |
| Japanese | `ja` | Preview only, Beta | Core translation draft; no native-speaker sign-off |
| Korean | `ko` | Preview only, Beta | Core translation draft; no native-speaker sign-off |

Set `VITE_I18N_PREVIEW_LOCALES=true` when starting Vite or building a **review** build to enable Japanese/Korean. The same flag controls the selector, initial browser detection and accepted manual changes. Without it, a previously stored Japanese/Korean preference is ignored while choosing the first available browser locale or the default. This flag does not mean the product is fully translated; the selector explicitly explains the partial scope.

The migrated surfaces are the landing page, authenticated boot text, editor topbar/footer, left-panel tabs and add catalog, desktop Start/taskbar and mobile shell/add catalog. The empty `instagram` namespace is an extension point. Existing OC/IG editors, media workflows, appearance controls, collaboration/publish dialogs, auth/onboarding forms and detailed runtime errors are not fully migrated.

## Dependencies and resources

The original web package had no translation library. This change pins `i18next@26.4.7` and `react-i18next@17.0.20`, including their resolved dependencies in `pnpm-lock.yaml`. Their installed manifests declare MIT licensing, and the React/TypeScript peers accept the existing React 19 and TypeScript 5 versions. `docs/DEPENDENCY_LICENSES.md` is regenerated from the frozen install.

Resources live at:

```text
apps/web/src/i18n/locales/{zh-Hant,en,ja,ko}/{common,editor,instagram,music,errors}.json
```

`resources.ts` imports the small catalogs eagerly. There is no translation service, API credential, cookie, locale URL prefix or language-chunk fetch. Startup initializes one instance before rendering, and `I18nextProvider` keeps the same identity throughout the session. A later loader must retain this behavior and the safe change contract; do not add a locale React key or suspend/remount the editor.

The implementation follows the upstream [configuration](https://www.i18next.com/overview/configuration-options), [fallback](https://www.i18next.com/principles/fallback), [TypeScript](https://www.i18next.com/overview/typescript) and [React instance](https://react.i18next.com/latest/i18next-instance) contracts. `react.useSuspense` is disabled because every foundation namespace is ready before mount.

## Language detection and persistence

The order is:

1. A valid enabled language saved under `localStorage["retrodesk:locale"]`.
2. The first supported **and enabled** entry in `navigator.languages` (or `navigator.language` when the list is empty).
3. `zh-Hant`.

`en-*`, `ja-*` and `ko-*` normalize to their base UI language. Chinese tags—including `zh`, `zh-TW`, `zh-HK`, `zh-Hant-*`, `zh-Hans` and `zh-CN`—map to Traditional Chinese. The selector explicitly says that Simplified Chinese is unavailable and that its preferences use Traditional Chinese. Malformed and unsupported tags are skipped; they are not written back.

Only an explicit successful selection writes the preference. Merely detecting a browser language does not turn it into a permanent preference. Both access to `localStorage` itself and `getItem`/`setItem` failures are caught, so blocked storage still permits changes for the current session. The preference does not synchronize live across tabs; each tab initializes its own UI and a later reload reads the saved choice.

Use `changeLocale(locale)` from `src/i18n/index.ts` for manual changes. It returns `Promise<boolean>`, serializes requests from multiple selectors and saves only successful choices. The existing language remains readable on a failed change. `document.documentElement.lang` and `dir` update with the UI; no navigation or data load is needed.

## Consuming translations

Use hooks in the rendering component, not at module import time:

```tsx
const { t } = useTranslation("editor");
const { formatNumber } = useLocaleFormatting();

return <span>{t("shell.windowsCount", {
  count: windows.length,
  formattedCount: formatNumber(windows.length)
})}</span>;
```

`i18next.d.ts` enables namespace-aware keys and `strictKeyChecks`; `keys.typecheck.ts` contains negative compile assertions so a broken typing contract fails the existing web typecheck. JSON resources remain easy to extend. The unit gate checks exact namespace/key parity, nonempty leaf strings and interpolation-name parity in **all four** catalogs. English plural resources use `_one` and `_other`; the same keys exist in the CJK catalogs for parity, while i18next selects the locale's actual plural form.

Missing or empty locale keys fall back to English, then Traditional Chinese. If all catalogs lack a key, the UI receives a localized generic error, never the internal key, an arbitrary default server message or a resource object. This runtime safety is not permission to omit translations: the parity/build checks remain required.

`translateError(error, t)` in `i18n/errors.ts` demonstrates a whitelist of stable API codes. It deliberately ignores raw `message` and `details` values; unknown codes and legacy strings produce `errors.generic`. Other agents can add reviewed code mappings and safe interpolation parameters while migrating their own workflows. The current PR does not rewrite the API or audio coordinator, nor does it claim existing unmigrated error dialogs are localized.

## Author content and shared state

Never call `t()` on an OC name, bio, post, lyric, user tag, authored date, desktop name or saved window title. Interpolate such text as ordinary React text nodes when it appears inside a UI label. No HTML translation sink is introduced.

The locale is not a field in `SiteDocument`, a shared schema, the editor store, undo/redo history or a canonical OC entity. Rendering a translated catalog label does not change the registry object or its creation function. Existing saved titles and new-document defaults retain the current data contract; localized creation defaults can be considered separately when their owner implements them.

Do not key the App, routes, preview, editor, player or IG session by locale. Editor remounts reset history, and desktop/mobile unmount cleanup stops audio. The landing preview also memoizes its demo document so a language render cannot regenerate example window IDs. Known authored-content language tags should be assigned to those content regions by a future content-language model; visitor UI preferences must not overwrite them.

## Dates, numbers and fonts

`useLocaleFormatting()` exposes the current `locale`, `formatDate`, `formatTime`, `formatNumber` and `fontFamily`. Pure helpers are also exported from `i18n/format.ts`. Their Intl tags are `zh-TW`, `en`, `ja-JP` and `ko-KR`. Dates accept real `Date`/timestamp values, not arbitrary authored `worldDateLabel` strings. Callers supply a timezone when required; otherwise browser-local time applies.

Taskbars keep a compact 24-hour clock (`hourCycle: "h23"`) while their full-date tooltip follows the UI language. The `<time datetime>` value remains ISO machine-readable. Numbers and plural counts are formatted independently from literal IDs and content.

The font stack is applied only to translated UI through scoped styles. Cubic 11 remains first; Japanese adds Hiragino/Yu Gothic/Meiryo/Noto CJK JP, and Korean adds Apple SD Gothic Neo/Malgun Gothic/Noto CJK KR, then generic system fallbacks. No new font binary or network font download is shipped. Existing global CSS, `themeView` and saved theme settings remain unchanged.

Actual inspection of bundled `Cubic_11.woff2` with `fc-query` found the sample `日本語ひらがなカタカナ`, but no Hangul characters from `한국어 언어 설정`; the rare character `𠮷` was also absent. Chromium 153 screenshots of the Japanese/Korean landing and public-page samples showed readable Japanese and Hangul without missing-glyph boxes. This establishes sample rendering in that browser environment, not complete font coverage: the initial Linux host's font inventory did not identify a Japanese/Korean system family, and a configured stack or successful DOM/Intl test alone does not prove which fallback supplied a glyph. Native macOS/Windows/iOS/Android and rare-glyph review remain #33 acceptance work. Do not enable Japanese/Korean for general release on the strength of key parity alone.

## Coordination

Implementation started from fetched `origin/main` `aa8b75a` in the independent `feat/retro-i18n-foundation` worktree. The pre-change scope was reported on #32 before implementation.

| Shared surface | Integration boundary |
| --- | --- |
| `EditorPage.tsx` / #43, #44 | Topbar/footer/loading labels and selector only; no media or OC mutation logic |
| `LeftPanel.tsx`, `MobileScreen.tsx` / PR #38 | Tabs/add-catalog/mobile chrome only; preserve appearance preview and application logic |
| `DesktopTaskbar.tsx` / #49 | Start labels, locale/date UI and selector; arbitrary `statusLabel` remains backward compatible |
| `RetroWindow.tsx` / #49 | Untouched; its owner can adopt the new i18n API and add control keys in a follow-up |
| Registry, shared schemas, editor store, global CSS | Untouched; no integration prerequisite or migration |

The default Playwright context now specifies `zh-TW` because legacy interaction tests assert Traditional Chinese names. New i18n tests override the browser language where needed; changing the test baseline is not disabling production language detection.

## Verification

Use the repository's Node 22 and pnpm 10.18.2 toolchain:

```bash
pnpm install --frozen-lockfile
pnpm --filter @retrodesk/web test:unit src/i18n
pnpm typecheck
pnpm test:unit
pnpm build
NODE_PATH=./apps/web/node_modules pnpm exec playwright test tests/e2e/i18n.spec.ts tests/e2e/responsive.spec.ts
VITE_I18N_PREVIEW_LOCALES=true PLAYWRIGHT_PORT=5189 NODE_PATH=./apps/web/node_modules pnpm exec playwright test tests/e2e/i18n.spec.ts
```

Use a separate Vite server/port for the preview flag; do not reuse a running release server. Run the complete `pnpm verify:contributor` gate before requesting merge, as described in `CONTRIBUTING.md`.

### Execution record

The following checks ran for this change with Node **22.23.3** and pnpm **10.18.2**. They are local results, not a claim that remote CI or the complete contributor gate has passed.

| Check | Actual result |
| --- | --- |
| Frozen dependency install | Passed |
| New i18n unit suite | **60 passed** across detection/storage, resources, formatting and runtime behavior |
| Workspace typecheck | Passed for shared, API and web; includes negative translation-key compile assertions |
| Workspace unit tests | Passed for shared, API and web |
| Workspace build | Passed, including the API Wrangler dry run; no deployment |
| Dependency license report/audit | Passed; regenerated inventory contains 153 packages, including five new MIT packages |
| Secret audit and build-artifact secret audit | Passed |
| Release asset audit | Passed |
| i18n E2E, release flag off | **14 passed, 2 skipped**; the two skipped cases require the Japanese/Korean preview flag |
| i18n E2E, preview flag on | **2 passed**, covering Japanese and Korean |
| Existing responsive/public/editor-windows/editor-layout E2E | **48 passed** |
| Visual review | Six 320px screenshots inspected: English/Traditional Chinese editor and Japanese/Korean landing/public pages; main controls remained reachable and sampled Japanese/Hangul rendered |
| Diff whitespace check | Passed |

The **64 distinct browser scenarios** cover saved/browser/default locale ordering, blocked preference storage, reload persistence, fallback selection, HTML language, switcher focus, date tooltips, mobile wrapping, unchanged authored OC text, editor history/dirty drafts/caret selection, no locale-triggered API writes, minimized/open windows and preserved audio playback position/volume. Three screenshot-producing cases were rerun to save visual evidence; those reruns are not additional unique scenarios. Caret/DOM preservation is checked with a programmatic language change while the editor retains focus; normal selector interaction is tested separately.

**Browser limitation:** the repository pins Playwright 1.64.1 / Chromium 156.0.8078.4 (revision 1248). Its browser download failed with a truncated/invalid archive. The recorded browser tests therefore used the repository's Playwright runner with temporary external configuration and an unmodified Chromium **153.0.8010.0** binary supplied by `@sparticuz/chromium@153.0.0`. Neither the repository's browser pin nor its CI launch configuration was downgraded. The complete `pnpm verify:contributor` run on the pinned browser, native-device font checks and Japanese/Korean native-speaker approval remain outstanding before the relevant merge/release gates.
