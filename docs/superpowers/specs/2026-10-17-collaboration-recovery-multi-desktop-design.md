# 協作回歸修復與多桌面入口設計

## 目標

修復已上線的邀請接受失敗，讓一個登入帳號能清楚管理自己擁有與受邀協作的多個桌面。這是 #21 已交付能力的回歸修復與入口補全，不擴張角色權限模型。

## 已確認事實

- `sites.owner_id` 沒有一人一站限制，後端已允許同一帳號建立多個桌面。
- `GET /api/sites` 已回傳 owner、editor、viewer 的合併清單，並依最近更新排序。
- `/auth` 目前取得清單後直接開 `sites[0]`，造成只能使用一個桌面的錯覺，也沒有新增第二個桌面的入口。
- staging 邀請已進入 `POST /api/invites/accept`，但 `accept_site_invite` RPC 回傳未分類資料庫錯誤。函式使用 `RETURNS TABLE (site_id, role)`，同時在 `ON CONFLICT (site_id, user_id)` 使用未限定的 `site_id`，可能與 PL/pgSQL output parameter 衝突；以 constraint 名稱取代欄位推斷可消除此類 runtime ambiguity。

## 使用者流程

### 登入與桌面總管

登入成功固定停在 `/auth` 的「我的桌面」視窗，不再自動跳第一個桌面。清單顯示桌面名稱、公開 handle、權限、草稿／發布狀態及最後更新時間。

- owner：主要動作為「編輯」。
- editor：主要動作為「協作編輯」，並清楚提示不能發布或管理成員。
- viewer：主要動作為「查看私人草稿」。
- 空清單：顯示新手說明與「建立第一個桌面」。
- 任何狀態都保留「新增桌面」，前往既有 onboarding；新桌面取得獨立 handle 與資料。
- 載入失敗保留登入狀態並提供重試，不自動登出。

編輯器品牌入口改為回到「我的桌面」，另保留公開首頁的獨立入口。從權限撤銷或降級返回 `/auth` 時，通知與桌面清單同時可見。

### 協作邀請

邀請仍採綁定 email、期限、單次 token、URL fragment 暫存及 server-side membership 寫入。修復只替換 RPC 的 conflict target 寫法，不放寬權限、不重用 token、不暴露資料庫細節。

API 對未知 RPC 錯誤仍回一般錯誤，但 Worker log 記錄 Supabase code、message、details、hint 與 route context，不能記錄 token、email 或 authorization header。前端將一般錯誤改成可理解的「暫時無法接受邀請，請重試；若持續發生請重新建立邀請」。

## 視覺與響應式規則

採核准的 B「桌面總管」：延續 Win98 視窗與 Cubic 11，不建立另一套卡片設計系統。桌面寬度使用雙欄列表；窄螢幕改單欄。每列的主要資訊先於版本細節，權限以文字與 badge 同時呈現，長名稱可換行，handle 可截斷但保留 title。

鍵盤順序依畫面閱讀順序；載入與錯誤使用 live region；按鈕在手機至少 44px；200% zoom 不水平溢位。

## 資料與相容性

- 不新增站點資料表或變更 `GET /api/sites` 回應。
- 新增 `0008_fix_accept_site_invite_conflict.sql`，用 `ON CONFLICT ON CONSTRAINT site_memberships_pkey` 重建函式；保留原簽章、權限與所有 stable error codes。
- 舊連結、單桌面帳號、viewer/editor 編輯路由不變。
- onboarding 建站成功後仍直接進入新桌面；返回總管即可看到所有桌面。

## 驗證策略

階段只跑針對性測試：migration contract、Auth desktop hub E2E、協作邀請 E2E、320/390/430 響應式 smoke。里程碑部署前再統一跑 full typecheck、unit、E2E、build 與 diff review。

staging 驗收使用兩個已驗證 Google 帳號：owner 建立新邀請、recipient 接受、清單出現共享桌面、editor/viewer 行為符合角色；owner 另建第二桌面並在總管切換。測試完成後撤銷測試 membership／invite 或刪除測試站，不碰使用者既有內容。

## 不在本里程碑

- 即時多人游標、衝突合併、同時編輯 presence。
- owner 移轉、複製整站、資料夾分組、桌面搜尋。
- #23–#28 的獨立應用與分享功能；它們在本修復部署後依既有規格繼續。

