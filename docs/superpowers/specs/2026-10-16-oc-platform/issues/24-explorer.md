# #24 Explorer：世界觀資料夾與內容捷徑

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

[LinkAction](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/types.ts) 現在只識別 URL／window，且內容清單只有視窗 ID＋title；沒有 folder tree。媒體已由 R2／site_assets 管理，不應把 UI 目錄誤作儲存路徑或再次複製圖片。

## 資料與展示

FolderNode 保存 id、parentId（根為 null）、name、order、發布狀態。Shortcut 保存自己的 id、parentId、label、EntityRef；初期目標為 window／profile／post。世界觀是命名目錄或內容集合，並不成為新的登入租戶。

同一個角色可在多個資料夾出現捷徑，刪捷徑只刪引用，刪資料夾先列出後代數與處理選項。第一版預設刪除資料夾和其捷徑，不刪目標原內容；可取消。原內容刪除前仍由 #18 的引用檢查攔截。

樹根、排序與麵包屑為共同導航。桌面可左樹右內容；窄窗／手機只顯示目前目錄＋返回／麵包屑。搜尋涵蓋公開可見目標，結果顯示所在路徑；作者可另切草稿搜尋，不能把草稿名稱帶到訪客索引。

移動到選單是必備，拖曳只是加速。禁止移到自己或子孫；建議上限 8 層、每站 500 節點，server 與 client 同步驗證，以容量測試確認後才固定。不以深遞迴直接處理未驗證輸入。

## 可見性語意

「隱藏視窗」僅改桌面初始狀態，不等於私人；「不列出」仍可用公開連結訪問；「草稿」不出現在發布投影。公開父目錄不會自動公開私人子內容，私人父目錄也不能讓原本已公開的目標變成機密。

未發布／已刪除目標的捷徑在作者端顯示可修復狀態，訪客端不透露私人名稱。資料夾及索引 projection 由 server 重建，不信任前端已過濾。

## 開源選型

先做原生清單／麵包屑，小站點不需要檔案管理器整套套件。[react-arborist（MIT）](https://github.com/brimdata/react-arborist) 作大量目錄時的樹狀虛擬化候選；[dnd-kit](https://github.com/clauderic/dnd-kit) 可提供重排，但不能取代語意、鍵盤與循環驗證。首版不提供任意本機檔案系統存取或任意 R2 key 瀏覽。

## 工作拆分

1. packages/shared：tree validation／path resolution／public projection／EntityRef 擴充。
2. features/modules/explorer/：FolderView、Breadcrumbs、MoveDialog、SearchResults；加入 registry。
3. editor/store：move／delete subtree 的單次 history transaction；共用 resolver 開啟角色／貼文。
4. 新增 shared folder 測試與 tests/e2e/explorer.spec.ts；assets route 加入使用中提示由 #18 共用。

## 驗收

- [ ] 三層目錄及同一角色兩個捷徑保存／重載一致，沒有重複上傳媒體。
- [ ] 自己／子孫循環、過深、重複 ID、跨站目標皆被 server 拒絕。
- [ ] 更名不破壞 EntityRef；麵包屑／返回／搜尋結果可以操作。
- [ ] 刪目錄不刪角色／圖片；取消刪除與 undo 可還原目錄。
- [ ] 草稿目標不出現在匿名目錄 JSON、搜尋結果、路徑或計數。
- [ ] 鍵盤移動與手機移動到選單可用，不必拖曳。
- [ ] 500 節點測試避免卡頓；壞引用可修復且不 crash。

## 依賴與風險

依 #18A／18B；OC 捷徑依 #19／#20，其他文件捷徑可先交付。不依 #22／#23 完成，日後擴充 EntityRef。規模 M。風險：目錄隱私誤解、循環、刪除誤傷共用內容。
