# #25 桌面小玩具與訪客留言簿：分開交付

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

[registry.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/registry.ts) 留言板仍在 COMING_SOON。現有 [IG session](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/instagram/useIgSession.ts) 留言是暫存示範，不是可供陌生人公開提交的後端。不能直接把它接保存 API 就稱為安全留言簿。

## 25A：無伺服器寫入的小玩具

先做自製簡易掃雷與可關閉的作者設定角色彈窗。App registry 管理開啟／關閉，桌面沒有全螢幕搶焦點或無法關閉彈窗。預設不自動彈、不自動播音，尊重 reduced motion。

掃雷狀態是訪客 session，不進 owner draft；第一次點擊不直接踩雷、重開明確確認。提供鍵盤選格／標記與手機標記模式，避免只靠滑鼠右鍵或長按。第一版無排行榜、無伺服器高分上傳。

角色彈窗只接受純文字、允許的圖片與安全連結，使用者可隨時關閉；每次瀏覽至多自動出現一次且需作者明確開啟。裝飾寵物／通知有停止動態開關，不遮擋編輯器主要按鈕。

## 25B：後期的真實留言簿

作者選擇開啟後才接受訪客留言，預設所有新留言待審，公開頁只查 approved。欄位先限暱稱、純文字正文、時間；不收公開 email、不收附件、不允許任意 HTML。匿名訊息不聲稱身分驗證。

資料表 guestbook_entries 與 site document 分離，包含 siteId、id、body、displayName、status、createdAt。owner 可審核／拒絕／刪除；訪客可檢舉，去重與濫用限制不可省略。暱稱不是 OC 身分，不混進 #21 的角色留言。

server 檢查字數、發文頻率、站點啟用狀態；必要時 CAPTCHA 與速率限制。停用後拒絕新提交並說明；審核可操作後才開公開入口。記錄最小必要資料，說明用途／保存與刪除方式，不直接公開 IP。

## 開源選型

25A 小規則自行實作便於鍵盤和主題整合，不複製未明授權的遊戲／貓圖。25B 沿用現有 Hono／Supabase；不把通用評論 SaaS 或 GitHub 登入評論系統當作匿名留言簿的現成替代。依 [Supabase RLS 官方說明](https://supabase.com/docs/guides/database/postgres/row-level-security) 驗證 public／owner 權限，service-role API 仍須守邊界。

## 工作拆分

1. 25A：shared app config＋modules/minesweeper、character-dialog，純 reducer 與 timer lifecycle 測試。
2. 25A：mobile／keyboard／reduced-motion E2E，確認不污染 draft。
3. 25B：獨立 migration、API、審核列表、停用控制；先寫拒絕未授權／未審核讀取測試。
4. 25B：才加公開提交 UI 與處理中／待審／失敗狀態；保留輸入以便重試，不自動重送產生重複留言。

## 驗收

- [ ] 小遊戲的最小化／關閉正確清理 timer，沒有背景無限更新。
- [ ] 手機／鍵盤可標記格子；動態與自動彈窗可以停用。
- [ ] 訪客玩遊戲或關彈窗不會修改站長文件。
- [ ] 25B 未開啟時 server 拒絕提交，不能只隱藏表單。
- [ ] script／HTML 以文字顯示；超長、連發、重送有保護。
- [ ] 待審／拒絕留言不能從匿名 API、直接 ID、匯出或 SEO 讀到。
- [ ] owner 可審核、刪除、處理檢舉；別站 owner 無權操作。
- [ ] 身分／隱私說明清楚，訪客看得到「已送出待審」而非「已公開」。

## 依賴與風險

25A 依 #18A、#26、#27，可獨立晚期加值；25B 依 API 安全、審核操作與權利政策，非 OC 首發必要。規模：25A M、25B L。風險是公開 UGC 濫用及運營成本，不把留言簿夾帶在裝飾功能 PR 上線。
