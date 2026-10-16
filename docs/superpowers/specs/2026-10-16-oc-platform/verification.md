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

## #20 OC posts, collections, and responsive presentation

驗證日期：2026-10-16（Asia/Singapore）。本節完成 canonical 貼文／合集編輯、公開作品布局、圖片裁切與大型內容響應式驗收；具名喜歡者、具名留言與真實多人協作仍由 #21 負責，本段不顯示未完成入口。

- 實作計畫：`docs/superpowers/plans/2026-10-16-oc-content-presentation.md`。
- 實作 commits：`ae6379d`、`ef5e50f`、`06538ec`、`258d34c`、`2d51f42`。
- canonical operations：合集 create/update/delete/reorder 與貼文 membership 維持雙向一致；所有輸入／輸出先經 v2 structural、semantic 與 site-scope 驗證，失敗回 typed diagnostic 且不修改原文件。
- authoring：Instagram 編輯器可新增、刪除、排序合集，設定標題、說明、公開狀態與有序貼文；貼文媒體支援 alt、順序、刪除、格狀縮圖水平／垂直裁切與縮放，autosave 後重新整理資料一致。
- public presentation：置頂作品先於一般作品；合集只顯示含公開貼文的 published collection；合集內順序依作者設定。格狀與合集封面套用 crop，貼文詳情保留自然比例；草稿貼文、草稿合集與失效引用不進公開目錄。
- legacy/highlight：既有 post/comment/單圖精選 migration 與多頁精選 round-trip 維持通過；公開多頁精選可暫停、鍵盤前後切換並在關閉後還原原捲動位置；Win98 外殼維持方角而頭像／精選內容維持圓形。
- capacity/responsive：60 篇公開貼文、長中文、混合長寬比與三個合集 fixture 在手機 `320/375/390/430px`、桌面 IG 內窗 `360/480/720px` 全部可用；鍵盤 `End` 可捲到底，內窗與頁面水平 overflow 均不超過 1px，60 張格狀圖片皆為 lazy loading。
- typecheck：pass（shared、api、web）。
- full unit：119 passed（shared 54 + API 47 + web 18）。
- full E2E：72 passed（Chromium、單 worker、1.3m）。
- build：web production Vite build 與 deploy-env guard pass；API Worker dry-run 產生完整 bundle，只有既有 multi-environment warning 與 sandbox Wrangler log-file EPERM 訊息；web 另有非阻斷 bundle-size warning。
- `git diff --check`：pass；最終 code review 未發現阻斷問題，並在 review 中補回原先遺漏的 canonical crop 編輯／重載與公開 crop 呈現測試。
- Cloudflare Pages staging deployment：`a04c35e1`。canonical：https://retrodesk-staging.pages.dev；immutable：https://a04c35e1.retrodesk-staging.pages.dev；canonical 與 immutable 均指向 `index-d_blw_Mv.js`／`index-DJFWBBc1.css`。
- live smoke：Pages canonical／immutable `200`、API `/api/health` `200`；線上 bundle 含「新增合集」、「置頂作品」與裁切控制，使用 staging Supabase/API 且不含 fallback `example.supabase.co`。

## #21A fictional OC social interactions

驗證日期：2026-10-16（Asia/Singapore）。本節完成作者編排的虛構角色社群；真正多人共同編輯、邀請、membership／RLS 權限仍保留在 #21B，沒有暴露半成品邀請入口。

- 實作計畫：`docs/superpowers/plans/2026-10-16-fictional-social-21a.md`。
- 實作 commits：計畫 `222c09c`、資料契約 `d0b0c11`、validated operations `7e9428e`、作者編輯器 `6bca746`、訪客名單／導航 `4062fa5`、legacy/social compatibility review fix `881da09`。
- shared contract：新增同站 `FollowEdge`、具名喜歡者、其他虛構人數及 profile／legacy actor comments；禁止自己追蹤與重複 edge，所有操作完整驗證 input/output、回 typed diagnostics 且不修改原文件。
- migration：粉絲／追蹤的 `"1.2K"`、空字串等舊標籤保持 opaque，作者明確轉換前不解析；舊貼文 likes 轉為 structured extra likes 時保留原數值，避免 migration 後歸零。
- authoring：可搜尋勾選粉絲／追蹤與具名喜歡角色、設定其他虛構人數、建立 profile 或純文字角色留言並排序／刪除；所有變更沿用 editor history/autosave，E2E 已驗證 undo／redo、存檔與重載。
- public：粉絲／追蹤／喜歡者名單可開啟並進入 OC 頁，另有未具名人數會明確顯示；「所有角色」保留完整 OC directory。角色內容常駐標示「角色世界觀內容」。
- privacy/truthfulness：public projection 與 web directory 都會裁掉草稿角色的 edge、具名喜歡者與 profile 留言；訪客 follow／like／comment 只限本次瀏覽，不改作者計數或 draft，留言明示不會儲存到作者網站。
- typecheck：pass（shared、api、web）。
- full unit：124 passed（shared 59 + API 47 + web 18）。
- full E2E：74 passed（Chromium，最終部署閘門 33.3s），包含作者互動 undo/autosave/reload、公開名單與 nested actor navigation、desktop/mobile directory、Instagram 內窗捲動及全部既有 responsive/auth/publish regressions。
- build：shared、web production Vite build 與 API Wrangler dry-run pass；非阻斷訊息只有既有 Wrangler sandbox log-file EPERM、multi-environment 與 bundle-size warning。
- `git diff --check`：pass；里程碑 code review 已修正 legacy like migration、訪客暫時讚數、people-list accessible-name 衝突與 OC directory 入口，最終無未解阻斷項。
- Cloudflare Pages staging deployment：`5ecaee3b`。canonical：https://retrodesk-staging.pages.dev；immutable：https://5ecaee3b.retrodesk-staging.pages.dev；bundle `index-BAgbviXf.js`／`index-BpHe8PS8.css`。
- live smoke：Pages canonical／immutable `200`、API `/api/health` `200`；線上 bundle 含「角色世界觀內容」、「所有角色」、「僅本次瀏覽」，使用 staging API/Supabase，不含 fallback `example.supabase.co` 或邀請成員入口。
- Issue 狀態：只完成 #21A milestone；#21 保持 OPEN，待 #21B 的 migration、API membership/invite、RLS 與權限矩陣另行實作及安全審查。

## #21B1 real collaboration security backend

驗證日期：2026-10-16（Asia/Singapore）。本節完成真正多人協作的資料庫與 API 安全邊界；管理成員、接受邀請的前端 UI 留在 #21B2，因此 #21 維持 OPEN。

- 實作計畫：`docs/superpowers/plans/2026-10-16-collaboration-security-21b1.md`。
- 實作 commits：資料庫合約 `ce347f2`、request-time 權限 `8f76d85`、共享網站路由 `1b95da5`、安全邀請 API `f3c35c8`、共享私有素材 `3a33b94`、token log 防護 `56afebd`。
- ownership／roles：`sites.owner_id` 維持唯一 owner truth；membership 只允許 editor/viewer。owner 可管理、發布與編輯，editor 可讀寫草稿及草稿素材但不可發布／管理成員，viewer 僅可讀。
- immediate revocation：Worker 使用 service-role 時仍在每次請求重新查詢 site owner 與 membership；不存在或已移除的 membership 回非洩漏 `404`，不快取角色。
- invitation safety：32-byte Web Crypto token 只在建立回應出現一次，Postgres 只存 SHA-256 digest；邀請綁定正規化登入 email、15 分鐘至 7 天期限、單次使用，接受時鎖列並原子寫 membership／accepted state／audit。
- log/cache safety：code review 發現 URL token 會被 Hono logger 記錄，已改為 `POST /api/invites/accept` JSON body；所有協作回應帶 `Cache-Control: private, no-store`，list／RPC 回應不包含 digest。
- asset boundary：editor upload 仍寫入 authoritative owner 的 `draft/users/<owner>/sites/<site>/...` 路徑與 owner metadata；viewer 只能 list／preview，legacy migration 仍 owner-only。
- full unit：156 passed（shared 59 + API 79 + web 18）。
- typecheck：pass（shared、API、web）；build：pass（shared、API Wrangler dry-run、web Vite）。
- full E2E：74 passed（Chromium，30.0s），包含全部既有 auth、publish、asset migration、OC、scroll 與 responsive regressions。
- `git diff --check`：pass；release code review 修正 raw invite token logging 後，API full suite 79/79 與 typecheck/build 再次通過。
- staging DB：`supabase db push --dry-run` 只列出 `0006_site_collaboration.sql`；正式 push 成功，remote migration history 顯示 0001–0006 全部一致。
- staging Worker：`https://retrodesk-api-staging.beibeiz.workers.dev`，version `324d3446-7eb4-4dcf-afe5-8192aebc92e1`，以 `--env staging --keep-vars` 保留 dashboard secrets/vars；startup 52ms。
- live smoke：health `200`；未登入 `/api/sites` 與 `POST /api/invites/accept` 都是 `401`，後者含 `private, no-store`。本段沒有 web runtime 變更，因此沒有重發 Pages。

## #21B2 collaboration UI and invitation acceptance

驗證日期：2026-10-16（Asia/Singapore）。本節完成 #21 的前端協作入口、角色介面與安全邀請接受流程；搭配 #21A／#21B1 後，#21 的規劃範圍已形成可用閉環。

- 規格與計畫：`docs/superpowers/specs/2026-10-16-collaboration-ui-21b2-design.md`、`docs/superpowers/plans/2026-10-16-collaboration-ui-21b2.md`。
- 實作 commits：web contract `73b370e`、安全邀請 `7f4f1b7`、viewer 私人草稿 `c8087b5`、editor 權限 `7323366`、owner 協作者管理 `d815ebc`、review hardening `b91100e`。
- invitation safety：邀請 token 只從 URL fragment 讀取，立即從網址移除，僅暫存於 `sessionStorage`；不使用 query string／`localStorage`，不破壞 Supabase OAuth hash。接受邀請沿用 `POST` JSON body，成功或 terminal error 清除 token，暫時性登入／網路錯誤保留可重試狀態。
- role-aware UI：owner 可發布與管理協作者；editor 可編輯、儲存及上傳，但不可發布、遷移舊素材或管理協作者；viewer 直接進入唯讀私人草稿，不掛載 editor，也不產生 autosave／upload／publish 等作者副作用。
- immediate revocation：editor 儲存遇到失去權限會立即退出作者介面；遠端重新載入若角色降為 viewer，也會離開 editor 並顯示通知。
- owner management：協作者視窗支援成員列表、邀請建立／撤銷、角色更新與移除確認；邀請 URL 僅在建立後顯示一次。包含 loading／empty／error 狀態、Escape、初始焦點、焦點返回與 320px 觸控尺寸。
- full unit：175 passed（shared 59 + API 79 + web 37）。
- typecheck：pass（shared、API、web）；build：pass（shared、API Wrangler dry-run、web Vite）。非阻斷訊息只有既有 Wrangler sandbox log-file EPERM、multi-environment、Zod PURE comment 與 bundle-size warning。
- full E2E：83 passed（Chromium、單 worker、32.7s），涵蓋 invitation、owner/editor/viewer、權限變更、唯讀草稿、全部既有 auth／publish／asset／OC／scroll／responsive regressions。
- `git diff --check`：pass；milestone code review 已修正 Supabase OAuth fragment、mutation error retention、invalid viewer draft、nested main、權限撤銷退出與邀請 retry，最終無未解阻斷項。
- Impeccable detector：依規定只執行一次；兩項輸出分別是既有側頁籤提示（`w98.css:462`）及真實網格畫布的 decorative-grid 建議（`w98.css:252`），均由既有 commit `e0389e69` 引入，非本段 regression，經人工覆核豁免。
- Cloudflare Pages staging deployment：`2c597bc1`。canonical：https://retrodesk-staging.pages.dev；immutable：https://2c597bc1.retrodesk-staging.pages.dev；bundle `index-tzrzBCWz.js`／`index-CII9sC4A.css`。Worker 無 runtime 變更，維持 #21B1 version。
- HTTP smoke：canonical／immutable 的 `/`、`/invite` 均為 `200` 且指向相同新 bundle；API `/api/health` `200`；bundle 含協作者、唯讀私人草稿與邀請文案，不含 fallback `example.supabase.co` 或 `localhost:8787`。
- live browser smoke：以假 token 開啟 `/invite#token=…` 後，網址立即變成無 fragment 的 `/invite`；staging 正確辨識登入帳號並只顯示「切換 Google 帳號／接受邀請」。未送出假邀請，不修改任何協作資料。

## #22A Music Player direct-link milestone and collapsible editor sidebars

驗證日期：2026-10-16（Asia/Singapore）。本節完成 Music Player 的 HTTPS 直連／外部作品連結第一里程碑，並依作者要求讓桌面編輯器左右側欄可獨立收合；音訊檔案上傳仍保留在 #22B，因此 #22 維持 OPEN。

- 規格與計畫：`docs/superpowers/specs/2026-10-16-music-player-22-design.md`、`docs/superpowers/plans/2026-10-16-music-player-22.md`；側欄補充規格為 `docs/superpowers/specs/2026-10-16-editor-collapsible-sidebars-design.md`、`docs/superpowers/plans/2026-10-16-editor-collapsible-sidebars.md`。
- Music Player：versioned v2 contract 支援 playlist、曲序、封面、HTTPS 音訊、外部連結、角色引用、權利說明與歌詞；public projection 會裁掉未公開角色引用，profile 刪除／轉接會同步檢查 music track。
- 播放邊界：全站共用單一 lazy `Audio`；只在明確操作後播放，切換播放器會停止舊來源，最小化持續、關閉／離站停止。載入、播放與原生 media error 都顯示真實失敗，不偽裝為播放中；編輯試聽時改網址或來源會立即停止舊音訊。
- 作者／訪客介面：作者可新增、排序、刪除並重載播放清單，設定封面、來源、角色、權利說明與歌詞；訪客可播放 HTTPS 直連或明確開啟外部作品頁。進度僅在來源可 seek 時啟用，音量與原生 range 都可鍵盤操作；320px 控制維持可達。
- editor sidebars：左右側欄各有 Win98 邊界把手，可獨立收合／展開並讓桌面即時撐滿；偏好只存在 browser local storage，不進草稿、undo、autosave 或發布資料。768–1023px 維持既有右欄隱藏規則，手機維持單一 mobile editor。
- full unit：182 passed（shared 61 + API 79 + web 42）。
- typecheck：pass（shared、API、web）；build：pass（shared、API Wrangler dry-run、staging-env web Vite）。非阻斷訊息只有既有 Wrangler multi-environment、Zod PURE comment 與 bundle-size warning。
- full E2E：89 passed（Chromium，35.3s），包含播放 singleton／最小化／關閉／失敗、作者清單重載、試聽來源切換、320px、左右側欄鍵盤與重載記憶，以及全部既有 auth／publish／asset／collaboration／OC／scroll／responsive regressions。
- `git diff --check`：pass；完整 diff review 修正 MobileEditor music inspector 的不完整 type branch、visitor 不可能狀態的空畫面、試聽來源修改生命週期與舊 registry 驗收基準，最終無未解阻斷項。
- Cloudflare Pages staging deployment：`bba5517d`。canonical：https://retrodesk-staging.pages.dev；immutable：https://bba5517d.retrodesk-staging.pages.dev；bundle `index-CsiNArXX.js`／`index-Bse8-w2m.css`。Worker 無 runtime 變更，維持 #21B1 version。
- HTTP smoke：canonical／immutable `200` 且 ETag 一致；線上 bundle 含 Music Player 與 `retrodesk:editor-sidebars`，使用 staging API/Supabase，不含 fallback `example.supabase.co` 或 `localhost:8787`。
- live browser smoke：以已登入 staging 帳號進入真實 editor，確認「音樂播放器」新增入口、左右兩個 `aria-expanded` 收合控制均存在；實際收合左欄後工具面板消失並出現「展開左側工具欄」，隨後還原，未修改站點草稿。
- Issue 狀態：#22A 可獨立上線；#22 保持 OPEN，下一段 #22B 需先完成音訊 MIME／byte／quota、private storage、Range／HEAD、刪除引用與發佈投影安全設計，不能直接放寬既有圖片端點。

## Collaboration recovery and multi-desktop hub

驗證日期：2026-10-17（Asia/Singapore）。本節修復 staging 協作邀請接受失敗，並解除一個帳號只能進入第一個桌面的流程限制。

- 規格與計畫：`docs/superpowers/specs/2026-10-17-collaboration-recovery-multi-desktop-design.md`、`docs/superpowers/plans/2026-10-17-collaboration-recovery-multi-desktop.md`。
- 實作 commits：migration `79e2753`、安全 RPC diagnostics `726995c`、多桌面 hub `44f6132`、editor／viewer 導航 `8291a1b`。
- invite root cause：`accept_site_invite` 的 `RETURNS TABLE` 輸出欄位包含 `site_id`，原 `ON CONFLICT (site_id, user_id)` 在 PL/pgSQL runtime 會產生欄位／變數歧義；migration 0008 改為具名 primary-key constraint，保留原本 lock、email、期限、單次使用與 audit 邊界。
- API diagnostics：未知 collaboration RPC 錯誤只寫入 operation、PostgREST code/message/details/hint；不記錄 token、email、Authorization 或 request body。已知錯誤仍回穩定 public error code。
- 多桌面流程：登入後固定進入「我的桌面」，同時列出 owner/editor/viewer 站點、發布狀態、更新時間與角色對應動作；可新增桌面。editor 與私人 viewer 頁的品牌連結都回到 `/auth` hub。
- focused verification：migration 5/5、collaboration API 11/11、hub E2E 4/4、collaboration + hub E2E 13/13。
- deployment gate：typecheck 全過；full unit 197 passed（shared 62 + API 92 + web 43）；full E2E 94 passed；shared/API/web build 全過；`git diff --check` pass。非阻斷訊息只有既有 Wrangler sandbox log、multi-environment、Zod comment 與 bundle-size warning。
- visual QA：desktop 與 mobile hub 都確認無水平 overflow、角色／狀態層級清楚、主要動作可見；Impeccable detector 依規定只執行一次，唯一輸出是既有 `global.css` Win98 border，不是本段 regression。
- staging DB：dry-run 只列出 `0008_fix_accept_site_invite_conflict.sql`；正式 push 成功，remote migration history 顯示 0001–0008 一致。
- GitHub Actions run `38945650647` 的 install／verify 已通過，但 deploy step 因 staging environment 的 `CLOUDFLARE_API_TOKEN` 為空而停止。改用既有本機 Wrangler OAuth 部署並以 `--keep-vars` 保留 dashboard secrets/vars；未將任何秘密寫入 repository。
- staging Worker：`https://retrodesk-api-staging.beibeiz.workers.dev`，version `45a55ac0-629f-4a53-bc65-cce3033439a1`。
- Cloudflare Pages staging deployment：`21e6ab83`。canonical：https://retrodesk-staging.pages.dev；immutable：https://21e6ab83.retrodesk-staging.pages.dev；bundle `index-CrMqKnua.js`／`index-BFwdSfpi.css`。
- live HTTP smoke：API health、canonical `/`、`/auth`、`/invite` 與 immutable `/` 均為 `200`；canonical bundle 含「我的桌面／新增桌面／協作編輯／回到我的桌面」，且不含 `example.supabase.co` 或 `localhost:8787` fallback。
- live authenticated browser：既有 owner 帳號在 `/auth` 顯示 1 個桌面、擁有者角色、未發布狀態與編輯動作；進入 editor 後品牌連結指向 `/auth`。沒有第二個可安全操作的已知 staging Google 帳號，因此未建立一次性邀請或變更成員；跨帳號接受由 migration/API/E2E 覆蓋，不宣稱真人雙帳號驗收。
