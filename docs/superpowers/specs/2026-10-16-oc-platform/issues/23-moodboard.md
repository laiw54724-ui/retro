# #23 Paint 風格 Moodboard：組版，不做完整繪圖軟體

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

既有 [文件／圖片模組 registry](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/registry.ts) 與 [editor store](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/editor/store.ts) 提供內容編輯及 undo 基礎，但沒有畫布 scene graph、座標轉換或 PNG 匯出。桌面拖曳與畫布拖曳有手勢衝突風險。

[上傳 API](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/api/src/routes/assets.ts) 目前只收圖片；不能假設所有外站圖都可安全匯出至 canvas。

## 範圍與互動

第一版只做有限尺寸畫布的圖片、文字、色塊與具權利的貼紙；支援選取、移動、縮放、層級、鎖定、複製、刪除、復原。明確不做筆刷、橡皮擦、濾鏡、PSD、無限畫布、多人即時白板。

Board 保存 id、width／height、背景、elements[]；element 有 id、kind、x／y、width／height、zOrder、locked；文字另存 content 與樣式，圖片用 AssetRef＋crop。只存資料，不存可執行 JS 或外來 HTML。角色可以引用 board，board 不複製角色個人資料。

作者：選模板尺寸→放圖片／文字→直接拖拉→右側選取屬性→預覽→匯出。空白區拖動不移動整個桌面視窗，只有外層標題列拖視窗。一次拖曳是一筆 undo，輸入中文字使用 DOM input／textarea 以支援 IME。

訪客：看縮放後的整張作品，可放大；提供語意文字／圖片說明清單讓鍵盤、讀屏不依賴 canvas。

手機：選物件後提供上移／下移／尺寸／前後層按鈕，單指不混用捲動與拖曳；畫布模式明確切換。選取物件時顯示手柄，不覆蓋底部完成按鈕。

## 開源選型與驗證

推薦小型 [react-konva／Konva](https://github.com/konvajs/react-konva) 試作；程式 MIT，實際採用前鎖定相容版本。現有 React 鎖檔為 19.3.1，不能只看 manifest 的最低版本。替代方案 DOM 絕對定位編輯成本低，但可靠 PNG 匯出更複雜。

不預設選 tldraw；[目前授權](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md) 並非可無條件 production 部署的 MIT。這不代表禁止研究，而是不把授權不符目標的依賴放入開源預設版。

PNG 僅使用有匯出權限且可正確跨域讀取的媒體。參考 [Konva 的 tainted canvas 說明](https://konvajs.org/docs/posts/Tainted_Canvas.html)：載入失敗或跨域不允許，列出阻擋物件並提供移除／改用上傳素材，不顯示成功空白檔。先等待 Cubic 11 字型 ready，再輸出。

## 工作拆分

1. 新增 shared board schema 與序列化／邊界測試；registry 增加 moodboard。
2. features/modules/moodboard/ 拆出 canvas adapter、DOM text editor、LayersPanel、Inspector；沿用既有 history。
3. 做有限元素的選取／縮放試驗，再接素材庫和正式保存。
4. 新增 PNG export 與 CORS／字型失敗提示；建立 tests/e2e/moodboard.spec.ts。
5. 初始建議限制 100 個元素、最大 4096×4096 匯出；以手機記憶體量測驗證再發布，不套用到舊資料時截斷。

## 驗收

- [ ] 新建、儲存、重載、undo／redo 後物件位置、層級、中文文字不變。
- [ ] 縮放畫布後仍精準移動物件；不觸發外層視窗拖曳。
- [ ] 文字輸入支援中文 IME，焦點不跳失；鍵盤可操作物件清單。
- [ ] PNG 尺寸與預覽一致，字型載入完成；跨域失敗可定位原因。
- [ ] 超過尺寸／元素上限有說明，保存衝突不覆蓋他人版本。
- [ ] 素材被多處引用時刪板不刪原圖；公開板不得帶出草稿素材。
- [ ] 手機可選取、改大小與改層級，不必精準拖小手柄。

## 依賴與風險

依 #18A、#18B、#26 的 tokens 與字型；角色引用才依 #19。不依賴 Music 或 Explorer。規模 L，最高風險是觸控、座標與匯出記憶體，不是工具列外觀。
