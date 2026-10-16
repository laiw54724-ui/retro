# #18 擴充現有 App registry、版本遷移與發布安全邊界

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。#2–#7 是已關閉的歷史基礎，不重開、不重做。原始 Issue 需求已保存於本地 original-issues.json。

## 獨立調查

- [registry.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/registry.ts) 已有 document／gallery／links／about／instagram 五種模組及 View／InlineEditor。原單「新建 registry」應改為擴充。
- [types.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/types.ts) 的上下文只有視窗清單、連結與圖片上傳；缺少共用角色解析、內容版本與 capability 契約。
- [site.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/packages/shared/src/site.ts) 只有 schemaVersion: 1，normalizeDocument 驗證失敗會強制當作合法資料回傳，不適合接多版本。
- [sites.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/api/src/routes/sites.ts) 發布讀取草稿後分別寫版本、目前快照與 R2；檢查版本和最後寫入之間不是同一原子操作。加入新資料時應補競態測試，不假設現有流程已涵蓋。
- [assets.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/api/src/routes/assets.ts) 原始媒體 URL 可匿名存取。草稿／視窗隱藏不是私密素材保護。

## 設計決定

採最小增量，不建立外掛執行器、微服務或全站事件匯流排。保留現有 React／Zod／Zustand；本單不需新增套件。

**18A：共用契約與版本。** SiteDocument v2 增加 site 級內容實體區；Window 只保存 app 類型、入口引用與顯示設定。穩定 ID 不隨名稱改變。具型別的 EntityRef 初期支援 window／profile／post；folder 等由後續單擴充。registry 宣告 schema version、default factory、View、Editor、能力與 mobile presentation。server schema 不匯入 React。

提供 parse → migrate → validate → resolve 流程；未知未來版本只能顯示不支援／唯讀復原，不可默默寫回或截斷。遷移由 #19 補入具體 IG 映射；相同輸入產生相同 ID、重跑不重複。

**18B：發布與素材邊界。** server 的 public projection 決定可發布實體及其引用閉包，UI 不負責保密。published_document、公開 R2 JSON、深連結、SEO、公開匯出必須只讀同一個版本的 projection。owner 私人備份另行授權，不共用匿名匯出端點。

新草稿媒體走驗證身分的讀取通道；發布時建立可公開的不可變媒體引用。收回發布無法收回已被下載的內容，UI 必須說清楚。舊公開 URL 不可事後宣稱變成私密；需列出舊媒體、複製至受保護位置、替換引用並處理公開副本／快取。未通過這組測試前不提供「私密」承諾。

DB 端以 transaction／RPC 對 expectedVersion、site_versions、published pointer 原子更新；R2 使用版本化 artifact 與可重試狀態，不能以寫一半視為發布成功。若同步失敗，UI 顯示待重試而不是「已全部更新」。先決定 DB 為權威來源，public API 不依賴可過期的舊 R2 alias。

## 工作拆分與檔案

1. shared：新增 versions、entity refs、public projection、fixtures；修改 packages/shared/src/site.ts、index.ts。先測五種舊模組 round-trip、未知版本、壞引用。
2. web：修改 modules/types.ts、registry.ts、site/WindowRenderer.tsx、editor/store.ts；新增共用 resolver。一次角色編輯／排序是一筆 undo transaction。
3. API：修改 routes/sites.ts、assets.ts；新增 migrations 與發布競態／資料過濾測試。受保護媒體不得沿用匿名 wildcard 通道。
4. 漸進開啟：server 先可讀 v1/v2，再更新 client；v2 寫入用開關控制。保留遷移前備份，回退版本必須能讀 v2，不直接部署只懂 v1 的舊 client。

## 驗收

- [ ] 五種舊視窗資料、幾何、主題、連結、undo／redo／autosave 不退步。
- [ ] 遷移 deterministic、idempotent；壞資料有診斷且不覆蓋原檔。
- [ ] 跨 site EntityRef 被拒絕；刪除引用目標先列出受影響內容。
- [ ] 同時兩個發布／編輯競態只產生一致版本；R2 失敗可重試且不假成功。
- [ ] 草稿角色、貼文、關係名稱、素材 URL 不出現在匿名 JSON、R2 manifest、OG 或公開匯出。
- [ ] 已知私密資產 key 也無法匿名取得；不能只測猜不到 URL。
- [ ] 新模組可註冊而不修改無關視窗拖曳／任務列程式。

## 依賴、風險與順序

18A 是 #19／#20／#21A／#28A 的共同基礎；18B 是所有「私密／草稿素材安全」的上線門檻，不把它藏在 #28 的尾端。#27 素材審核並行。18A 不必等音樂、畫布、Explorer 的全部 schema。

風險最高：遷移資料遺失、發布競態、隱私假象。規模 L，先做 migration fixtures 和匿名資料契約再動 UI。#19／#20 可用 fixture 開發，但正式發布必須通過 18B。
