# Japanese / Korean expansion (beta)

Status: **draft for review**. Japanese and Korean remain beta: they are enabled only in preview builds
(`VITE_I18N_PREVIEW_LOCALES=true`) and are **not** enabled for production by this change. All ja/ko text is
AI-assisted and **pending ja/ko review**; no native-speaker acceptance is claimed.

## Scope completed

Zero hard-coded Chinese UI literals remain in `apps/web/src` (guarded by `hardcodedText.test.ts`). Catalogs have
identical key sets in zh-Hant, en, ja, ko (1,810 keys in 7 namespaces; plural `_one/_other` in all four).

| Batch | Covered |
| --- | --- |
| 1 | sign-in, desktop hub, landing, onboarding / site creation, language switch |
| 2 | desktop + mobile editor, window chrome labels, toolbars, inspector, theme/appearance editors, confirm & integrity dialogs, save/publish status and errors, upload queue |
| 3 | document, gallery + lightbox, links, icon picker (names, purposes, help), about card, Explorer, music, Moodboard, guestbook, Minesweeper |
| 4 | OC/IG editor: profile, posts, collections, highlights, social tabs, character switcher, search/filters, empty states, form hints |
| 5 | collaboration, export/import, conflict and invitation prompts, permission/visibility text, public-page system actions, shared-package system messages |

Also: locale-aware dates/numbers/lists through `useLocaleFormatting()`; theme preset names; icon names and keywords in
all four languages (so "フォルダー" / "폴더" find the folder icon).

## What is intentionally not translated

* Authored content (including the **site name typed at onboarding**, even when it equals a built-in default such as "相簿" — the name is built in as a placeholder and restored after defaults are localized; covered by unit and e2e tests): OC names, character data, posts, tags, author window titles, text typed by the user.
* **Creation defaults** (e.g. a new "About me" window) are localized once at creation. Existing works are never
  re-translated when the interface language changes (`localizedDefaults.ts`, exact-match on the zh default only).
* Shared-package Chinese system messages are translated at the view boundary by exact wording (`systemMessages.ts`).

## Remaining untranslated / known gaps

* Demo/sample content dictionary on the landing page covers a fixed set of examples only.
* SEO/public metadata built in `packages/shared` (`public-metadata.ts`) and legacy zh helpers in shared.
* Built-in registry data in `features/modules/registry.ts` that is authored-looking data.
* zod/schema validation messages that originate in English.
* A few IG counters use the browser default locale in `toLocaleString()`.
* The About card's "File Details" default title is English in all locales (existing default).
* API error bodies are shown as returned by the server.

## Glossary

| Concept | zh-Hant | en | ja | ko |
| --- | --- | --- | --- | --- |
| Desktop (a user's site) | 桌面 | desktop | デスクトップ | 데스크톱 |
| Site | 網站 | site | サイト | 사이트 |
| Window | 視窗 | window | ウィンドウ | 창 |
| Folder | 資料夾 | folder | フォルダー | 폴더 |
| Shortcut | 捷徑 | shortcut | ショートカット | 바로가기 |
| Draft | 草稿 | draft | 下書き | 초안 |
| Publish | 發布 | publish | 公開 | 게시 |
| Favorites | 收藏 | favorites | お気に入り | 즐겨찾기 |
| Highlights | 精選 | highlights | ハイライト | 하이라이트 |
| Character (OC) | 角色 | character | キャラクター | 캐릭터 |
| Collection | 合集 | collection | コレクション | 컬렉션 |
| Visitor preview | 訪客預覽 | visitor preview | 訪問者プレビュー | 방문자 미리보기 |

## Tests

* Unit: `translationQuality.test.ts` (missing/empty keys, interpolation + plural parity, unwanted fallbacks),
  `hardcodedText.test.ts`, `systemMessages.test.ts`, `localizedDefaults.test.ts`.
* E2E (`pnpm test:e2e:i18n-preview`, ja/ko only run in preview mode):
  `tests/e2e/i18n-coverage.spec.ts` — per-locale create → edit → publish → public flow with Chinese-leak detection;
  language switching while editing (typed text, undo, no extra saves); 320/390/430px fit checks; Chromium
  CDP-simulated IME composition for ja/ko icon search and window titles.
* `CAPTURE_DIR=<dir>` on the coverage spec writes review screenshots (see `docs/i18n/screenshots/`).

### Simulated vs. real-device IME (recorded separately)

* **Simulated (automated):** Chromium `Input.imeSetComposition` + `insertText` for Japanese and Korean — passes.
* **Real device (Japanese/Korean IME on iOS/Android/desktop): NOT yet verified.** Needs manual acceptance before
  any production opening.

## Proposal for a formal opening (not enabled here)

1. Native-speaker review of safety copy (delete / visibility / permission / publish / conflict) and key flows.
2. Real-device IME acceptance for ja/ko search and text fields.
3. Re-run the missing-key, plural/placeholder and 320/390/430px layout tests on the release candidate.
4. Then enable ja/ko in `ENABLED_LOCALES` behind the beta label, in a separate, explicitly approved change.
