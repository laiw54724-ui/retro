# 規劃交付驗證

日期：2026-10-16（Asia/Singapore）。這是文件與 GitHub 更新驗證，不是功能測試報告。

- 更新前比對 #18–#28 的 title／body／state 與保存的原始資料，11 張均未發生並行變動。
- 每張單具備原始碼調查、設計／範圍、工作拆分、開源選型、依賴／風險與未勾選驗收清單。
- 11 張 Issue 已寫入並逐張讀回核對，維持 OPEN。
- 整體設計已同步至 [#18 的路線說明](https://github.com/laiw54724-ui/retro/issues/18#issuecomment-6198058442)。
- 完成 Markdown 內部連結存在性、規劃數量與占位字串掃描；無損壞的本地連結或未完成標記。
- 人工交叉檢查首發依賴：#18A → #19 → #20 → #21A；#18B 為共同發布門檻；#28A 接實體 ID 與公開投影。沒有要求先完成 #21B 才能發布虛構互動。
- 開源庫只做來源／license／契約調查，沒有安裝、執行套件相容性或效能測試。
- 使用者後續指定 trapd00r/win95-winxp_icons（固定 commit 728a866）為 Windows 圖示主要來源、WinClassic resources 為補充來源；已同步 #26、#27 與整體路線。來源 repo 未宣告 license，故記為非 Retro MIT 素材，而不是來源不明。
- 未修改 apps／packages／migration／lockfile；未執行產品 build／unit／E2E，因本輪未變更產品程式。
- 未部署、未修改使用者站點，原先未追蹤的 zip／設計資料夾保留。

詳細逐步程式實作計畫、功能測試與 staging 驗收屬下一階段，不以本文件取代。

## P0 Windows icon and Win98 OC visual implementation

驗證日期：2026-10-16（Asia/Singapore）。本節記錄 P0 實作與本輪可重現的本地驗證證據；未部署、未 push，且保留既有未追蹤使用者檔案。

- Windows icon source checkout：`/private/tmp/retro-win95-winxp-icons`，HEAD `728a866ad59a54fd4082dbe000e1e62e50bd90e9`（upstream full commit）。
- 實作 commits：Task1 `c0673bf`、`974e77e`、`06c280d`、`a5391d5`、`fa2bb84`；Task2 `5fffbd7`；Task3 `31780ce`、`df54db2`；Task4 `c15448a`；回歸斷言修正 `fc0c71a`。
- `pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons`：pass；`Imported 1193`，`unsupported 7`。
- legacy/new path：pass。E2E 的 sourced Windows icons desktop/mobile 與 legacy PNG preservation case passed；audit 亦驗證新匯入 manifest。
- typecheck：pass（shared、api、web 均完成）。
- unit：pass，6 test files、24 tests（shared 1 file/14 tests；api 5 files/10 tests）。
- build：pass（shared、api dry-run、web Vite build 均完成；Wrangler 僅輸出既有 log-file EPERM 訊息後仍完成 dry-run，web bundle 成功產出）。
- full E2E：46 tests、46 passed（17.4s）。responsive 與 scroll 已包含在 full E2E；responsive viewport cases、Instagram wheel/keyboard scrolling、Win98 OC circular media cases，以及 Windows icon picker case 均 passed。
- round regression：typecheck、unit、full E2E、build、icon audit 均 pass；P0 Windows icon and Win98 OC visual implementation regression 完成。
- `git diff --check`：pass；verification 文件占位掃描無匹配。
