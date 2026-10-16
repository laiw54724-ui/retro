# #19 多 OC 角色檔案、帳號切換與直覺編輯

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。#2–#7 是已關閉的歷史基礎，不重開、不重做。原始 Issue 需求已保存於本地 original-issues.json。

## 獨立調查

[site.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/packages/shared/src/site.ts) 中每個 IG 視窗只有一份 profile，含姓名、handle、簡介、頭像、文字追蹤數。[IgEditForm.tsx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/IgEditForm.tsx) 是長表單；[useIgSession.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/useIgSession.ts) 只有單角色 follow 狀態與簡單返回狀態。

因此不能只加「切換帳號」下拉選單：身分必須從視窗中抽離，所有貼文、關係與返回路徑都要綁穩定 ID。

## 範圍與設計

第一版是一位 owner 管理多名虛構 OC，不新增多組登入帳號。角色共用於同一個 site；世界觀是分類，不是權限邊界。

Profile 保存 id、handle、displayName、avatar AssetRef／裁切、bio、pronouns、自訂欄位、world 標籤、可選內容主題覆寫、草稿／可發布狀態。角色主題只影響內容區的 accent／背景，不改站點字型或視窗標題列；視窗外觀仍由 #26 管理。IG 視窗保存 entryProfileId 與展示模式；兩個視窗可以看同一個角色，不重複持有角色資料。

handle 在 site 內以大小寫不敏感方式唯一；深連結以 ID 為權威，改名不斷鏈。顯示名允許中文。複製角色產生新 ID，不自動複製追蹤關係；刪除前列出貼文／關係／入口引用，提供改入口或取消，禁止留下無聲壞連結。

## 作者與訪客流程

作者：角色切換器 → 新增角色（名稱、handle、頭像）→ 完成即看到角色頁 → 點姓名／頭像／簡介直接編輯。進階欄位收在「角色設定」，不把所有表單預設展開。

角色清單可搜尋，標示「正在編輯」「尚未發布」；切換不丟失未存內容。手機用單一全頁編輯子畫面，儲存／返回固定可見，不把桌面側欄壓成窄欄。

訪客：點追蹤列表的角色 → 同一 IG 視窗切換角色頁 → 返回還原上一頁與捲動位置。這是瀏覽身分，不是「登入成該角色」。無法編輯、看草稿或產生後端寫入。

## 遷移與資料完整性

每個舊 IG 視窗產生一個角色，ID 由 site／window 舊 ID 決定；保留其所有貼文和文字作者。相同 handle 以穩定後綴消歧，保留原顯示值供作者檢查，不自動把同名角色合併。舊顯示數字另存 legacy display label；不把「1.2K」轉成 12，也不憑數字捏造角色。

訪客 session state 至少以 siteId／windowId／profileId／postId 隔離；導航堆疊不只一個 previousScreen。關閉視窗後重開的入口策略為回到視窗設定角色；同次瀏覽的 likes／收藏仍只屬本次瀏覽。

## 開源選型

沿用 Zod、React 與原有 store。角色 domain 不適合搬真實社群 Auth。比較 [React／Supabase Instagram clone](https://github.com/ProsperOjonimi/instagram-clone) 後，採用「參考資訊結構、自己實作虛構身分」；該 repo 的可複製授權未完成確認，不拷貝程式。

## 工作拆分與驗收

修改 shared schema／migration、modules/instagram/index.tsx、IgEditForm.tsx、IgPreview.tsx、useIgSession.ts；拆出 ProfileSwitcher、ProfileEditor 與 entity navigation。

- [ ] 先建兩個舊視窗且 handle 重複的 migration fixture；確認無資料遺失且重跑不增加角色。
- [ ] 新增／修改／複製／刪除／切換兩名以上 OC；重新載入後一致。
- [ ] A→追蹤名單→B→貼文→返回，頁面與捲動位置正確。
- [ ] 兩個視窗引用同角色，編輯後兩邊更新；undo 一次可還原。
- [ ] handle 大小寫衝突、空名稱、長中文、壞頭像都有明確訊息。
- [ ] owner 以外無法存取角色草稿；公開投影無草稿角色名稱或頭像 URL。
- [ ] 320／375／390／430px 手機及 360px 桌面內窗操作可用。

## 依賴與風險

依賴 #18A；草稿媒體隱私依賴 #18B。可獨立交付角色切換，#20 負責豐富內容，#21A 負責關係。規模 L；最大風險是跨視窗共用資料與舊資料誤合併。第一版不提供跨站角色關係、協作者邀請或角色登入。
