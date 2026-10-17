# #27 開源前置：授權、素材來源與可重現貢獻流程

## 狀態與查核基準

2026-10-17 決策更新：專案權利人已核准原創程式碼採 MIT；授權不明的 Windows 圖示不隨 repo 或預設發行物散布，改由部署者明確確認後自行安裝可選素材包。原始 Issue 需求已保留。

## 獨立調查

在 e4d9722 的 git tracked 清單中未找到根目錄 LICENSE；[字型 OFL](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/public/fonts/OFL.txt) 已存在。apps/web/public/win98-icons 下有 1,757 個已追蹤檔案。使用者已指定 [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons) 為 Windows 95／98／2000／XP 圖示主要來源，[WinClassic resources](https://winclassic.github.io/resources) 為補充查找來源。

這解決了來源識別，但沒有自動解決再散布授權：trapd00r repo 沒有 license，WinClassic 的[舊程式圖示頁](https://winclassic.github.io/icons)明示圖示屬各自權利人。尤其 [@react95/core 上游授權](https://raw.githubusercontent.com/React95/React95/master/LICENSE) 也明確排除 Windows 相關圖片。

## 決定與範圍

把本單從最後一階段提前為所有新套件／素材的選型門檻。自有程式碼採 MIT；第三方內容不因此重新授權。

程式碼、字型、圖示、使用者內容四類分開。使用者 OC／作品／音訊預設仍屬原作者；公開瀏覽不是授權他人複製，程式 MIT 不覆蓋這些內容。參考圖不放進公開範例。

## 27A：早期清查與替代策略

建立 third-party manifest，欄位含 path／來源 URL／版本或 commit／hash／作者／license／notice／允許的使用範圍／審核狀態。狀態至少 confirmed、needs-evidence、replace。

以 trapd00r 固定 commit 728a866ad59a54fd4082dbe000e1e62e50bd90e9、WinClassic 頁面、原檔名與 hash 建立 provenance manifest。Windows 圖示維持原權利人素材，不納入 Retro MIT 授權宣告；正式開源 repo 與預設發行物不包含圖示 binaries，部署者可明確確認後從固定上游自行安裝。未安裝或舊素材缺檔時使用原創 SVG fallback，不讓既有 icon ID 造成桌面空白。

[Cubic 11](https://github.com/ACh-K/Cubic-11) 保留 OFL、來源與版本，衍生修改另核對保留名稱。背景、demo avatar、貼紙、音樂、歌詞逐項盤點。先不刪使用者資料；若移除發行素材，記錄 exact paths、替代與恢復方式。

## 27B：可貢獻的發行版本

新增／更新 README、LICENSE、THIRD_PARTY_NOTICES、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、issue／PR templates、環境範本、架構與 self-host 指南。

自架文件區分本機 demo 與真實服務：Cloudflare／Supabase 的帳號、環境變數、migration、R2、Google callback 與發布流程；不把服務金鑰放 VITE_*，不承諾無雲端設定就能用完整 Auth。

貢獻流程要求 frozen-lockfile、typecheck／unit／E2E、schema migration fixture、素材 provenance。外部程式外掛暫不接受任意執行，先接受經 review 的內建模組與資料模板。

檢查工作樹、CI artifacts 與可達 git history 的 secrets；掃描若發現真金鑰先撤銷輪替，再協調歷史處理。不自動 rewrite 歷史，也不以「沒掃到」保證絕無 secrets。

## 工作拆分與驗收

1. 清點 tracked 素材和 dependency lockfile，補 manifest，列出不能確認的項目。
2. 提出替代圖示映射、檢查所有引用與 UI fallback；核對字型和 demo 素材。
3. 加上範圍明確的程式授權與 notices，完成 contributor／security 文件。
4. 乾淨 clone 以文件步驟安裝、測試與 build；只使用測試素材與測試環境，不動使用者站點。

- [ ] 每個隨發行散布的第三方資產都有來源、權利狀態與必要 notices；「無獨立 license」不得誤標成 MIT。
- [ ] Windows 圖示能對應 trapd00r 固定 commit 或 WinClassic 條目；未比對素材不進開源發行，舊 icon ID 有可用 fallback。
- [ ] LICENSE 範圍不誤涵蓋使用者作品、第三方字型與商標。
- [ ] README 清楚區分 demo／自架／代管，安裝步驟可重現。
- [ ] 新 contributor 可執行 frozen-lockfile、typecheck、測試及 build，不需讀取生產 secrets。
- [ ] 完成記錄化的 secret 掃描，發現項目有輪替／處理結果，不只刪工作樹。
- [ ] 安全回報管道、內容下架／權利說明及貢獻規則存在。

## 依賴與風險

27A 無功能前置依賴，立即開始；27B 在正式開源發行前完成。不阻止作者繼續編輯，也不等 #22–#25 全做好。規模 M。Windows 圖示來源已指定，剩餘決策是其非 MIT 素材的發行方式及少數檔案比對，不再把整個合集描述成來源不明。
