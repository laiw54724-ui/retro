# OC／IG 編輯與展示整理驗證紀錄

日期：2026-10-17（UTC）。本文件記錄 [Issue #44](https://github.com/laiw54724-ui/retro/issues/44) 的 OC／IG 子範圍、實際驗證及整合依賴。

## 基線與工作範圍

- Repository：`laiw54724-ui/retro`。
- 開始基線：`origin/main` 的 `aa8b75a`；提交前再次 fetch，main 仍為相同 commit。
- 獨立 worktree：`retro-oc-ig-editor`。
- 工作分支：`feat/retro-oc-ig-editor`。
- 本次交付為 Draft PR；沒有直接 push main、merge 或部署。
- 本次沿用 #19–#21 已完成的多角色、canonical 內容實體與虛構互動功能，沒有重建這些功能。
- #44 的 Music／Moodboard／Explorer 編輯工作不在本次修改範圍，避免與其他 Agent 重疊。

## 本次實作

### 多角色與角色資料分組

- 提供目前角色選擇器與可搜尋的角色管理清單，標示目前編輯角色及草稿狀態；角色切換沿用既有視窗 `profileRef` 指派方式。
- canonical 編輯內容分為角色資料、貼文、精選／合集、互動與外觀；沿用既有操作，不新增另一套角色實體或保存格式。
- 移除 canonical 畫面重複的 identity controls；legacy-only 表單仍保留身份、精選與貼文編輯。
- 各角色的分組，以及貼文、精選、合集的搜尋／篩選、展開項目、待輸入網址及錯誤等局部狀態依 site／window／profile 範圍保存。編輯分組保留掛載並以 `hidden` 切換，隱藏面板由局部 CSS 排除。
- 新增角色展示用資料區，呈現代名詞、世界標籤及自訂欄位；從目前角色與既有公開投影讀取，不回退到其他角色資料。

### 貼文搜尋與篩選

- 搜尋標題、內容、地點、顯示日期、世界觀日期及所有輪播圖片的替代文字；支援 Unicode NFKC、大小寫及空白正規化。
- 草稿／公開狀態與置頂篩選可獨立組合，顯示匹配數、空結果提示及清除篩選。
- 篩選期間停用整篇貼文排序，取消篩選後以作者完整清單的原始順序操作。
- 編輯中的貼文若因修改內容或狀態而不再符合篩選，保留該列直到收合，顯示原因，且不列入匹配數，避免輸入中途失去焦點。
- 保留 canonical 圖片 metadata、草稿／公開切換及角色互動操作。延遲上傳完成後仍針對原角色與原貼文更新局部狀態及內容。

### 精選與合集

- 整理精選／合集的清單、展開編輯及局部狀態，改善大量項目的搜尋、狀態辨識與空結果提示。
- 合集沿用既有貼文 reference，不複製圖片或建立第二份貼文；草稿及公開引用仍經既有 canonical 操作與投影處理。
- 合集搜尋不刪除結果外的收錄；貼文排序依完整 `postIds`，並同步既有雙向 reference。頂層精選／合集搜尋中暫停排序並提供提示。
- 精選頁上傳完成時再檢查原 site／角色歸屬，若精選已刪除或因角色轉接改屬另一角色，不附加上傳結果。

## 共享邊界

本次沒有修改 shared schema、registry、store、全域 CSS 或共用媒體上傳核心。樣式集中在 IG 局部 CSS module；沒有資料庫 migration、lockfile 或 repository Playwright config 變更。

既有 v2 canonical 文件、legacy adapter、草稿保存與公開投影仍為資料來源與權限邊界。本次新增的搜尋、篩選、展開與分組等 UI 狀態不寫入保存文件。

## 整合依賴與保留範圍

| 項目 | 本次處理方式 | 整合時需確認 |
| --- | --- | --- |
| [PR #47](https://github.com/laiw54724-ui/retro/pull/47)：`customFields` 輸入焦點 | 既有動態 key 問題仍列為整合依賴，沒有複製其修正。 | `ProfileEditor.tsx` 與 PR head `6533573` 的三方合併模擬 exit 0、沒有衝突標記；實際整合後仍需驗證欄位名稱連續輸入與焦點。 |
| [#41](https://github.com/laiw54724-ui/retro/issues/41)：全域預覽 | 尚未合併，本次使用現有 IG 局部預覽。 | 不將 IG 局部預覽通過等同於全域預覽問題已解決。 |
| [#43](https://github.com/laiw54724-ui/retro/issues/43)：媒體 queue／新 API | 尚未合併；保留現有 `ctx.upload` 介面，僅處理 IG 局部狀態、錯誤與原角色歸屬。 | 等新契約可用後再接入 queue／新 API；本次未宣稱具備其重試或工作佇列功能。 |
| #35 後續外觀／#38 | 只將既有 IG 內容 theme 與 skin 欄位移到外觀分組。 | 沿用後續共用 token／繼承及 P3／P4 元件外觀契約；未實作新的全站外觀儲存方式。 |
| #44 其他模組 | Music／Moodboard／Explorer 暫不修改。 | 由各負責 Agent 整合，避免將本次 Draft PR 視為完整關閉 #44。 |

## 已完成的實際驗證

以下 PASS 僅代表該項指令／驗證已實際完成，不代表所有驗收已完成。

| 驗證項目 | 實際結果 | 證據與範圍 |
| --- | --- | --- |
| Frozen lockfile 安裝 | PASS | 固定 `pnpm@10.18.2` 執行 `install --frozen-lockfile`；依賴安裝成功，repository lockfile 未變更。 |
| Typecheck | PASS | 已完成 workspace 型別檢查；raw v2 input 可省略 `media` 的型別問題已修正。 |
| Lint | PASS | 已完成本次 workspace lint。 |
| Workspace unit tests | PASS：54 檔、251 案例 | shared 12 檔／74 案例、web 16 檔／71 案例、api 26 檔／106 案例；全部 exit 0，0 failed、0 pending。 |
| 本次新增 unit tests | PASS：13 個案例 | 貼文篩選／保留編輯列 10 個，角色資料展示 3 個；已包含在上述 251 個案例中。 |
| Build／dry-run | PASS | 已完成 workspace build 與 API dry-run；最後 CSS 調整後再次執行 web build 通過。保留既有 Zod annotation／bundle size 提示，沒有部署。 |
| `git diff --check` | PASS | 已通過差異空白檢查。 |
| Secret audit | PASS | `node scripts/audit-secrets.mjs`，掃描 worktree、build artifacts 及 reachable Git objects，沒有輸出敏感值。 |
| Release asset audit | PASS | `node scripts/audit-third-party-assets.mjs --release`，2 個已確認 bundled files，release exclusions clean。 |
| Dependency license audit | PASS | `node scripts/audit-dependency-licenses.mjs`，148 個套件。 |
| Build artifact secret audit | PASS | `node scripts/audit-secrets.mjs --artifacts-only`，建置產物掃描通過。 |

單元測試先執行 `pnpm test:unit`，再於三個 workspace 分別用下列指令取得 JSON 報告的實際數字（報告只存本機暫存目錄）：

```sh
node node_modules/vitest/vitest.mjs run --maxWorkers=2 --minWorkers=1 --reporter=json --outputFile=<temporary-report-path>
```

### E2E 結果

- 初輪相關 E2E：**26 個案例中 25 個通過、1 個失敗**。
- 失敗原因是自訂欄位測試的模糊 `getByPlaceholder("內容")` 選到了隱藏分組中的貼文搜尋框；修正為限定「角色資料」panel 與 `exact: true`，沒有放寬產品驗收。
- 最終完整重跑兩支相關 spec：**32 passed、0 failed、0 skipped，exit 0（1.7 分鐘）**。
- 新增 9 個 E2E：角色間貼文搜尋／篩選及待輸入網址保留、搜尋中草稿持續編輯、合集搜尋不遺失收錄、320／375／430px 分組與鍵盤／捲動、延遲貼文上傳歸原角色、角色刪除轉接後拒絕延遲精選附頁、公開角色資料 A→B→A 與跨網站相同 entity ID 隔離。
- 原有相容驗收也通過：角色新增／複製／刪除轉接、canonical metadata 保存與重載、legacy reconciliation、具名互動、公開草稿排除、訪客導覽、置頂／合集／精選展示與手機視窗隔離。
- 視覺檢查後調整 320px 新貼文網址換行；只重跑受影響的 320／375／430px 與桌面貼文情境，**4 passed、exit 0**。這四個是上述情境的重跑，不另算成 36 個不同案例。

```sh
NODE_PATH=./apps/web/node_modules node node_modules/@playwright/test/cli.js test \
  --config /workspace/scratch/46c6f6ff523d/playwright.oc-local.config.ts \
  tests/e2e/instagram.spec.ts tests/e2e/oc-profiles.spec.ts --workers=2
```

### 瀏覽器與測試環境

- Playwright `1.64.1` 對應的 Chromium 下載失敗，改用環境既有 `chromium-1194`／Chromium `141.0.7390.37` 執行本次瀏覽器驗證。
- 上述替代僅發生在本地測試執行環境；沒有修改 repository lockfile 或 Playwright config。瀏覽器版本差異應保留在驗證限制中。
- 使用暫存 Playwright config，讓 mocked API 與頁面同源於本地 `5197` port；沒有修改產品的 API URL 或部署設定。
- 本地 mocked API 驗證不代表真實 Supabase／Cloudflare 上傳、儲存或發布已完成驗收。

## 視覺確認與剩餘風險

- 已檢視示範資料的 1400×1000 桌面與 320×844 手機截圖。角色選擇／新增、五個分組、搜尋與狀態控制可辨識；窄螢幕的新貼文網址已換行，避免被上傳按鈕壓成過窄輸入框。截圖及 HTML 報告存於本次本機 QA 暫存目錄，沒有加入產品資產。
- 最終分支仍以 main 為 base，不合入其他 Agent 的工作。`ProfileEditor.tsx` 是與 #47 的共同路徑；三方文字合併檢查通過不等同於整合後的行為驗收。自訂欄位名稱連續輸入／IME 仍應在 #47 整合後重驗。
- #41 全域預覽、#43 共用上傳狀態與逐項重試、#35 後續外觀契約保持為整合依賴。若目標在上傳中被刪除或轉接，本地介面拒絕附加結果；已完成的資產如何提示、重試或整理留給 #43 的共用任務契約。
- 本次瀏覽器測試限 Chromium 與 mocked API，沒有實機 Safari／Android 或真實 Supabase／Cloudflare 的端到端上傳及發布驗收。
- 未執行全站 `pnpm verify:contributor` 的全部 E2E；已完成其安裝、audit、typecheck、unit、build 等相關 gate，瀏覽器驗收限上述 IG／OC 兩支 spec。
- 此交付僅為 #44 的 OC／IG 子範圍，Draft PR 使用 `Refs #44`，不關閉整張 Issue。
