# #21 具名虛構互動；真正多人協作分階段

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。#2–#7 是已關閉的歷史基礎，不重開、不重做。原始 Issue 需求已保存於本地 original-issues.json。

## 獨立調查

[IgPreview.tsx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/IgPreview.tsx) 的粉絲數由文字去非數字後 parseInt；「1.2K」可能被讀成 12。現有統計不是角色名單，不能點入角色。
[useIgSession.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/useIgSession.ts) 的訪客讚、收藏、留言是記憶體狀態，不是已保存的真實社群資料。
[資料庫 migration](https://github.com/laiw54724-ui/retro/blob/e4d9722/supabase/migrations/0001_initial.sql) 以單一 owner_id 為邊界，尚無 membership／invite。兩種「多人」不可混成一張小功能。

## 21A：首發必做——作者編排的角色社群

站內角色皆由 owner 控制。FollowEdge 為 fromProfileId → toProfileId；禁止自己追蹤自己及重複 edge。Post 的 namedLikerIds 去重；Comment 的 author 為 profileRef 或 legacyText，舊文字不自動配到同名角色。所有引用必須同 site。

具名數量從角色關係計算；可另填非負整數「其他虛構人數」。總數 = 具名數 + 其他人數，不接受總數少於具名人數。舊文字數字保留為 legacyDisplayLabel，作者轉成數字前不自動加減；不捏造額外人物。

粉絲／追蹤／喜歡者數字可打開名單，點頭像進 OC 頁。有匿名額外數量時顯示「另有 N 位虛構角色（未設定名單）」。公開投影須先移除草稿角色與關係再計數，不洩漏隱藏角色存在。

作者流程：點統計或貼文讚區→「角色互動」→搜尋、多選 OC、快速建立角色→預覽。留言以角色選擇器挑作者，支援排序和文字編輯。關係選擇不要求輸入 ID。

視覺標示採「角色世界觀內容」常駐小標＋說明，不每一列都重複警告。訪客體驗的愛心／收藏另標「僅本次瀏覽」，不加進作者設定的世界觀統計；第一版不接受公開持久化訪客留言，既有暫存試玩留言也要清楚標示。

## 21B：後期——真正多人共同編輯

保留本單第二里程碑，不讓它阻塞 21A。最小角色為 owner／editor／viewer；只有 owner 邀請、移除成員、發布及刪站。editor 可改草稿，不可擴權；viewer 僅讀被授權草稿。

需要 membership、單次且到期的 invite token、撤銷、審計、API 權限檢查與 RLS。先做非同步協作＋既有版本衝突處理；不承諾即時游標或自動合併。真實公開訪客互動另依 #25B 審核與濫用控制，不把「有帳號」當成免審核。

## 開源選型

21A 不需要社群後端套件。21B 沿用 Supabase，依 [官方 RLS 文件](https://supabase.com/docs/guides/database/postgres/row-level-security) 設計 policy；service role 路徑仍須自行驗證 membership。禁止直接套用 clone 中「user ID 就是作者 ID」的假設。

## 工作拆分

1. shared：relationship／actor schema、計數 selector、公開投影與遷移。
2. web：RelationshipPicker、PeopleList、ActorCommentEditor，接 #19 導航與 #20 貼文。
3. 測試具名數＋匿名數、草稿裁剪、同站限制、導航返回、owner 編輯 undo。
4. 21A 驗收後才開始 21B 的 migration／API／邀請流程與權限矩陣測試；兩里程碑各自發布。

## 驗收

- [ ] A 追蹤 B，B 的粉絲名單出現 A；刪邊兩側同步。
- [ ] 為同一貼文指定 A、B 喜歡；名單可點入，不靠文字相似度配對。
- [ ] 名單、額外數字、留言排序存檔後一致，undo 可還原。
- [ ]  legacy「1.2K」、空字串、重複 ID、跨站 ID 都有明確處理。
- [ ] 草稿角色不出現在公開名單、計數、留言作者或原始 JSON。
- [ ] 訪客操作不改 owner draft、不冒充其他角色、不假稱已存到雲端。
- [ ] 21B：邀請過期／撤銷／重放無效；成員被移除後立即失去 API 權限；editor 不能發布或提權。
- [ ] 21B 未完成前保持單 owner，不暴露半成品邀請按鈕。

## 依賴與風險

21A 依 #18A、#19、#20 貼文 ID；18B 是發布門檻。21B 依安全審核和獨立權限設計，不需要音樂或 Moodboard 完成。規模：21A M，21B XL。核心風險為虛構與真實身分混淆、計數洩漏、授權繞過。
