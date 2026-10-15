# #28 真正可用的 OC 分享、公開 metadata 與安全匯出

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

[IgPreview.tsx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/IgPreview.tsx) 的分享與複製動作只 showToast「已複製」，未實際呼叫 clipboard。
[App.tsx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/app/App.tsx) 只有站點路徑／編輯器，尚無角色／貼文深連結。[sites.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/api/src/routes/sites.ts) 已有公開快照但無 entity 級公開規則。前端 React 掛載後改 meta 不等於社群爬蟲能讀到初始 HTML。

## 28A：OC 首發必要分享

新增 canonical 路徑 /@handle/oc/:profileId 及 /@handle/post/:postId；可附 windowId 作呈現偏好，但 entity ID 為主，不綁目前桌面座標。手機打開該角色／貼文子頁，桌面打開既有對應 IG 視窗；沒有既有視窗則使用暫時 viewer，不能修改作者配置。

分享只指向已發布版本。按鈕先確認目標已公開，再使用原生 share（可用時）或 await clipboard.writeText；失敗顯示可選取 URL，不說「已複製」。草稿顯示「發布後才能分享」，預覽入口只能 owner 使用，不能直接當公開連結。

返回站點／角色、瀏覽器上一頁、視窗關閉要有一致行為；以安全 router state 管理，不能把壞參數當任意外部 URL。目標不存在／未公開統一公開 404，不透露草稿角色名字。

## 28B：SEO 與 OG

由 server／edge 依 published projection 輸出首屏 HTML metadata：title、description、canonical、og:image、robots。不為這件事重寫整個編輯器到另一框架。沿用 Vite app，先驗證同路徑 edge HTML 注入／公開 renderer 的最小方案；Cloudflare 路由、fallback 和快取需實測。

indexing 是作者獨立設定；noindex 不等於私密。OG 圖只取有公開權限的封面，無圖用自製品牌預設。發布版本納入快取鍵，避免分享連結仍顯示舊角色。文字必須 escape，長中文截斷不破壞字元；未知 ID 不吐假成功 HTML。

## 28C：匯出與受控匯入

兩種出口分清楚：公開匯出只含 published projection；owner 備份可明確選包含草稿，需登入與權限檢查，檔名／畫面標示含私人內容。

格式為版本化 JSON＋media manifest（id、相對位置或來源、hash、MIME、rights note）。先完成 JSON 與 manifest；媒體 ZIP 是第二步。跨域／無權再散布媒體列為外部引用與缺失報告，不靜默代抓、不打包 secrets 或 signed URL。

匯入走預覽／驗證／引用重映射／確認建立副本，不預設覆蓋現有站。限制壓縮前後大小、檔案數、路徑穿越、可執行內容與 MIME；未知 schema 不做破壞性降級。先做自己格式 round-trip，不宣稱支援任意網站匯入。

## 開源選型

React Router 與既有 Hono 足夠分享路由；JSON 不需套件。媒體 ZIP 可評估 [fflate（MIT）](https://github.com/101arrowz/fflate) 非同步／串流模式，必測取消和記憶體。不把匯出函式包裝成跨站任意下載代理。

## 工作拆分與驗收

1. shared EntityRef URL helpers、public entity lookup；App.tsx／PublicSitePage 新增深連結。
2. IgPreview 接真正分享 action 與失敗 fallback；tests/e2e/public.spec.ts、instagram.spec.ts 擴充。
3. 獨立 server metadata handler 與不執行 JavaScript 的 HTML 測試。
4. 新增 export／import schema 和 tests，最後才加 ZIP 媒體封裝。

- [ ] 直接貼 URL、重新整理、無登入打開、手機與桌面導向正確角色／貼文。
- [ ] 改 displayName／handle 不破壞 entity ID；已刪除／草稿 ID 回 404。
- [ ] clipboard 被拒絕時不顯示成功；可手動複製正確 URL。
- [ ] 發布後分享取最新公開版本，不帶出未發布修改。
- [ ] 不跑 JS 讀 HTML 也有正確 OG／robots；私人內容不在 meta／圖／快取。
- [ ] 公開匯出不含草稿、私人素材或 owner 身分資料；私人備份需權限。
- [ ] 合法 JSON round-trip 保留 ID 關係與內容，匯入副本重映射所有引用。
- [ ] ZIP bomb／路徑穿越／超量檔案被拒絕，大檔可取消且不凍結頁面。

## 依賴與風險

28A 依 #18A／18B、#19、#20。28B 同樣必須先有安全投影；28C 依 #27 的權利規則。不是等所有 App 做完才分享。規模：A M、B M、C L。主要風險是虛假複製成功、快取舊內容、分享／匯出洩漏草稿。
