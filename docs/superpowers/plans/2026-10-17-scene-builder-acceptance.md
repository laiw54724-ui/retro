# Scene Builder 分期驗收、依賴與研究驗證紀錄

狀態：**研究交付；Scene runtime cases 全部待實作／待執行。**

- Issue：[Retro #54](https://github.com/laiw54724-ui/retro/issues/54)。
- 設計：[Scene Builder 技術設計](../specs/2026-10-17-scene-builder-design.md)。
- 稽核基準：`aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`。
- 分支：`docs/retro-scene-builder-plan`；日期：2026-10-17（Asia/Singapore）。
- 本次只新增本文件、設計文件及 [verify-design.mjs](../../research/scene-builder/verify-design.mjs)。

## 1. 這次交付與後續實作分開

本次完成來源研究、架構提案、風險／依賴盤點、既有程式的相關基線單元測試與文件完整性檢查。以下 SC-01～SC-40 是**後續 runtime 驗收規格**，不因這個文件 PR 合併而變成 PASS。

不改 runtime、shared schema、store、registry、CSS、API、SQL、package scripts 或 lockfile；不 merge、不部署、不直接 push main。Draft PR 使用 `Refs #54`，不使用關閉 Issue 的關鍵字。

## 2. 分期、責任與進入條件

| 階段 | Deliverable | 進入 gate | Exit gate／證據 |
| --- | --- | --- | --- |
| Research（本 PR） | 設計、來源、依賴／衝突表、40個case與文件checker | 最新main/Issues/相關PR已讀 | docs-only diff；來源連結與case對照通過；實測和待測分開 |
| W6a0 | v3契約、public/author parser、reader/adapter、migration fixtures、save/降版guard | 整合者核准D-01～D-08；#49 W1a/#50 W2a/#51 W3a接口與#41model已協調 | SC-03/04/24～34的相關unit/integration通過；reader先上，writer關閉 |
| W6a | App/image單選、拖曳、resize、order、lock/hide；mode邊界；desktop DOM parity | W6a0合併；WindowChrome與Image/View能力可用 | SC-01/02/05/07～15/24～27/35～37；一次gesture一次commit與正確API計數 |
| W6b | Layers、多選/框選、對齊、分布、snap、群組、visuals、duplicate/clipboard | W6a command/ID/host穩定 | SC-06/16～19及SC-10～15擴充；world frame與ref graph可逆 |
| W6c | mobile independent/auto/scale、presentation capability、visitor行為完整矩陣 | #41與#50 session/navigation一致；W6b groups穩定 | SC-20～23/35～40；320/375/390/430、真機、200% zoom |
| W6d | 公開、transfer、複合真App、50/100壓測、release runbook | 前階段有代表性fixture；#52/#53可用則驗真實內容 | 全SC矩陣有實測；限制、設備、失敗／修正、rollout/rollback可審核 |

W6a0是為#54 W6a增加的契約前置子PR，不改Issue的W6a/b/c/d整體方向。W6a需先實作behavior/session骨架，避免拖曳完成後又重做focus/store；W6c才驗完整手機行為。W6a0至W6d每個runtime PR在merge前仍遵守repo的contributor gate，不能引用本次文件檢查跳過必要驗證。

### 相依事項（未視為已完成）

- [ ] **#49 W1a**：穩定Chrome slots、handle props、min size/work-area metrics、role/control capabilities；保留PR#38 appearance resolver。
- [ ] **#50 W2a**：唯一typed dispatcher，normal-run/barrier、fixed reader navigation、modal focus return、media ownership及有效presentation capability。
- [ ] **#51 W3a**：image schema／stable asset／alt／crop／fit／無框模式、publication/ref traversal；Scene只引用image window。
- [ ] **#41**：canonical snapshot的scope-specific presentation；preview-current與publishable區分；全部路徑帶OC directory/theme/targets。
- [ ] **#29**：stable destination IDs、缺target的typed fallback、/oc與/post暫態viewer；不以標題尋找。
- [ ] **#35/#36**：Appearance tokens／Template邊界，不把Scene座標混入換色模板。
- [ ] **#43/#44**：upload target generation、原window/node回寫；保留OC canonical/legacy相容，不在Scene重做業務UI。
- [ ] **#52/#53**：Music/Paint不是W6a前置，但正式複合fixture必須驗真實App；不能以外框截圖代替。
- [ ] **#32/#33**：新UI四語；作者OC、node label、文章與使用者內容不可自動翻譯。

## 3. Fixture 套組（待新增；不含使用者私有資料）

| ID | Fixture內容 | 用途 |
| --- | --- | --- |
| FX-L1 | v1：相同z、非排序mobile order、100 windows＋iconX/Y、非defaultOpen、超出建議Scene邊界但合法的finite座標 | adapter、tie-break、200個App/launcher節點容量、超限不丟資料 |
| FX-L2 | v2：至少2個OC、public/draft profile/post/collection、music characterRef、Explorer private branch、SEO | rich data無損、publication/ref清理、舊功能回歸 |
| FX-S1 | v3：2 normal Apps＋fixed IG＋透明decorative image＋launcher；跨normal barrier的重疊 | live DOM、focus、order、taskbar、capability |
| FX-G1 | depth 3群組、非連續selection、locked descendant、旋轉visual與App min-size | group/reparent、inverse、clamp、lock closure |
| FX-M1 | desktop與independent/auto不同groups；scale hidden set；mobile-only node；inherit source | 每tree隔離、策略切換、移除來源、5種presentation |
| FX-P1 | draft image/document App＋public launcher/action；inactive mobile私圖；shared public/private asset；私label marker | payload與asset-copy防洩漏，不只檢查DOM |
| FX-A1 | 慢save A、scene-only edit B、reload/site switch、409/403、慢upload＋delete/undo recreate | revision/epoch/request ID/generation |
| FX-H1 | 真正可用的IG、Gallery、播放器、Dialog、Paint、iframe測試App；50/100 scene leaves；GIF比例固定 | lifecycle、事件邊界、perf與實機 |

Fixture素材用自製或repo允許且可重新分發的來源。新外部素材需依repo資產manifest程序，不能用使用者OC截圖當公開回歸資產。#52/#53尚未完成時，可先用contract fixture驗slots/state，但report必須標為替身，真App case保持待測。

所有fixture要包括canonical JSON、預期public JSON、effective scene model及必要的asset identity映射。不要把當前網站／production資料輸入測試。

## 4. 分期验收案例

Oracle是判定通過的依據；測試位置是**未來建議**，不是本次新增的runtime檔案。下表所有狀態預設為「待實作／待執行」。

| Case | Invariant | Phase | Fixture、操作與明確oracle | 未來測試層 |
| --- | --- | --- | --- | --- |
| SC-01 | INV-01 | W6a | FX-S1：同App改Chrome、移動、resize、focus、max/restore；node/window/OC/asset identity不變，App不是圖片，host mount counter不增加 | web component＋E2E |
| SC-02 | INV-01 | W6a | FX-S1：image切none/simple/viewer/paint frame；同source/alt/crop；兩launcher指同window只focus同instance。decorative沒有dialog/tab/action，transparent不變白底 | shared＋#51 component＋E2E |
| SC-03 | INV-02 | W6a0 | FX-L1/S1：重複ID、同tree重複placement、window沒有唯一identity、cross-site/缺ref、cycle、depth/node limit、非法kind/rotation；每例有穩定diagnostic path，拒绝且保留輸入 | shared schema unit |
| SC-04 | INV-02 | W6a0 | source相同重跑resolver得到相同frames/ranks；children[0]最背；z同值legacy按index；手機inactive tree也驗ref；不持久化parentMap/z鏡像 | shared resolver unit |
| SC-05 | INV-02 | W6a | FX-S1：25/50/100/200% canvas zoom、canvas offset、page scroll、DPR1/2、軸邊界；相同world delta得到相同persisted frame（容差≤0.01 CSSpx） | geometry unit＋E2E |
| SC-06 | INV-02 | W6b | FX-G1：rotation以center、border-box AABB不含shadow/outline；group深層frames/width/height同時更新；非等比resize旋轉leaf或越limit整組拒绝／clamp | geometry unit |
| SC-07 | INV-03 | W6a | FX-S1：select/focus/open/min/max/restore/pan/zoom後canonical hash、past/future、dirty不變且無新PUT /draft；先等待fixture初始migration/save完成 | store＋E2E exact endpoint |
| SC-08 | INV-03 | W6a | [A normal,B normal,C fixed,D normal]，focusA只得[B,A,C,D]；decorative/group也是barrier；explicit authored reorder才改tree且可undo | resolver/runtime unit＋E2E |
| SC-09 | INV-03 | W6c | fixed點內容不改位置或rank；normal自由frame可依capability拖/resize，flow不得拖；max填同一viewport work area，restore rect/order不漂移。fixed閱讀入口back不是close固定node | runtime unit＋E2E |
| SC-10 | INV-04 | W6a | 5秒200次pointermove：期間0 canonical patch/0autosave，up後1history及idle後1有效PUT /draft。無位移up為0；與前一typing操作不合併 | store instrumentation＋E2E |
| SC-11 | INV-04 | W6a | 每種pointercancel/lostcapture/Escape/第二pointer/切artboard/site/resize container/刪target：DOM恢復before frame、capture釋放、0history/0save。正常up後lostcapture不二次rollback | gesture unit＋E2E |
| SC-12 | INV-04 | W6b | 多選move/resize、長按nudge到keyup、group/ungroup、策略切換一次一筆；undo/redo還原完整canonical tree、content refs及合理selection | store unit＋E2E |
| SC-13 | INV-05 | W6a | select mode點/Tab/Enter不可啟動連結、音樂、iframe；content-edit只有editingNodeId可輸入。切模式不丟IME文字；preview快捷鍵不undo背景 | component＋E2E |
| SC-14 | INV-05 | W6b | FX-G1：鎖leaf後拖未鎖parent、reparent/hide/delete/paste入鎖group皆整組阻止；鎖物件可Layers選取/解鎖，內容編輯仍可；hidden不被框選或占flow | command unit＋E2E |
| SC-15 | INV-05 | W6c | input/contenteditable descendant/IME composing時不搶undo/nudge；Escape只被最內層消費；modal Tab trap＋focus return。觸控App pan-y、range、Paint/iframe與handle不搶pointer | E2E＋WebKit/真機 |
| SC-16 | INV-06 | W6b | FX-G1：group/ungroup/reparent前後所有world border boxes與相對rank不變；normal不得進group；非連續siblings grouping明確阻止，不能偷偷重排 | geometry/command unit |
| SC-17 | INV-06 | W6b | group scale以所有min/max一次求可行區間；locked descendant阻止；nested group bounds同步。desktop group改動不改mobile，global fixed→normal若另一tree在group則拒絕 | command unit＋E2E |
| SC-18 | INV-06 | W6b | duplicate group：新node/window/group/VisualId完整map，內部action重綁複本、外部target保留；OC/asset按契約共享，改複本文字不改原本；跨site私asset拒絕／列缺件 | shared operation＋transfer unit |
| SC-19 | INV-06 | W6b | placement/node/window/group刪除選項各有語意；刪App列launcher/link/action/Explorer referrers，一次cascade可undo；刪全部placement保留App identity；不刪OC/entity/R2 bytes | store＋shared refs＋API mocks |
| SC-20 | INV-07 | W6c | 三策略×五override＋undefined＋kind能力矩陣；scale只有desktop-derived tree/hidden set；auto root不得frame但group children可frame；decorative不得single-window；非法回diagnostic | shared resolver unit |
| SC-21 | INV-07 | W6c | FX-M1：nested desktop world→mobile local inherit；mobile group move前materialize後代同transaction；cancel不留materialize；移除desktop來源前保全mobile並清scale set；locked依賴阻止 | geometry/command unit |
| SC-22 | INV-07 | W6c | scale/auto→independent可選恢复/以目前結果建立；undo/reload保留inactive layouts但不render；mobile-only節點明確frame/flow，無來源inherit不得落(0,0) | store＋resolver＋E2E |
| SC-23 | INV-07 | W6c | 390→320混合座標：absolute100→82.05；gutter12 full-width=296、height200不縮小。無ratio不能猜1:1；flow不互撞。App fit group有可讀的閱讀入口；單窗back回原focus | geometry unit＋E2E＋真機 |
| SC-24 | INV-08 | W6a0 | FX-A1：saveA pending後scene-onlyB，legacy不變；A ack只能confirm A，B仍dirty並再送。A過期response不得改新site/version/status或清新request的guard | store/API unit |
| SC-25 | INV-08 | W6a0 | scene-only變更顯示尚未發布；publish捕捉source revision，pending時又改草稿，完成不把新草稿當published；projection等價比較不靠legacy | store＋publish integration |
| SC-26 | INV-08 | W6a | 409停止autosave、完整canonical backup含所有tree；403/404停止提交；reload/site switch後old request無效。unknown/invalid文件只讀與raw備份，不能降版save | API＋store＋E2E |
| SC-27 | INV-08 | W6a | upload pending時切node/site、delete、undo recreate同ID、新generation；完成不寫錯欄、不復活node；成功素材可重試管理，拖動不發upload | #43 adapter unit＋E2E |
| SC-28 | INV-09 | W6a0 | FX-L1/L2：v1→既有v2→v3 deterministic；v3→v3 identity；無mutate、無defaults污染；超limit保留raw/legacy讀取，不clamp或批次save；App+launcher容量可容100舊windows | migration unit |
| SC-29 | INV-09 | W6a0 | server已有v3且fresh expectedVersion，incoming v1/v2一般save仍拒绝；stale v3仍409；所有reader/OC操作/SEO/export/import/guestbook SQL兼容v3 | API/contract/migration unit |
| SC-30 | INV-09 | W6d | 關writer flag後已存v3可讀/備份；不退成v2 reader；演練loss-report downgrade及新published version回退，舊artifact不變。無restore工具時此case不得PASS | disposable environment runbook |
| SC-31 | INV-10 | W6a0 | FX-P1：draft image/document identity＋public launcher/action/inactive mobile；public nodes、windows、visuals、labels、refs及copy名單均無私marker/asset；published共享asset仍正常保留 | projection＋publish-assets unit |
| SC-32 | INV-10 | W6b | 私leaf剪除後group frame與存活child local不變；single-child保留、empty刪除；desktop/independent/auto/scale set全清。public parser/reprojection idempotent，author輸入不mutate | shared projection unit |
| SC-33 | INV-10 | W6d | public export→explicit publicToAuthoring import補editor-only欄位後validate；owner backup保留私node/兩mobile樹；manifest列素材不含bytes，scene字段無漏項、無signed/raw URL | transfer shared/API/E2E |
| SC-34 | INV-10 | W6d | import跨site ID remap及preview digest完整；2MiB超限拒收。publish private copy失敗不commit，RPC conflict不報成功，artifact失敗重試同一published version | API integration |
| SC-35 | INV-11 | W6a | 同snapshot的currentDraft/publishable/public model：OC directory、theme、post/collection、targets；publishable/public geometry與asset identity相同，私內容僅授權preview可見 | presentation unit＋E2E |
| SC-36 | INV-11 | W6c | /@handle、/oc/:id、/post/:id、DraftViewer、兩preview viewport；hidden或無activeplacement普通scene action回unavailablePresentation；公開entity可暫態viewer且不persist | routes E2E |
| SC-37 | INV-11 | W6c | mount counter只有一套live App；Chrome/geometry/save不remount；切artboard停止media不autoplay；退出preview只清其session、selection/viewport恢復；preview Guestbook不送真寫入API | lifecycle/component＋E2E |
| SC-38 | INV-12 | W6d | FX-H1：50/100 nodes、GIF/圖片/重App比例固定；量frame time/input-to-paint/long tasks/初載/記憶體/mount數。hidden不mount，active音樂與表單不被viewport lazy策略丟掉 | browser performance report |
| SC-39 | INV-12 | W6c | 320/375/390/430、767/768、1024/1440＋200% browser zoom；真手機明選desktop仍可見且Fit/Pan可達；反向desktop選mobile正常；軟鍵盤/safe-area/landscape | responsive E2E＋iOS/Android |
| SC-40 | INV-12 | W6d | 鍵盤全流程、touch/pen、長中英日韓label、透明/極端比例/壞圖/慢網、GIF/reduced-motion、iframe/canvas；computed styles＋代表性screenshots人工看；不以class存在代替 | accessibility＋visual＋真機 |

## 5. 操作觀測與測試 oracle 的細節

### 5.1 正確觀察 canonical 與 API

未來Scene E2E需同時記錄canonical hash、localRevision、history length、saveStatus與**正確的** `PUT /api/sites/:siteId/draft`。把pointermove間每個document patch也計數，避免最後payload看似正確卻中間送出數百次。

現有 `tests/e2e/editor-windows.spec.ts` 的「controls不改document」計數只匹配 `/api/sites/site-1`，實際autosave是 `/api/sites/site-1/draft`。因此不能引用該測試的零請求當Scene不寫入證據。此文件PR不修那份測試；W6a新增Scene suite時修正oracle，或另提一個小測試PR。

使用canonical v2/v3 fixtures，或先等待v1→v2初次save完成再清計數。Gesture結束後等650ms debounce及網路idle；不得靠過早assert 0來跳過autosave。多個独立gesture若在debounce內合併到單一HTTP快照是允許的，但每個gesture仍各有一筆history，不能宣稱每個手勢必須強制獨立HTTP。

### 5.2 幾何／視覺

Pure geometry先驗矩陣/world frame/order，DOM再用getBoundingClientRect/computed style驗實際box、inert、overflow、frame metrics。Screenshot比較覆蓋代表性構圖，人工檢視透明、字型、control target與主要App可用性。Chrome、字型與browser存在差異時記錄測試平台，不宣稱Chromium代表Safari完全相同。

Frame容差以CSS pixels記錄，不以DPR當容差來源。200% browser zoom與200% editor canvas zoom是兩個測項；前者關係閱讀與media query，後者關係geometry inverse。手機full-width內容是viewport-space，必須使用其host的inverse而非全局scale。

### 5.3 私有資料與素材

使用可辨認且非真实秘密的marker，例如fixture內的私node名稱、raw source及私asset UUID；比對public JSON、metadata、DOM、media manifest與copyReferencedAssets mock。只有公開DOM沒有marker仍不足。

Publishable preview用private provider讀已授權stable asset，public是immutable asset URL；oracle比對asset identity／image內容而非短效URL。Preview不能發生Guestbook或其他visitor-write API；Public才另驗既有訪客寫入權限。

### 5.4 效能報告欄位

每筆報告至少保存commit、fixture ID、node/app/GIF數、設備CPU/RAM、OS、browser版本、viewport/DPR、canvas zoom、網路及CPU節流設定、測量次數、p50/p95、long tasks、initial mount與記憶體。Desktop p95 frame≤20ms、mobile≤33ms為**待實測的提案目標**，不是本次數據。

超標記錄瓶頸與具體縮减方案（例如限制同时動畫數、延遲未啟用App、Layers虚擬化）；不得為達數字直接卸載播放中音樂或未保存表單。節點上限在shared/API/UI一同驗證，拒絕先save後無法載入。

## 6. Rollout／rollback 演練清單

- [ ] R0：整合者核准D-01～D-08與責任檔案；#49/#50/#51/#41接口記錄到契約PR。
- [ ] R1：Author/Published v3 readers、public reprojection、metadata、OC operations、transfer、assets、guestbook SQL全部可讀；writer flags仍關閉。
- [ ] R2：API能宣告支持版本；fresh expectedVersion也無法降版覆寫既存v3。
- [ ] R3：測試站明確啟用Scene前取得完整原始備份；migration一次CAS；超限不改資料。
- [ ] R4：公開projection→asset copy→atomic RPC→artifact各失敗分支均驗過，才開v3 publish。
- [ ] R5：node/mount/perf與diagnostics可觀測，按W6a/b/c/d擴大功能。
- [ ] 回退演練：關writes/migration/publish但保留v3 readers；已存資料可讀與原樣備份。
- [ ] 若需要downgrade：有備份、loss report、explicit conversion、fresh CAS；不可把legacy projection當autosave。
- [ ] 公開回復以新published version發布舊snapshot，舊artifact不覆寫；restore runbook/工具還沒做就不得標完成。

## 7. 本次實際執行的驗證

以下只描述本研究分支的實測；不含PR#38/#47/#48作者回報的數字。

### 7.1 環境與安裝

- Git origin/main：`aa8b75a8a0b90ffc530b3b2d109804070f35d9d2`。
- Node：`v24.19.0`；repo貢獻文件指定Node22，**本次不是Node22完整contributor gate**。
- pnpm：透過npm exec使用repo指定`10.18.2`；全域fallback是11.25.0，沒有拿它改lockfile。
- Vitest：鎖定安裝的`3.2.7`。
- 沒有production credentials；Web基線測試提示Supabase env缺省，這些測試不需要真實登入。

實際安裝命令（專用scratch快取）：

```bash
npm exec --cache /tmp/retro-scene-npm-cache --yes --package=pnpm@10.18.2 -- pnpm install --frozen-lockfile
```

結果：成功，157 packages；lockfile為up to date。pnpm提示略過esbuild/workerd的build scripts；本次沒有因此修改build allowlist，也沒有宣稱已完成build/E2E。

### 7.2 基線單元測試：95 passed

每個命令在下列工作目錄執行，沒有新增或修改runtime測試。

| 工作目錄 | 測試檔數 | Cases | 結果 |
| --- | --- | --- | --- |
| `apps/web` | 4 | 15 | PASS |
| `packages/shared` | 5 | 54 | PASS |
| `apps/api` | 7 | 26 | PASS |
| 合計 | 16 | 95 | PASS |

Web：

```bash
node node_modules/vitest/vitest.mjs run src/features/editor/store.test.ts src/features/modules/registry.test.ts src/lib/asset-reference-audit.test.ts src/lib/publicShare.test.ts
```

Shared：

```bash
node node_modules/vitest/vitest.mjs run test/site.test.ts test/site-versioning.test.ts test/site-versioning-assets.test.ts test/public-projection.test.ts test/site-transfer.test.ts
```

API：

```bash
node node_modules/vitest/vitest.mjs run test/draft-validation.test.ts test/site-contract.test.ts test/public-site.test.ts test/publish.test.ts test/publish-route-assets.test.ts test/transfer-routes.test.ts test/collaboration-sites.test.ts
```

這些通過支持现有store、版本、公開投影、transfer、save/publish基線可測；沒有執行SC-01～SC-40的新Scene功能。新契約仍須在各runtime PR新增能實際驗證行為的unit/E2E。

### 7.3 文件檢查（提交前執行）

```bash
node docs/research/scene-builder/verify-design.mjs
node --test docs/research/scene-builder/verify-design.mjs
git diff --check
git diff aa8b75a8a0b90ffc530b3b2d109804070f35d9d2 --name-only
```

Checker只使用Node內建函式庫，驗證Markdown fence、relative links、固定commit程式引用與line bounds、12個invariants對40cases的完整對照、docs-only範圍。它不引入runtime依賴、不在應用程式或package scripts註冊，不模擬一套假的Scene實作來報PASS。

結果：直接執行checker的6項檢查全部PASS；`node --test --test-reporter=tap`亦exit 0（此環境呈現為1個file subtest）。首次檢查抓到WindowRenderer引用結尾95超出實際75行，修正為17–75後重新執行，6/6 PASS。`git diff --check`通過；scope checker確認只包含核准的3個docs檔案。提交前另檢查staged diff，避免未追蹤檔案沒被一般git diff檢查到。

### 7.4 本次未執行

| 項目 | 原因／後續位置 |
| --- | --- |
| Scene runtime/E2E／50/100壓測 | 本任務明確不實作production程式，SC cases屬W6a0～W6d |
| Chromium screenshots/E2E | 本次無UI改動；環境的Playwright Chromium executable也尚未安裝；未執行、不宣稱視覺PASS |
| Safari/WebKit／真實iOS/Android | W6c/W6d實機驗收；本次只有source inspection |
| `pnpm verify:contributor`、完整typecheck/build | 本次docs-only Draft研究，未請求merge；完整gate保留在repo規定的merge前執行 |
| Deployment／migration／production reads/writes | 不在授權範圍；本次沒有執行 |

### 7.5 交叉審查紀錄

三個唯讀研究分工分別檢查geometry/z-order、persistence/projection、mobile/preview。初稿review確認並修正：

1. Scene draft image若window definition仍在public會漏內容；補唯一identity的publication與window keep-set。
2. React key若含每次localRevision會重掛；改用固定session/host identity。
3. PublicScene剝除editor欄位後需獨立parser及explicit public→author import。
4. Scale獨立tree會有兩套order權威；改為desktop-derived＋hidden set。
5. Auto group需合法child frame，不能全面禁止frame。
6. 刪desktop geometry來源前須materialize仍inherit的mobile entries。
7. Fixed reader navigation與max/close不同；decorative不產互動入口，effective capability需交集驗證。
8. Group rotation/AABB、locked descendant closure、full-width per-host matrix及高度來源補明確規則。

這是文件設計review，不是應用已修復這些問題。

## 8. Draft PR 與剩餘風險

Draft PR說明应包含：本次文件檔案、main基準、Refs #54、D-01～08待審核、#49/#50/#51/#41依賴、95個基線測試與文件checker實際結果，並保留以下限制：

- 核心API尚未落地；型別、limits與phase邊界是待核准提案。
- 固定構圖的barrier與群組限制會影響使用者對「置頂」的期待，需要UI明確說明。
- Reader/public parser/server downgrade guard必須先於writer；單純加scene欄位會破v2 strict parser。
- Mobile多策略設定只複製layout refs，不複製OC；但仍增加文件大小與projection驗證範圍。
- 95項現有測試不涵蓋Scene；Node22完整gate、browser、真機、性能與rollback演練尚待後續。
- 未merge、未部署、未執行資料遷移。本PR合併亦不表示Scene可供使用者操作。

後續任何shared schema、registry、store或global CSS施工前，先回報整合者，由其指定契約owner與分批順序；不要以本研究PR當作直接跨Agent改檔的授權。
