# 牽關開發分享與 Vibe Coding 教學 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成一份保留牽關前段故事、以 Retro Desktop 示範 AI 協作流程的約 32 頁 Canva 圖文簡報，並附上一份可直接使用的詳細 Markdown 教學文件。

**Architecture:** 本地 Markdown 檔案是文字內容的單一來源：逐頁腳本負責簡報文案與素材指示，詳細指南負責完整 Prompt 和檢查清單。Canva 原稿只作為版型來源，先建立副本，再依核准的頁面映射重組和編輯；每次永久儲存前先提供預覽並取得明確同意。

**Tech Stack:** Markdown、Git、Canva editing transactions、Canva page merge operations、現有 React/Vite/Hono/Supabase/R2 repository 作為案例證據

---

## File Structure

- Create: `docs/qianguan-vibe-coding-slides.md`
  - 32 頁逐頁腳本、每頁正文、圖片建議、來源與 Canva 版型映射。
- Create: `docs/vibe-coding-guide.md`
  - 長篇教學、可複製 Prompt、驗收清單、安全提醒與 staging 進階案例。
- Modify: `docs/superpowers/plans/2026-10-16-qianguan-vibe-coding-share.md`
  - 勾選實際完成的步驟並記錄 Canva 副本 ID。
- External working copy: Canva design copied from `DAHYAhdqONA`
  - 原始設計保持不變；副本承載重組後的約 32 頁正式草稿。

## Source Boundaries

- 牽關故事：沿用現有 Canva 第 1–5 頁，不補造新的日期、成果或使用者數字。
- Retro Desktop 狀態：以 `README.md`、`docs/ARCHITECTURE.md`、`docs/DEPLOYMENT.md`、`docs/BETA_ACCEPTANCE.md` 和使用者提供的進度紀錄為準。
- Design 與本地 AI 流程：以使用者提供的 Design 對話、staging 指令與操作紀錄為準。
- 不將 staging 描述成 production-ready。
- 不把 token、service role key、Cloudflare API token、Cookie、Authorization header、私人信件或測試帳號資料寫入任何檔案或 Canva。

### Task 1: 建立 32 頁逐頁腳本

**Files:**
- Create: `docs/qianguan-vibe-coding-slides.md`
- Reference: `docs/superpowers/specs/2026-10-16-qianguan-vibe-coding-share-design.md`
- Reference: `README.md`
- Reference: `docs/ARCHITECTURE.md`
- Reference: `docs/DEPLOYMENT.md`
- Reference: `docs/BETA_ACCEPTANCE.md`

- [ ] **Step 1: 建立文件標頭與使用方式**

文件開頭必須明確寫出：

```markdown
# 牽關開發分享與 Vibe Coding 教學：逐頁腳本

這份文件是 Canva 簡報的文字來源。第 1–5 頁保留原稿口吻；第 6 頁起以 Retro Desktop 作為教學案例。每頁包含畫面文字、圖片建議與詳細文件對應章節。
```

- [ ] **Step 2: 寫第 1–5 頁的保留版文案**

沿用現有頁面結構與作者口吻，只處理下列事項：

- 第 1 頁保留「牽關。開發心得」主標題，更新內容預告為「開發故事／Vibe coding／GitHub 與維護」。
- 第 2–3 頁保留「我想看大家的關係圖」與朋友互動故事，不把語氣改成產品簡報。
- 第 4 頁保留「9 月初／大概一週／之後」時間線。
- 第 5 頁保留致謝與未來規劃，避免承諾確切完成日期。
- 每頁提供一條圖片建議，不替作者選用他人作品。

- [ ] **Step 3: 寫第 6–10 頁的教學轉場**

使用以下標題與核心句：

```text
06 前面是牽關，接下來用 Retro Desktop 做教學
   牽關是我真正維護的專案；Retro Desktop 是可以公開拆解的練習案例。
07 Vibe coding 是怎麼和 AI 合作
   用自然語言說明目標，讓 AI 協助實作，再由人檢查結果。
08 第一個作品先小一點
   一張角色圖、名字與簡介，再加一個簡單互動。
09 Retro Desktop 教學案例
   一個可公開查看程式碼的復古桌面網站，用來示範完整工作流程。
10 先訂完成標準
   內容能修改、手機能閱讀、重新整理後資料仍存在、網址可以打開。
```

- [ ] **Step 4: 寫第 11–15 頁的 AI 分工**

使用以下標題與核心句：

```text
11 GPT Chat：把模糊想法整理成需求
12 Design：先把操作流程做成原型
13 本地 AI：讀專案、改檔案、跑測試
14 三種工具怎麼交接
15 接手專案前先讀什麼
```

第 14 頁用四步表示交接：需求整理、原型確認、repository 實作、人工驗收。第 15 頁列出 README、架構文件、相關 Issue/PR、目前 git 狀態，並提醒不要覆蓋未提交修改。

- [ ] **Step 5: 寫第 16–20 頁的 Prompt 與驗收**

使用以下標題：

```text
16 一份好任務需要四個部分
17 第一版網站 Prompt
18 接手既有專案 Prompt
19 把「怎麼壞」說清楚
20 AI 說完成後還要驗收
```

第 16 頁只呈現「目標／範圍／這次不做／完成標準」。第 17–18 頁各放一個不超過 120 個中文字的短 Prompt。第 19 頁包含裝置、頁面、重現步驟、預期結果、實際結果。第 20 頁包含實際操作、重新整理、另一個帳號、手機尺寸與未驗證項目。

- [ ] **Step 6: 寫第 21–25 頁的產品概念**

使用以下標題與內容邊界：

```text
21 畫面會動，不代表資料已經存好
22 帳號、資料與圖片分開處理
23 登入和資料權限是兩件事
24 Prototype 和可用產品的差別
25 Retro Desktop 從 Demo 到產品骨架
```

第 22 頁只用一句話說明 Supabase 負責帳號與主要資料，R2 負責圖片。第 25 頁只列已由進度紀錄支持的項目：登入、onboarding、編輯器、圖片上傳、自動儲存、版本衝突保護、發布與公開頁；staging 或 production 的狀態另行標示，不混為一談。

- [ ] **Step 7: 寫第 26–32 頁的維護與附錄**

```text
26 Git 記版本，GitHub 放專案與協作
27 Issue：先說清楚要做什麼
28 PR：確認改了什麼、測了什麼
29 安全底線：秘密、權限、staging 與 production
30 分享、回饋，然後繼續做
31 編輯與補圖說明
32 資料來源與詳細文件入口
```

第 29 頁必須包含「不要貼密鑰」「不要直接動 production」「破壞性操作先停下來確認」。第 32 頁保留 Retro Desktop repository、詳細 Markdown 文件與來源入口的位置，不在腳本中捏造尚未建立的公開網址。

- [ ] **Step 8: 檢查逐頁腳本完整性**

Run:

```bash
rg -n '^## Page ' docs/qianguan-vibe-coding-slides.md
rg -n '牽關|Retro Desktop|GPT Chat|Design|本地 AI|Supabase|R2|GitHub|staging|production' docs/qianguan-vibe-coding-slides.md
```

Expected:

- 第一個指令依序列出 Page 01 到 Page 32，共 32 筆。
- 第二個指令能找到上述主題，且牽關與 Retro Desktop 在文字上有明確區隔。

- [ ] **Step 9: Commit 逐頁腳本**

```bash
git add docs/qianguan-vibe-coding-slides.md
git commit -m "docs: draft qianguan vibe coding slide script"
```

### Task 2: 撰寫詳細 Vibe Coding 指令文件

**Files:**
- Create: `docs/vibe-coding-guide.md`
- Reference: `docs/qianguan-vibe-coding-slides.md`
- Reference: `docs/DEPLOYMENT.md`
- Reference: `docs/BETA_ACCEPTANCE.md`

- [ ] **Step 1: 建立導讀與名詞說明**

文件開頭說明牽關是分享主體、Retro Desktop 是教學案例，並用日常語言解釋 repository、frontend、backend、database、staging 和 production。

- [ ] **Step 2: 加入新專案 Prompt**

Prompt 必須包含以下可替換欄位：

```text
你要協助我做一個【作品類型】。
讀者／使用者是【對象】。
第一版需要【必要內容】。
這次不要做【排除範圍】。
完成標準是【可操作的驗收條件】。
先用自己的話重述需求，再列出最小版本；我確認後才開始修改。
```

- [ ] **Step 3: 加入接手既有 repository Prompt**

必須要求 AI：先讀 README 與指定文件、執行 `git status`、不丟棄未提交修改、先跑既有檢查、列出理解與風險、得到確認後再修改。

- [ ] **Step 4: 加入單一功能修改 Prompt**

模板必須分成問題、範圍、不做、驗收、測試和回報格式，並要求一個修改只處理一組相關需求。

- [ ] **Step 5: 加入 Bug 回報模板**

模板必須包含：環境、頁面、操作步驟、預期結果、實際結果、錯誤訊息與已嘗試方法；同時提醒移除 Cookie、token、個資和私人內容。

- [ ] **Step 6: 加入完成驗收清單**

清單包含正常流程、失敗流程、重複操作、重新整理、未登入、第二帳號、手機尺寸、實際測試指令與未驗證項目。未實際執行的檢查不得標示通過。

- [ ] **Step 7: 加入 GitHub 新手清單**

依序解釋 Changes、Commit、Push、Issue、Branch、PR、Checks、Merge 和 Deployment；明確寫出 Commit 不等於 Push、Merge 不等於部署成功。

- [ ] **Step 8: 加入安全清單**

必須涵蓋：

- `VITE_*` 會進入瀏覽器，不得放 service role key。
- 不把 secret 寫進 git、README、Issue、PR、log 或對話。
- staging 與 production 分開。
- 建立雲端資源前先盤點既有資源。
- 破壞性指令、production 資源或無法確認的帳號必須停止並詢問。
- 需要登入時由使用者本人完成，不繞過認證。

- [ ] **Step 9: 加入 Retro Desktop staging 進階案例**

先放一頁精簡流程：閱讀文件、檢查登入、盤點資源、建立 staging、套 migration、設定 secret、部署、smoke test、安全驗收。其後收錄完整安全版指令，但移除實際 project ref、帳號、token、email 與任何可識別秘密；結果格式只能使用 `configured`、`missing`、`PASS`、`FAIL` 或 `NEEDS HUMAN ACTION`。

- [ ] **Step 10: 驗證文件沒有秘密與佔位文字**

Run:

```bash
rg -n 'SERVICE_ROLE_KEY=.*|API_TOKEN=.*|Authorization:|Cookie:|T[B]D|TO[D]O|稍後補|之後補' docs/vibe-coding-guide.md
```

Expected: no matches. Literal variable names can appear, but no assignment containing a value can appear.

- [ ] **Step 11: Commit 詳細指南**

```bash
git add docs/vibe-coding-guide.md
git commit -m "docs: add vibe coding starter guide"
```

### Task 3: 內容一致性與來源檢查

**Files:**
- Modify: `docs/qianguan-vibe-coding-slides.md`
- Modify: `docs/vibe-coding-guide.md`
- Reference: `README.md`
- Reference: `docs/ARCHITECTURE.md`
- Reference: `docs/DEPLOYMENT.md`
- Reference: `docs/BETA_ACCEPTANCE.md`

- [ ] **Step 1: 對照 Retro Desktop 功能敘述**

確認簡報與指南沒有宣稱 repository 文件未支持的功能。所有「已完成」敘述必須能對應目前程式或使用者提供的進度紀錄。

- [ ] **Step 2: 對照 staging 與 production 狀態**

搜尋：

```bash
rg -n -i 'staging|production|ready|上線|部署完成' docs/qianguan-vibe-coding-slides.md docs/vibe-coding-guide.md
```

Expected: staging 與 production 的描述清楚分開，沒有把 staging 說成 production-ready。

- [ ] **Step 3: 檢查牽關與 Retro Desktop 的主從關係**

逐頁閱讀標題和第一段，確認牽關是故事主體，Retro Desktop 每次首次出現時都標為教學案例。

- [ ] **Step 4: 檢查文字密度**

每頁畫面文字建議不超過 180 個中文字。若超出，拆頁或把補充移至 `docs/vibe-coding-guide.md`，不以縮小字體解決。

- [ ] **Step 5: 檢查版本差異**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors；只有本次文件或使用者原有變更。

- [ ] **Step 6: Commit 內容校正**

```bash
git add docs/qianguan-vibe-coding-slides.md docs/vibe-coding-guide.md
git commit -m "docs: verify qianguan teaching content"
```

### Task 4: 建立 Canva 工作副本與頁面映射

**External artifact:**
- Source design: `DAHYAhdqONA`
- Create: Canva working copy titled `牽關開發分享＋Vibe Coding 教學｜編輯副本`

- [ ] **Step 1: 複製完整原稿**

使用 Canva copy-design，來源為 `DAHYAhdqONA`，保留全部頁面。記錄回傳的 working-copy design ID，不改動來源設計。

- [ ] **Step 2: 建立頁面映射表**

在 `docs/qianguan-vibe-coding-slides.md` 為每一頁記錄：目標頁碼、來源版型頁碼、保留或重寫、主要圖片位置。第 1–5 頁必須標為保留；第 6–30 頁使用現有第 6–21 頁的版型變體；第 31–32 頁使用現有附錄版型。

- [ ] **Step 3: 提交精確的頁面重組操作供使用者確認**

在呼叫 Canva merge-designs 前，列出每一個 insert、move 或 delete 操作，包括來源頁碼、插入位置和最終頁數。只有取得使用者對這組精確操作的明確同意後才執行。

- [ ] **Step 4: 在工作副本執行頁面重組**

使用 Canva merge-designs 修改 working copy。不得修改 `DAHYAhdqONA`。完成後重新取得所有頁面的 index 和 thumbnail，確認最終頁數與映射表一致。

- [ ] **Step 5: 更新計畫中的 Canva 副本紀錄**

在本文件的 File Structure 區段補上 working-copy design ID 與可編輯連結，並提交：

```bash
git add docs/superpowers/plans/2026-10-16-qianguan-vibe-coding-share.md docs/qianguan-vibe-coding-slides.md
git commit -m "docs: record canva working copy mapping"
```

### Task 5: 將核准文案套入 Canva 工作副本

**External artifact:**
- Modify: Canva working copy from Task 4
- Do not modify: `DAHYAhdqONA`

- [ ] **Step 1: 開啟 Canva editing transaction**

使用 working-copy design ID 開啟交易，保存 transaction ID。讀取每頁可編輯文字元素，依 `docs/qianguan-vibe-coding-slides.md` 建立 element ID 對照。

- [ ] **Step 2: 先修改第 6–15 頁**

使用 replace-text 操作套入轉場與三種 AI 分工。第 1–5 頁不在此批修改。完成後取得第 6、9、11、13、15 頁預覽並在對話中逐張顯示。

- [ ] **Step 3: 修改第 16–25 頁**

套入 Prompt、Bug、驗收與產品概念文案。完成後取得第 16、18、20、22、25 頁預覽並逐張顯示。

- [ ] **Step 4: 修改第 26–32 頁與頁碼**

套入 GitHub、維護、安全、結尾和附錄文案。更新所有正式頁碼、章節標示與總頁數。完成後取得第 26、29、30、31、32 頁預覽並逐張顯示。

- [ ] **Step 5: 檢查前五頁與整體連續性**

取得第 1–5 頁預覽，確認原有故事、口吻與版面未被意外改動。再取得第 5–7 頁預覽，確認牽關到 Retro Desktop 的轉場清楚。

- [ ] **Step 6: 檢查版面問題**

逐頁確認：文字沒有被裁切、沒有重疊、主標題可在縮圖中辨認、正文不因塞字而過小、圖片框仍可替換。若需要刪字，先同步修改本地逐頁腳本，再更新 Canva。

- [ ] **Step 7: 提供完整預覽並等待明確同意**

向使用者提供 working copy 的 Canva 連結、32 頁縮圖或分段預覽，以及尚未補圖的位置。明確詢問是否同意永久儲存這次 editing transaction。

- [ ] **Step 8: 依使用者決定完成交易**

- 使用者同意：呼叫 Canva commit-editing-transaction。
- 使用者要求修改：繼續在同一 transaction 修正並重新預覽。
- 使用者不同意保留：呼叫 Canva cancel-editing-transaction，原稿與工作副本已儲存版本保持不變。

### Task 6: 最終交付檢查

**Files:**
- Verify: `docs/qianguan-vibe-coding-slides.md`
- Verify: `docs/vibe-coding-guide.md`
- Verify: `docs/superpowers/plans/2026-10-16-qianguan-vibe-coding-share.md`
- Verify: Canva working copy

- [ ] **Step 1: 執行本地文件檢查**

```bash
git diff --check
rg -n 'T[B]D|TO[D]O|稍後補|之後補' docs/qianguan-vibe-coding-slides.md docs/vibe-coding-guide.md
git status --short --branch
```

Expected: no whitespace errors；no placeholder matches；狀態只包含使用者原有變更或已知文件變更。

- [ ] **Step 2: 驗證交付內容**

確認：

- 原始 Canva `DAHYAhdqONA` 沒有被修改。
- 工作副本連結可開啟並具有約 32 頁。
- 第 1–5 頁仍保留牽關故事。
- 第 6 頁明確說明 Retro Desktop 是教學案例。
- 詳細指南包含完整 Prompt 與安全清單。
- 沒有秘密或私人資料。

- [ ] **Step 3: Commit 最終文件狀態**

```bash
git add docs/qianguan-vibe-coding-slides.md docs/vibe-coding-guide.md docs/superpowers/plans/2026-10-16-qianguan-vibe-coding-share.md
git commit -m "docs: finalize qianguan vibe coding teaching kit"
```

- [ ] **Step 4: 交付**

提供 Canva 工作副本、逐頁腳本與詳細指南。只說明仍需要作者補入的自有圖片或公開連結，不把內部驗證紀錄塞進簡報正文。
