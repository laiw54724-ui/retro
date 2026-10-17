# Retro usability release candidate — 2026-10-17

本文件記錄 `integration/retro-usability-release` 的實際來源、整合邊界、相容性、驗證與發布順序。它不是部署紀錄，也不把 Issue 規劃或未取得的本機分支當成已完成程式。

## 1. 基準與盤點範圍

整合起點是 `origin/main` `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`。該 commit 是 PR #48 的 merge commit，因此 `codex/editor-focus-layout` `e56279930731a31137c05cfa22f4cc685dc013ca` 已是 main 祖先，不再重複套用。

整合工作在隔離 worktree `/mnt/data/retro-integration/repo`、分支 `integration/retro-usability-release` 進行。該 worktree 只有這一個分支，整合及文件提交前後均以 `git status` 檢查；沒有 reset、clean、force push、改寫來源分支、合併 main 或部署。此執行環境無法讀取使用者電腦上的其他 worktree、未提交修改或只存在本機的 branch，因此下表的「本機狀態」只涵蓋這個隔離 worktree。

| 線索／來源 | 實際 HEAD 與 PR 狀態 | 依賴／包含關係 | 來源分支測試紀錄 | 本候選處理與未完成 |
| --- | --- | --- | --- | --- |
| `origin/main`／PR #48 | main `aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`；#48 已 merged。來源 head `e56279930731a31137c05cfa22f4cc685dc013ca` | #48 已被 main 包含 | #48 記錄：shared 74、API 106、web 58 unit；118 Chromium E2E；build／audits 通過 | 作為唯一整合 base，保留 sidebar scroll 與 focus scrim |
| `claude/usability-batch1` | 遠端 branch、PR 與可取得 ref 均不存在；無可驗證 SHA | 未知，不能假設含 #38／#47 或其他功能 | 無可重現紀錄 | **阻擋 B／C／D 完整驗收**。若成果只在其他電腦，交接方式是推送該 branch 或提供可驗證 bundle／patch；本候選不代提交他人未提交成果 |
| `codex/appearance-foundation`／PR #38 | `d47e798bd6cc5bff8f8776748be663b32b058332`；Draft open | 是 `feat/retro-window-chrome` 祖先 | typecheck、244 unit、build、43 scoped Chromium E2E；未實機 Safari／Android | 不單獨重複 cherry-pick；只透過 #49 一次納入。#35 P2–P7 仍排除 |
| `feat/retro-window-chrome`／PR #60、Issue #49 | `7998764bf4e4917d50a76ec8a44907a3b85da115`；Draft open，base 是 #38 | 已含 #38；未含 #47／#43 | `verify:contributor` PASS；267 unit；140 general E2E + 23 dedicated chrome；27 PNG baseline；最新 main detached 整合亦通過來源分支紀錄 | 合入 W1 共用 WindowChrome、strict `window.chrome`、desktop/mobile editor、展示與回歸圖。#50–#52、native 200% zoom、真 Safari／iPhone 排除 |
| `codex/component-operation-fixes`／PR #47 | `653357373e28dac518d7cb522b497c70cc2e2bc3`；Draft open | 與 #38/#49、#43 獨立；沒有被它們包含 | lint/typecheck/build；238 unit；69 regression + 12 focused Chromium；未實機 Safari／Android／IME | 合入相簿 focus trap／焦點還原、OC 穩定 row key、Moodboard 鍵盤操作、掃雷窄螢幕行為 |
| `feat/retro-media-editor`／PR #59、Issue #43 | `2fc71457e2ffab6dea9ec1d7e8b9c0e8c878bf2d`；Draft open | base 是 main `aa8b75a`；未含 #47/#49 | audits/typecheck/build；285 unit；145 browser cases（首次 142 pass、3 修正後 targeted pass）；原封不動一鍵 gate與 pinned Chromium 尚未在來源分支證明 | 合入共用媒體任務、部分失敗重試、文件／相簿／連結／名片 UX、caption／alt 欄位及 protected asset resolver；本候選用同一 commit gate 重驗 |
| `feat/retro-i18n-foundation`／PR #56 | `bb954ebac33db24e3b15b9d70648e2306496b770` | 與本輪可用性整合無必要依賴 | 見原 PR | 排除，避免擴大候選 |
| `feat/retro-oc-ig-editor`／PR #57 | `52a0bf1d617f6b499c2ecb0919532a148ad9a075` | 依賴 #43 API 尚未合入時採局部介面策略 | 見原 PR | 排除；不改 OC／IG 專用 UI |
| `docs/retro-scene-builder-plan`／PR #58 | `5f1bad114219aaba283b3b84c5b631343a015d83` | 文件研究，非 runtime | 文件檢查 | 排除；不能算已完成 Scene Builder |

## 2. 實際整合順序與衝突

依祖先關係整合：

1. `origin/main`（已含 #48）。
2. `feat/retro-window-chrome`，一次帶入 #38。
3. `codex/component-operation-fixes`（#47）。
4. `feat/retro-media-editor`（#43）。
5. 只補整合交界的回歸修正與測試。

#49 與 #47 可乾淨合併。#43 有三個內容衝突，均以功能合併處理，沒有使用整檔 `ours`／`theirs`：

- `gallery/index.tsx`：保留 #47 的 modal focus trap、Escape／方向鍵、關閉回 opener 與單張控制狀態，同時使用 #43 的 `image.alt ?? caption/title` 語意。
- `editor-media.spec.ts`：保留 #43 對實際已儲存 About icon 的等待，避免誤讀 v1→v2 migration save。
- `public-sharing.spec.ts`：保留依測試頁 origin 建立預期 URL，避免寫死 5173。

另逐項檢查 `packages/shared/src/site.ts`、`site-versioning.ts`、API `SaveDraftSchema`、appearance resolver、editor store、IconPicker、Gallery、DesktopCanvas、VisitorDesktop 與 MobileScreen：

- 舊文件沒有 `caption`／gallery `alt`／`chrome` 仍可載入；optional 欄位不因讀取被補寫。
- v1／v2、migration、legacy projection／merge、public projection、export／import 都保留合法新欄位。
- 改視窗 chrome preset 或 section 不更換 App key／DOM；內容、輸入、掃雷 state 與同一 audio element 不因外觀切換被重建。
- API route 新增整合測試，證明 v1 與 strict v2 都接受並原樣保存 #43 的 media fields 及 #49 的 `window.chrome`。

## 3. 整合交界修正

本候選只補兩個在合併後可重現、會影響資料或隱藏播放的缺口：

1. **隱藏音訊生命週期**：desktop editor／visitor 的 minimize 現在停止該 window 的 active audio，與 close、來源切換、手機返回一致；不建立第二個播放器或改寫播放 schema。
2. **Explorer dangling shortcut**：刪除被 Explorer window shortcut 指向的視窗時，同一個 history mutation 會移除該站內捷徑。undo 可一起恢復；canonical v2 通過 strict parse，autosave 後 reload 與 public projection 不再卡在不存在的 target。

## 4. 驗收狀態

### A. 相簿 — 已完成候選驗收範圍

- 全視窗 modal 遮罩，背景不接受 pointer／Tab。
- 圖片被容器限制，不溢出視窗。
- Escape、左右鍵、單張 disabled 狀態與 focus trap。
- 關閉後焦點回原縮圖。
- #43 的 gallery alt／caption fallback 與 #47 操作行為同時保留。

### B. 音樂 — 部分完成，平台嵌入阻擋

已完成／保留：

- 原生 HTTPS／受保護上傳音訊由明確點擊開始。
- 全站單一 playback coordinator，沒有 desktop/mobile 隱藏重複 audio。
- 來源切換、關閉、最小化、手機返回及離開預覽會停止該音源。
- 載入／播放錯誤顯示，並保留「來源／原連結」。
- CSP 沒有加入 `unsafe-eval`，本候選也沒有放寬 script policy。

未完成：

- Spotify／YouTube 點擊後才載入的站內 embed 尚不存在；目前仍按既有產品契約只外部開啟。
- 因未合入 iframe，CSP 也尚未建立最小 `frame-src` allowlist。
- Spotify 登入後完整播放、真 Safari／Android 播放生命週期未實測。

### C. Explorer — 核心資料安全完成，完整桌面互動仍阻擋

已完成／保留：

- 多層資料夾、搜尋、breadcrumb／完整路徑、開啟 window／OC／post、select 移動、資料夾刪除提示與 global undo。
- 刪目錄只刪內含捷徑，不刪原 target。
- 刪除 target window 會清掉失效 shortcut；有 unit + autosave／reload／public E2E。

未完成：

- 沒有新的多選模型或 drag-and-drop 移動。
- 單一捷徑刪除仍沒有與資料夾一致的確認／局部復原 UI。
- 因 `claude/usability-batch1` 無可取得 SHA，不能把既有 select 移動冒充完整拖移驗收。

### D. 圖示 — 阻擋

目前只有：內建自製圖示、使用者自己的上傳／URL，以及權利狀態未確認、預設不隨發行物提供的 optional Windows pack。這不等於前次要求的來源。

下列全部尚未在可取得分支中實作：

- 精選 Haiku。
- 通用 CC0 像素圖示。
- Pixelarticons Free。
- 跨 pack 分類／搜尋、preview apply／cancel、穩定 source-qualified ID。
- pack 的固定 source revision、license notice、fallback、editor／public／mobile／template import-export 往返。

使用者自己的上傳與 fallback 仍可用，但不能因此將 D 標成完成。

### #43 與 #49

- **#43**：候選已含共用 sequential upload queue、真實項目狀態、不顯示假百分比、部分失敗逐項重試、成功 sibling 不重送、async target/session invalidation，以及文件／相簿／連結／名片編輯 UX。Queue／File／retry 狀態仍只存在 editor session；逾時 HTTP 不能 abort，可能留下未套用 asset，為已記錄限制。
- **#49**：候選已含 W1 共用 WindowChrome、strict shared schema、desktop/mobile presenter、editor preview/apply/cancel/reset、展示與 visual baselines。#50 action wiring、#51 Image App、#52 player skins／內容不是本候選範圍。

## 5. 最終驗證契約

`.github/workflows/integration-candidate.yml` 對整合 branch push 與 main PR 的**同一個 checkout SHA**依序執行：

1. frozen `pnpm install`（Node 22.23.3、pnpm 10.18.2）。
2. 安裝 Playwright Chromium／WebKit。
3. `pnpm lint`。
4. `pnpm verify:contributor`（secret／release asset／license audits、typecheck、全部 unit、build、artifact scan、一般 E2E）。
5. `playwright.chrome.config.ts` 的 Chromium Linux 27 張 baseline／行為驗證與 WebKit smoke。

一般 E2E 已包含 editor／preview／public、desktop 及 320／390／430 px、v1／v2、save reload、public projection、owner/editor/viewer boundary 等既有 suites；本輪另補 API v1/v2 保存、Explorer target cleanup reload/public、audio minimize regression。測試數只引用這個 final SHA 的 workflow，不把來源分支數字相加當作整合結果。

下列保持未驗證：真 macOS Safari／iPhone、真 Android、native browser 200% zoom、原生 CJK IME、Spotify 登入完整播放、真實雙帳號 staging 權限流程。

## 6. API／前端發布順序與回滾

#43 的 `document image.caption?`、`gallery image.alt?` 及 #49 的 `window.chrome?` 都是 shared document format 變更，沒有 DB migration，也沒有提高 `schemaVersion`。這不代表可任意調換部署順序：

1. **先部署能解析舊／新 v1/v2 的 API Worker**，並 smoke `GET site`、`PUT draft`、publish projection。候選 API 使用 `VersionedSiteDocumentSchema` + `parseSiteDocument`，整合測試證明新欄位可往返。
2. 確認 API Worker version 與 health 後，才部署會寫入新欄位的 Pages frontend。
3. 再以 disposable site 驗證 edit → autosave → reload → publish → public desktop/mobile。

相容性與回滾限制：

- 舊 strict v2 API 會拒絕新欄位；舊 permissive v1 reader 可能 strip 後回存，造成資料遺失。
- 前端可以回滾到不再寫新欄位的版本，但 API **不能**回滾到 pre-#43/pre-#49 parser，只要 DB 已可能含新欄位。
- 如前端需回滾，保留新 API reader；先停用新 writer，再確認沒有舊 client 進行 lossy save。
- 無 migration rollback；文件 JSON 已保存的新欄位只能由相容 reader 保留。部署前應保留 DB 備份／版本資料。

## 7. staging 現況

Repository 內最後一筆可追溯的部署紀錄（2026-10-17）是：

- Pages staging immutable deployment `44e0047e`，source `#23–#28 OC platform application batch`，bundle `index-CcbCNO-G.js`／`index-Do4PNGk_.css`。
- API staging Worker version `932c605a-ac39-4a03-b2b1-c664688e6fb8`。

這只是 repository 文件中的**最後已記錄證據**，不是本次即時查詢結果。GitHub `Deploy staging` workflow 對近期 main push 受 `DEPLOY_ENABLED` gate 控制且可見執行為 skipped；GitHub deployment API 沒有提供可用紀錄。本執行環境也無法 DNS 解析 canonical Pages／Worker URL，因此不能確認目前 alias 是否仍指向上述版本，更不能假設 Pages 與 API 同步。此候選未部署 staging 或 production。

## 8. 原 PR 後續建議

候選審查通過後再由維護者決定原 PR 狀態；本整合不關閉任何 PR：

- #38 已由 #60 transitively 涵蓋，不需要再對候選重複 merge。
- #47、#59、#60 的程式內容都被候選涵蓋；保留至候選驗收完成，之後可依維護者偏好關閉為 superseded 或保留個別審查紀錄。
- #48 已在 main，無需處理。
- `claude/usability-batch1` 交接前，B／C／D 不應勾選完整，候選也不應進入完整 staging 驗收。
