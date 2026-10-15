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
- staging DB：`supabase db push --project-ref gabvecfxlvchsoehzelq --dry-run` 只列出 `0003_atomic_publish.sql`；正式 push 成功套用同一 migration。
- staging Worker：先以 `wrangler deploy --env staging --dry-run --keep-vars` 驗證，再部署 version `bbed29ee-e71c-4d0c-95f6-14d79fdf4ba0`；使用 `--keep-vars` 保留 dashboard vars/secrets。
- Cloudflare Pages staging deployment：`3f3b7854`（部署 source `8e2e4db`）。canonical：https://retrodesk-staging.pages.dev；immutable：https://3f3b7854.retrodesk-staging.pages.dev。
- HTTP smoke：API health `200`、既有 published site DB read `200`、未登入 publish boundary `401`、Pages canonical／immutable `200`；canonical 已提供 bundle `index-CGG28UzR.js`。

## #18B2 protected draft assets and legacy migration

驗證日期：2026-10-16（Asia/Singapore）。本節完成 #18 的發佈／素材安全門檻：新草稿媒體預設為 owner-only，公開版本只引用發佈時產生的 immutable copy，既有公開素材則可在不破壞 live site 的前提下遷移。

- 實作計畫：`docs/superpowers/plans/2026-10-16-protected-draft-assets.md`。
- 實作 commits：`170f160`、`303cb82`、`a6f8983`、`27c106a`、`d97d97c`、`6655bbe`、`3d99093`、`d09c770`、`c76b7ad`、`0024620`；release-gate React 修正 `dd9829f`。
- storage boundary：新 upload 只寫 `draft/users/<owner>/sites/<site>/<asset>.<ext>`，資料庫保存穩定 `retro-asset:<uuid>` reference；匿名 wildcard 在 R2 lookup 前拒絕 draft key，owner preview 逐一驗證 owner/site/key 並回傳 `private, no-store`。
- publish boundary：發佈前驗證 reference、owner 與 exact draft object key，複製到 immutable `published/<username>/assets/<asset>.<ext>`，重寫 projection 後才進行原子 DB commit；任一缺漏／foreign reference／copy error 都不會推進 published version。
- legacy migration：versioned owner-only RPC 只接受 exact UUID/key/ext 與完整 cardinality；先複製後換 reference。舊 public object 若仍被 authoritative live document 引用就保留並標示 pending，下一次確認不再使用後才清除，避免先刪後壞站。
- editor resolver：authenticated Blob resolver 去重請求、重用 object URL 並在 dispose revoke；圖片、avatar、icon、inspector thumbnail 與 wallpaper 都走同一 boundary，切換 source 時不會把 `retro-asset:` scheme 或上一張圖片閃到 DOM。
- registry/runtime regression：公開頁 loading state 與 theme hook 拆成穩定元件邊界；registry 改以 React element 掛載 View/InlineEditor，不再把含 hooks 的元件當一般函式呼叫，排版模式與公開頁空白回歸皆有單元／E2E 保護。
- full unit：82 passed（shared 31 + API 40 + web 11）。
- typecheck：pass（shared、api、web）。
- full E2E：49 passed（單 worker 最終發布閘門 36.8s）；平行 run 曾因 Playwright trace 暫存檔競態誤報 4 項 teardown failure，功能斷言與 serial rerun皆通過。
- build：pass（shared、API Wrangler dry-run、web Vite）；非阻斷警告為既有 Wrangler log-file sandbox 訊息與 web bundle size。
- `git diff --check`：pass。
- review：first-half/full spec、quality re-review 與 final holistic security review 均通過；review 發現的 resolver race、legacy cleanup truthfulness、published-reference preservation、exact-key validation 與 pending-delete invariant 均已修正並有回歸測試。
- staging DB：dry-run 只列出 `0004_protected_draft_assets.sql`；正式 push 成功套用同一 migration。
- staging Worker：version `c92bea5f-9eaa-4cd1-9a15-ccca3398af5b`，以 `--keep-vars` 保留 dashboard vars/secrets。
- Cloudflare Pages staging deployment：`22002270`。canonical：https://retrodesk-staging.pages.dev；immutable：https://22002270.retrodesk-staging.pages.dev；canonical HTML 指向 bundle `index-cOeIdTF-.js`。
- live smoke：API `/api/health` `200`、published site `beibei` `200`、Pages canonical／immutable `200`、synthetic draft key anonymous request `404`、既有 published wallpaper `200 image/jpeg` 且 `cache-control: public, max-age=31536000, immutable`。
- live Chromium visual/DOM：title `bei — Retro Desktop`、`.visitor-page` 1、desktop visible、2 dialogs、taskbar clock present，背景使用 API published asset；1440×900 截圖確認 Win98 視窗、背景 cover、Start 與時鐘皆正常。沒有使用或建立 staging 測試帳密，因此 authenticated live upload/preview 由 API unit integration coverage 驗證，未宣稱人工帳號驗收。

## #19A multi-OC profile domain and migration contract

驗證日期：2026-10-16（Asia/Singapore）。本節建立多 OC 的資料完整性與 API 寫入邊界；尚未切換 editor 寫 v2，也尚未提供訪客追蹤列表，這兩部分分別保留給 19B／19C。

- 實作計畫：`docs/superpowers/plans/2026-10-16-multi-oc-profiles.md`。
- 實作 commits：`cedac91`、`a4fe7e6`、`54bbfac`、`43c914b`。
- profile contract：additive OC 欄位包含 canonical handle/display name、pronouns、自訂欄位、world tags、內容區 theme override；舊 v2 文件的 optional 欄位與 validation-only identity 行為維持相容，新建／修改則統一正規化 handle。
- migration：兩個 legacy Instagram 視窗即使 handle 大小寫重複也不合併，依來源順序產生 deterministic `-2` suffix，保留 legacy username／followers／following labels；重跑 v2 不增加角色或貼文。
- operations：pure create/update/duplicate/reference inspection/delete-or-retarget；輸入與輸出都經完整 semantic validation，跨站 scope、case-insensitive handle 衝突、dangling refs、錯誤 retarget 與 referenced delete 均回 typed diagnostics，不 throw、不修改輸入，回傳 profile 不與文件物件 alias。
- API boundary：CreateSite 保持 v1；SaveDraft 接受 validated v1/v2。v2 除 structural/semantic validation 外，所有 profile、post、Instagram profileRef 的 siteId 必須等於實際 `/sites/:siteId` owner route，self-consistent 但屬另一站的文件會在寫入前回 `400 invalid_draft`。
- typecheck：pass（shared、api、web）。
- full unit：93 passed（shared 36 + API 46 + web 11）。
- full E2E：49 passed（單 worker最終發布閘門 37.8s）。
- build：pass（shared、API Wrangler dry-run、web Vite）；只有既有 multi-environment 與 bundle-size warnings。
- `git diff --check`：pass。
- review：spec review 經兩輪 site semantic/scope 修正後 APPROVED；quality review 經 migration no-throw、operation validation、handle canonicalization 與回傳 alias isolation 修正後 APPROVED。
- staging Worker：version `3f469ce9-75c8-4de2-9dc9-bbda693175b9`。
- Cloudflare Pages staging deployment：`7656f73c`。canonical：https://retrodesk-staging.pages.dev；immutable：https://7656f73c.retrodesk-staging.pages.dev；canonical HTML 指向 `index-CwObkPGQ.js`。
- live smoke：API health `200`、published site `beibei` `200`、Pages canonical／immutable `200`；390×780 real Chromium 顯示 mobile visitor、2 個 icon、horizontal overflow `0`、page errors `[]`。沒有安全的 staging 測試帳密，因此 cross-site authenticated rejection 由實際 route integration test 覆蓋，未宣稱人工登入驗收。
