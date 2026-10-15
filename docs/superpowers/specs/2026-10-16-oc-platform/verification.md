# 規劃交付驗證

日期：2026-10-16（Asia/Singapore）。這是文件與 GitHub 更新驗證，不是功能測試報告。

- 更新前比對 #18–#28 的 title／body／state 與保存的原始資料，11 張均未發生並行變動。
- 每張單具備原始碼調查、設計／範圍、工作拆分、開源選型、依賴／風險與未勾選驗收清單。
- 11 張 Issue 已寫入並逐張讀回核對，維持 OPEN。
- 整體設計已同步至 [#18 的路線說明](https://github.com/laiw54724-ui/retro/issues/18#issuecomment-6198058442)。
- 完成 Markdown 內部連結存在性、規劃數量與占位字串掃描；無損壞的本地連結或未完成標記。
- 人工交叉檢查首發依賴：#18A → #19 → #20 → #21A；#18B 為共同發布門檻；#28A 接實體 ID 與公開投影。沒有要求先完成 #21B 才能發布虛構互動。
- 開源庫只做來源／license／契約調查，沒有安裝、執行套件相容性或效能測試。
- 使用者後續指定 trapd00r/win95-winxp_icons（固定 commit 728a866）為 Windows 圖示主要來源、WinClassic resources 為補充來源；已同步 #26、#27 與整體路線。來源 repo 未宣告 license，故記為非 Retro MIT 素材，而不是來源不明。
- 未修改 apps／packages／migration／lockfile；未執行產品 build／unit／E2E，因本輪未變更產品程式。
- 未部署、未修改使用者站點，原先未追蹤的 zip／設計資料夾保留。

詳細逐步程式實作計畫、功能測試與 staging 驗收屬下一階段，不以本文件取代。

## P0 Windows icon and Win98 OC visual implementation

驗證日期：2026-10-16（Asia/Singapore）。本節記錄 P0 實作、本地驗證與 staging 部署證據；既有未追蹤使用者檔案全程保留且未進入部署輸出。

- Windows icon source checkout：`/private/tmp/retro-win95-winxp-icons`，HEAD `728a866ad59a54fd4082dbe000e1e62e50bd90e9`（upstream full commit）。
- 實作 commits：Task1 `c0673bf`、`974e77e`、`06c280d`、`a5391d5`、`fa2bb84`；Task2 `5fffbd7`；Task3 `31780ce`、`df54db2`；Task4 `c15448a`；回歸斷言修正 `fc0c71a`；runtime rights notice 修正 `3e0531e`。
- `pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons`：pass；`Imported 1193`，`unsupported 7`。
- legacy/new path：pass。E2E 的 sourced Windows icons desktop/mobile 與 legacy PNG preservation case passed；audit 亦驗證新匯入 manifest。
- typecheck：pass（shared、api、web 均完成）。
- unit：pass，6 test files、24 tests（shared 1 file/14 tests；api 5 files/10 tests）。
- build：pass（shared、api dry-run、web Vite build 均完成；Wrangler 僅輸出既有 log-file EPERM 訊息後仍完成 dry-run，web bundle 成功產出）。
- full E2E：46 tests、46 passed（最終部署前重跑 17.3s）。responsive 與 scroll 已包含在 full E2E；responsive viewport cases、Instagram wheel/keyboard scrolling、Win98 OC circular media cases，以及 Windows icon picker case 均 passed。
- round regression：typecheck、unit、full E2E、build、icon audit 均 pass；P0 Windows icon and Win98 OC visual implementation regression 完成。
- `git diff --check`：pass；verification 文件占位掃描無匹配。
- GitHub Actions staging run `38789562062` 的 install／verify 已通過；API deploy 因 staging environment 缺少 `CLOUDFLARE_API_TOKEN` 而停止。API 本輪無程式變更，故改以既有本機 Wrangler OAuth 僅部署 web Pages，未把 token 或公開 runtime values 寫入 repository。
- Cloudflare Pages production deployment for staging project：`4e1258f5-eaf4-43de-b952-70f34d865607`，source `3e0531e`。
- staging canonical：https://retrodesk-staging.pages.dev；immutable deployment：https://4e1258f5.retrodesk-staging.pages.dev。
- HTTP smoke：canonical／immutable 首頁皆 `200`；`/windows-icons/brown.ico` 皆 `200` 且 `content-type: image/vnd.microsoft.icon`。
- GitHub Issue evidence：[#26 comment](https://github.com/laiw54724-ui/retro/issues/26#issuecomment-6200008656)、[#27 comment](https://github.com/laiw54724-ui/retro/issues/27#issuecomment-6200008335)；兩張 Issue 皆維持 OPEN。

## #18A SiteDocument v2 contract foundation

驗證日期：2026-10-16（Asia/Singapore）。本節記錄 #18A 第一個可獨立驗收里程碑；現行 editor、API 與已發布站點仍讀寫 v1，v2 先以 additive shared contract 提供後續 App registry、OC profile 與 post entity 實作，不做隱性資料回寫。

- 實作計畫：`docs/superpowers/plans/2026-10-16-site-document-v2-contract.md`。
- 實作 commits：`e66a9f6`、`db9c086`、`39794c7`、`7affed6`、`782efde`、`7f93936`、`a2b3a07`、`57a2b05`。
- contract：新增嚴格的 version dispatch、v1 → v2 lossless migration、v2 structural／semantic validation、same-site entity resolver 與 referrer collection；未知未來 schema version 明確拒絕。
- v2 entity model：site-level `profiles`／`posts`，Instagram window 僅保存 `skin` 與 `profileRef`；entity/window/profile/post IDs 有界且 migration 產生值可重現。
- migration safety：不修改輸入、可重複執行、保留五種既有 window modules；window ID 映射會同步重寫 `LinkItem.windowId`，避免導覽 reference 失聯。
- compatibility：既有 `SiteDocumentSchema`、`normalizeDocument`、editor/API persistence 與 public runtime 行為未切換，故本里程碑不會自動改寫既有使用者文件。
- focused shared tests：24 passed（既有 v1 14 + v2 contract 10）。
- full unit：34 passed（shared 24 + API 10）。
- typecheck：pass（shared、api、web）。
- full E2E：46 passed，包含 desktop/mobile responsive、Instagram scroll、Start menu/taskbar、window controls、media 與 accessibility flows。
- build：pass（shared、API Wrangler dry-run、web Vite）；Wrangler 仍有既有 debug-log EPERM 訊息，但 dry-run 與 build 均成功完成。
- `git diff --check`：pass。
- review：獨立 spec review 與 quality review 均通過；window ID/reference remap 風險已由 `7f93936` 修正，v2 identity-preservation 風險已由 `a2b3a07` 修正，raw/canonical v2 型別契約再由 `57a2b05` 校正；相關行為皆有回歸測試或 typecheck 保護。
- Cloudflare Pages staging deployment：`66ee9c16`（部署 source `81fae02`；本段只有 shared contract 與文件變更，API runtime 未改動）。
- staging canonical：https://retrodesk-staging.pages.dev；immutable deployment：https://66ee9c16.retrodesk-staging.pages.dev。
- HTTP smoke：canonical／immutable 首頁皆 `200`；immutable `/windows-icons/brown.ico` 為 `200` 且 `content-type: image/vnd.microsoft.icon`；canonical 已提供本次 bundle `index-ad9TLqki.js`。

## #18A typed App registry and dispatch

驗證日期：2026-10-16（Asia/Singapore）。本節記錄 #18A 第二個可獨立驗收里程碑；仍維持 v1 persistence/runtime，不在本段啟用 v2 寫入。

- 實作計畫：`docs/superpowers/plans/2026-10-16-app-registry-contract.md`。
- 實作 commits：`d741a7e`、`21c988d`。
- registry contract：五個既有 app 統一宣告 stable type、schema version、default factory、capabilities、mobile presentation、View 與 InlineEditor。
- single source：desktop 與兩個 mobile add surfaces 均由同一 registry insertion order/metadata 產生；editor store 也只經 registry factory 建立視窗。
- renderer：View／InlineEditor dispatch 集中於 registry helper；`WindowRenderer` 不再以 unknown component cast 選擇 renderer。
- future entity boundary：`ModuleCtx.resolveEntity` 僅建立可選 typed boundary；v1 caller 不傳入，不改變現有 runtime。
- web focused unit：4 passed；驗證五個 module、metadata、factory defaults 與 missing registration failure。
- full unit：38 passed（shared 24 + API 10 + web 4）。
- typecheck：pass（shared、api、web）。
- full E2E：47 passed；新增 desktop/mobile add-surface registry parity 與 mobile add-window flow，既有 46 項流程全數維持通過。
- build：pass（shared、API Wrangler dry-run、web Vite）；僅有既有 Wrangler debug-log EPERM 訊息與 bundle-size warning。
- `git diff --check`：pass。
- review：獨立 spec review 與 quality review 均通過；spec review 所抓到的 mobile metadata 未消費、重複 module list 與缺少 E2E 均由 `21c988d` 修正。
- Cloudflare Pages staging deployment：`7c33f804`（部署 source `2056a9e`；第一次 upload 連線失敗，原產物安全重試後成功）。
- staging canonical：https://retrodesk-staging.pages.dev；immutable deployment：https://7c33f804.retrodesk-staging.pages.dev。
- HTTP smoke：canonical／immutable 首頁皆 `200`；immutable Windows icon asset 為 `200` 且 MIME 正確；canonical 已提供本次 bundle `index-B1MFNzd-.js`。

## #18B1 public projection and atomic publish

驗證日期：2026-10-16（Asia/Singapore）。本節記錄 server-owned public projection、Postgres atomic publish 與 versioned R2 artifact 狀態／重試里程碑。

- 實作計畫：`docs/superpowers/plans/2026-10-16-publish-projection-atomicity.md`。
- 實作 commits：`1cc167c`、`cb14292`、`07b463a`、`c89c4bc`、`f5fc227`。
- public projection：v1 維持相容；v2 僅保留 published profiles/posts 與引用閉包，移除 private Instagram windows、無公開 author 的 posts 與指向被移除 window 的 links；projection 為 pure/non-mutating 且會再次 structural/semantic validate。
- atomic DB contract：migration `0003_atomic_publish.sql` 以 owner-scoped row lock 同時比對 draft/published expected versions，在同一 transaction 寫入 immutable `site_versions`、推進 published pointer 並設 artifact pending，避免同草稿併發發布重複產生版本。
- R2 contract：只寫 versioned immutable key，所有 correctness-critical promises 均 await；DB public API 保持 authoritative 且不讀 R2 alias。
- partial failure：R2 或 status update 失敗都回報 failed + retryable；owner-only retry 重寫同版本 key，不建立新 publication。零列 status update 被視為 stale race，不誤報 synced。
- editor UX：DB commit 後公開連結可用；artifact 失敗顯示清楚警告與「重試同步」，成功則顯示已同步。
- full unit：54 passed（shared 27 + API 23 + web 4）。
- typecheck：pass（shared、api、web）。
- full E2E：49 passed；包含 failed→retry 與 synced publish UX，既有 47 項流程全數維持通過。
- build：pass（shared、API Wrangler dry-run、web Vite）；僅有既有 Wrangler debug-log EPERM 訊息與 bundle-size warning。
- `git diff --check`：pass。
- review：獨立 spec 與 quality review 通過；補齊 concurrency、projection/RPC、retry/public-source/success UX tests，並修正 quality review 發現的 zero-row stale status 誤報風險。
