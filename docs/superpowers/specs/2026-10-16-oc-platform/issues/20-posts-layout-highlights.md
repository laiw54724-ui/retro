# #20 OC 貼文、作品布局與圓形精選

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。#2–#7 是已關閉的歷史基礎，不重開、不重做。原始 Issue 需求已保存於本地 original-issues.json。

## 獨立調查

[site.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/packages/shared/src/site.ts) 已有每個 IG 最多 60 貼文、每貼文最多 10 張圖（主圖＋9 張 extra）、caption、location、likes 與文字留言；精選只有一張圖，尚非多頁相簿。

[ig.css:94](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/styles/ig.css#L94) 明確把 Win98 的 avatar、highlight ring 一起設為 border-radius: 0。方形精選是 CSS 決策造成，不是圖片上傳錯誤。這項修正歸 #26A，本單不另做衝突的圓角規則。

## 展示設計

保留 Win98 方形外殼／立體按鈕，內容頭像與精選封面為圓形。角色頁順序：

1. 角色切換＋搜尋；可點的貼文／粉絲／追蹤統計。
2. 頭像、名字、簡介、自訂欄位、主連結；角色世界觀標示。
3. 圓形精選橫向列（封面＋標題）；空資料不顯示假內容。
4. 置頂作品與頁籤：作品格狀／動態列表／合集。有內容才顯示被標記頁籤，不擺無功能選單。
5. 貼文詳情含多圖、caption、具名喜歡者、具名留言及標記角色，關係互動由 #21A 接入。
6. 底部導覽固定於 IG 視窗內容底部，中間只有一個主要捲動容器。

以視窗容器寬度決定布局，不只看螢幕大小。窄窗與手機保持緊湊單欄；寬窗可將作品與詳情並列。格狀略圖使用明確裁切，詳情保留完整作品比例，可放大；不能以方形縮圖覆蓋原圖。

## 資料與編輯流程

Post 保存 id、authorProfileId、media[]（AssetRef、alt、crop）、caption、location、worldDateLabel、taggedProfileIds、collectionIds、pinned、發布狀態。虛構故事時間用文字標籤，實際 createdAt／updatedAt 分開，避免排序誤用。

Highlight 保存 id、ownerProfileId、title、coverAssetRef、frames[]；舊單圖精選變一個 frame，封面沿用原圖。Frame 可含圖片與短文字；閱讀可暫停，鍵盤前後切換，減少動態偏好下不自動播放。

作者直接點貼文→旁欄／手機子頁編輯；上傳多圖先選「一篇多圖」或「多篇貼文」，明確預覽數量。排序可拖曳，也有上移／下移；多圖上傳部分失敗只重試失敗項，不產生空貼文。進階數字／角色互動在獨立區塊，不干擾基本發文。

合集是既有貼文 ID 的集合，不複製原圖或貼文。刪精選不刪共享素材；刪素材先查草稿與已發布引用。

## 開源與替代方案

首選現有 CSS grid、React 與圖片上傳。排序可評估 [dnd-kit（MIT）](https://github.com/clauderic/dnd-kit)，但先驗證與視窗拖曳／滾動手勢不互相攔截。不採整套社群 clone；不新增影片上傳、短影音或完整 CMS。

## 工作拆分

1. shared schema／v1 fixture 遷移，新增 post／highlight／collection resolver。
2. 將 IgEditForm 拆為貼文編輯、媒體排序、精選編輯；保留 store 的 undo／autosave。
3. IgPreview 拆 ProfileHeader、PostGrid、PostDetail、HighlightViewer；搭配 ig.css 容器布局。
4. 擴充 tests/e2e/instagram.spec.ts、responsive.spec.ts；慢網路、圖片錯誤與大內容測試。

## 驗收

- [ ] 舊貼文／留言／單圖精選遷移後內容一致，沒有默默截斷。
- [ ] 多圖、alt、裁切、順序、置頂、合集可新增修改刪除且重載一致。
- [ ] 精選圓形，內有多頁且可暫停；關閉後回到原位置。
- [ ] 320／375／390／430px、桌面 360／480／720px 內窗均無水平溢位。
- [ ] 滾輪／觸控／鍵盤可捲到底；導覽不蓋文字，拖曳排序不搶走一般捲動。
- [ ] 首屏外圖片延遲載入，設定尺寸避免跳動；建立 60 貼文＋長中文測試資料。
- [ ] 草稿貼文、精選 frame、合集內私密引用不進公開投影。
- [ ] #21A 未完成前不顯示無效的具名互動入口。

## 依賴與風險

#18A、#19 提供 ID 與作者；#26A 提供圓形與視覺規則；公開發布依賴 #18B。可與 #21A 依契約並行。規模 L。新 UI 配額另做容量量測，不以較低的新限制破壞既有站點資料。
