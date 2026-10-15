# Retro OC 平台：整體規劃與設計

日期：2026-10-16
調查基準：本機分支 codex/responsive-audit-ig-scroll，commit e4d9722；不是宣稱 main 或正式站已具有下列功能。
狀態：規劃稿、11 張既有 GitHub Issues 已細化；未實作、未部署。

## 1. 建議結論

Retro 的主線是「創作者自己的角色小電腦」，不是另一個真人社群網站。

先完成一條能真的使用的路徑：**建立兩名 OC → 發作品 → 編排追蹤／喜歡／留言 → 訪客點入另一名角色 → 分享公開頁。** 這條路徑做完，才增加音樂、Moodboard、世界觀資料夾。

原有 Win98 桌面、視窗管理、手機單視窗、Google owner 登入、Cubic 11 都保留。豐富內容由角色與作品帶出；編輯器保持「點哪裡，改哪裡」，進階設定逐步展開。

這份設計採 brainstorming 的分解與方案比較，以及 impeccable 的作者／訪客任務分離。只完成設計與工作單，不把規格當成已完成產品。

## 2. 先核對，再修正原建議

| 原先方向 | 實際調查 | 本次修正 |
| --- | --- | --- |
| #18 建新 registry | 現有五種模組已註冊 | 擴充版本、引用與能力，不重寫桌面 |
| IG 已有追蹤數，可再加人名 | 數字為文字、留言作者也為文字 | 角色 ID、關係、統計分開建模 |
| Win98 精選方形 | CSS 同時把頭像和精選圓角歸零 | 方形視窗；圓形頭像與精選 |
| 多人都是社群功能 | 一人管理 OC 與多人編輯權限不同 | #21A 虛構互動、#21B 真人協作 |
| 媒體上傳可直接給音樂用 | API 只允許圖片、8 MB 上限 | 直連播放器先做，音訊上傳單獨驗證 |
| 草稿／隱藏即私密 | 原始圖片 URL 可匿名取得 | #18B 先處理公開投影與媒體存取 |
| 分享按鈕已存在 | 目前只有成功 toast，沒真的複製 | #28A 提前完成實際連結與錯誤處理 |
| 開源最後整理 | Windows 圖示來源已指定，但來源 repo 未提供 license | #27A 提前建立來源清單，程式 MIT 與圖示權利分開 |

完整證據與檔案位置在每張單內；[初始方向](00-initial-direction.md) 保留作對照。

## 3. 三種路線比較

| 方案 | 收益 | 代價 | 決定 |
| --- | --- | --- | --- |
| 延伸現有 React／Zod／CSS，按需加小套件 | 保留已做好的編輯、發布、視窗行為 | 自己設計 OC domain | 採用 |
| 搬整套 Instagram clone／React95 UI | 表面功能快速出現 | Auth、資料、CSS、手勢、權限需重接；不等於 OC 編輯器 | 只參考，不整套搬 |
| 先做插件平台與完整協作 | 長期彈性高 | 首發成本最高，尚未驗證需求 | 後置 |

開源候選已查 [98.css](https://github.com/jdan/98.css)、兩個不同的 React95、Pixelarticons、Cubic 11、dnd-kit、Konva、Webamp、howler.js、react-arborist、fflate 等；授權差異、限制與決策見 [獨立研究](open-source-research.md)。沒有把任何候選當成已完成相容性或安全測試。

## 4. 資訊架構與共用資料

~~~text
Site（真實 owner／權限邊界）
├─ Desktop：theme、windows、icons、taskbar
├─ Content library
│  ├─ Profiles：所有 OC
│  ├─ Posts／Highlights／Collections
│  ├─ Fictional relations：follows、named likes、actor comments
│  └─ 後續：Playlists／Boards／Folders
├─ Assets：共用素材與來源／權利資訊
└─ Published snapshot：server 產生的公開版本
~~~

視窗是內容入口，不是內容擁有者。兩個 IG 視窗引用同一 OC，修改角色會同步；刪視窗不刪角色。作品、Explorer 捷徑、角色主題曲都引用穩定 ID，不用名字當 foreign key。

第一版保留 SiteDocument JSON 儲存方式，避免同時搬所有內容到一堆資料表。真實協作 membership、公開留言簿等需要獨立生命週期的資料再放獨立表。世界觀／企劃先是站內分類與合集，不是跨站帳號或權限群組。

| 概念 | 權威資料 | 明確規則 |
| --- | --- | --- |
| Profile | site 級 id／handle／欄位／發布狀態 | 真實 owner 與虛構身分分開 |
| Post | authorProfileId、media refs、caption、標記／合集 | 原圖不因九宮格裁切被破壞 |
| Highlight | owner、封面、frames | 舊單圖轉一 frame，不丟圖 |
| Follow | fromProfileId → toProfileId | 同 site、不可重複或自追 |
| Likes | namedLikerIds＋其他虛構人數 | 總數從有效名單與額外整數計算 |
| Comments | profileRef 或 legacyText author | 不以同名自動認領舊留言 |
| Window／Shortcut | EntityRef＋顯示設定 | 改名不斷鏈、刪除有引用檢查 |

「角色模式／企劃模式／作品模式」是同一份資料的不同入口與篩選，不是三套重複資料。首發先把角色模式做好；企劃合集和作品模式由 #20 漸進開放。

## 5. IG 的整體畫面與互動

### 訪客：作品主導，視窗退到背景

~~~text
┌─ OC Social / Instagram.exe ─────── [縮小][放大][關閉] ┐
│ 角色選擇 ▾                         搜尋角色／作品    │
│ ○ 頭像     貼文數       粉絲數 ↗       追蹤數 ↗      │
│ 名字／handle／簡介／角色欄位／連結                   │
│ 角色世界觀內容                    [分享][主題曲*]  │
│ ○ 精選一    ○ 精選二    ○ 精選三                    │
│ [作品格狀] [動態列表] [合集]                         │
│ 置頂作品／作品格／具名讚與留言                       │
│                （此區垂直捲動）                     │
│ [角色首頁]        [搜尋]       [本次收藏]            │
└────────────────────────────────────────────────────┘
~~~

主題曲只在 #22 完成且設定可播放曲目時出現。按鈕與頁籤以真實功能／內容為準，不擺無效 File／Edit 選單或假通知。現有 Instagram.exe 名稱先相容，公開產品名稱建議另評估 OC Social.exe，不在本輪直接改名。

粉絲、追蹤、喜歡者點開名單，點角色頭像進角色頁。返回保留前頁位置，不能每次回頂端。沒有設定的虛構人數顯示為額外人數，不生成假頭像。

貼文大圖保留作品比例；格狀列表可裁切。精選封面是圓形，多頁內容可暫停、前後切換。寬容器可左右並排作品與詳情，窄容器改單欄；不是把桌面畫面整張縮小。

### 作者：原位編輯，必要時才展開工具

1. 從角色切換器新增 OC，只先填名字、handle、頭像。
2. 點頁面上的名字／簡介／頭像，右側 contextual inspector 編輯；手機改成全頁子畫面。
3. 點新增貼文，選「一篇多圖」或「多篇貼文」，預覽數量再送出。
4. 點讚區／追蹤統計／留言區，開角色選擇器；搜尋、多選、快速新增 OC。
5. 開「進階設定」才看額外虛構數字、角色欄位、發布狀態等，不把長表單一次攤開。
6. 一次拖曳／刪除／關係修改對應一次 undo；輸入快速連續修改可合併。
7. 預覽顯示目前草稿效果；發布摘要說明哪些角色／作品會公開，再發布。

桌面最小化／關閉／還原、開始選單／時鐘仍是同一套 site shell。IG 子頁導航不得借用視窗拖曳或全頁 body scroll。編輯中可切換角色，但未保存狀態／失敗／衝突必須明示。

## 6. 響應式、可及性與狀態

- 以 IG 實際容器寬度為準：測桌面 360／480／720px 內窗；手機測 320／375／390／430px。
- 顯示字型首選 Cubic 11，輸入控制繼承；缺字 fallback 可讀。200% zoom 不遮擋主要操作。
- 頭像與精選圓形；Chrome、按鈕、列表選取保持 Win98。不得用全域圓角清零抹掉內容形狀。
- 單一垂直 scroll owner；固定底部導覽不得擋內容。觸控排序與一般捲動分離。
- 空狀態提供一個主要動作：新增角色／貼文／精選；訪客空狀態不顯示作者工具。
- 載入、圖片失敗、上傳部分成功、儲存失敗、版本衝突各有不同訊息。
- 鍵盤、Esc、focus return、讀屏名稱、reduced motion、對比與 44px 觸控區列為驗收，不用「復古」免除可用性。

## 7. 發布、隱私與舊資料

### 語意表

| 操作／狀態 | 真正代表什麼 |
| --- | --- |
| 隱藏或最小化視窗 | 顯示狀態，不能當私密 |
| 不列出 | 可透過公開連結讀取，不是機密 |
| 草稿角色／貼文 | 不進發布投影；其素材私密需 #18B 支援 |
| noindex | 請搜尋引擎不要收錄，不是存取控制 |
| 公開後收回 | 阻止後續服務端存取，不保證收回別人已下載內容 |
| owner 備份 | 經驗證身分，可明確選含草稿；與公開匯出不同 |

單一 server projection 供 public API、公開 R2 JSON、分享／OG、公開 export。所有引用先過濾，再算可見統計；不能留下草稿名稱、圖片 URL、留言作者或搜尋索引。

發布由 DB 原子版本檢查與快照作權威，R2 artifact 版本化、可重試，失敗不顯示全數更新成功。舊 R2 alias 與已公開原始素材都要列入遷移，不能只改新路徑就宣稱沒有洩漏。

舊每個 IG 視窗轉成一個角色，保留內容；相同 username 不自動合併。legacy 數字與作者文字留存，不解析成虛構人物。未知 schema／壞資料以唯讀復原方式處理，不能強制 cast 然後寫回。

server 先支援 v1/v2，再讓 client 逐步寫 v2。用測試帳號 fixture 驗證，保留舊快照與回復程序；不直接對使用者真實站點做破壞性試驗。

## 8. 分期與依賴

A／B／C 是同一張 Issue 的里程碑，不是新建的重複工作單。

| 階段 | 工作單 | 完成後的可交付結果 |
| --- | --- | --- |
| P0 基礎，優先開始 | #27A、#18A、#26A | 授權盤點、版本／引用契約、圓形精選與容器規則 |
| P0 發布安全 | #18B | 公開投影、受保護草稿媒體、發布一致性 |
| P1 角色 | #19 | 兩名以上 OC、直覺檔案編輯、遷移與切換 |
| P1 內容與關係 | #20、#21A | 貼文／精選／合集、具名讚／追蹤／留言 |
| P1 可分享首發 | #28A、#27B 的發行必要項 | 真實深連結／複製，授權可交付 |
| P2 擴充 | #22、#23、#24、#26B、#28B／C | 媒體創作、整理、主題、OG、匯出，各自發布 |
| P3 互動運營 | #25A、#25B、#21B | 玩具、受審核留言簿、真正協作 |

~~~text
#27A ───────────────→ 發行素材門檻
#26A ───────────────→ #19／#20 的 UI
#18A → #19 → #20 → #21A ─┐
#18B ────────────────────┼→ OC 首發（含 #28A）
#19／#20 ────────────────→ #28A
#18A／B + 各自內容契約 ──→ #22、#23、#24（獨立擴充）
~~~

依賴是契約，不要求每張大單全關閉才啟動下一張。例：#21A 的角色互動不必等 #21B 協作；#28A 分享不必等 ZIP；#26A 圓形修正不必等全部主題。

規模估計是相對複雜度，不是工期承諾：#18／#19／#20／#23 為 L；#21A／#24／#26 為 M；#21B 為 XL；#22、#25、#28 依分階段分別 M–L。素材溯源與 private media 遷移最不確定。

## 9. 每張單的獨立規劃

| Issue | 本地規格 | 首要風險 |
| --- | --- | --- |
| [#18](https://github.com/laiw54724-ui/retro/issues/18) | [App 基礎](issues/18-app-foundation.md) | 遷移／發布／私密媒體 |
| [#19](https://github.com/laiw54724-ui/retro/issues/19) | [OC 檔案](issues/19-oc-profiles.md) | 身分與狀態隔離 |
| [#20](https://github.com/laiw54724-ui/retro/issues/20) | [內容與精選](issues/20-posts-layout-highlights.md) | 捲動／媒體／編輯負擔 |
| [#21](https://github.com/laiw54724-ui/retro/issues/21) | [互動與協作](issues/21-fictional-social-collaboration.md) | 虛構／真實混淆及權限 |
| [#22](https://github.com/laiw54724-ui/retro/issues/22) | [音樂](issues/22-music-player.md) | 版權／播放限制 |
| [#23](https://github.com/laiw54724-ui/retro/issues/23) | [Moodboard](issues/23-moodboard.md) | 座標／CORS／記憶體 |
| [#24](https://github.com/laiw54724-ui/retro/issues/24) | [Explorer](issues/24-explorer.md) | 循環／引用／刪除 |
| [#25](https://github.com/laiw54724-ui/retro/issues/25) | [玩具與留言簿](issues/25-miniapps-guestbook.md) | 公開 UGC 運營 |
| [#26](https://github.com/laiw54724-ui/retro/issues/26) | [Win98 設計規則](issues/26-design-system.md) | CSS 汙染與可及性 |
| [#27](https://github.com/laiw54724-ui/retro/issues/27) | [開源發行](issues/27-open-source-readiness.md) | Windows 圖示的非 MIT 發行方式 |
| [#28](https://github.com/laiw54724-ui/retro/issues/28) | [分享與匯出](issues/28-sharing-seo-export.md) | 草稿外洩與虛假成功 |

## 10. 跨單測試與發布門檻

這是未來實作的測試計畫，不是本輪測試結果。

| 測試層 | 必須涵蓋 |
| --- | --- |
| shared unit | v1→v2 遷移、重跑、引用、計數、公開投影、循環與配額 |
| API | owner／跨站拒絕、私密 raw asset、發布競態、匿名資料、失敗重試 |
| E2E | 建 OC→發文→具名喜歡／追蹤→角色導航→分享→公開頁 |
| 響應式 | 窄桌面內窗、手機、長中文、zoom、滾輪／觸控／鍵盤 |
| 媒體 | 壞圖、慢網、部分上傳失敗、字型 fallback、音訊拒播、canvas 匯出 |
| 開源交付 | 冷 clone、frozen-lockfile、build、授權 notices、資產清單及 secrets 檢查 |

既有檢查指令：pnpm typecheck、pnpm test:unit、pnpm test:e2e、pnpm build。新模組加入專屬測試，不只靠既有綠燈。每個階段只用測試站發布到 staging，記錄 commit／schema／公開 URL／驗收結果，再安排正式部署。

首發整體情境：作者有 A、B、未發布的 C；A 發多圖作品、B 按讚並留言、A 追蹤 B。匿名訪客能看到 A／B 與正確名單，點進 B 再返回不跳位置；分享可複製；原始 JSON、已知素材 URL、OG、匯出都看不到 C。任何一處失敗，不能宣稱草稿安全或首發完成。

## 11. 尚未替使用者做的決定

目前採用的設計預設已明示，不需要為每個小項再次確認；以下是實作前需實際驗證的門檻，不是空白規格：

- 圖示來源：使用 trapd00r/win95-winxp_icons 與 WinClassic 作固定來源；仍須決定非 MIT 圖示採 repo 內附、獨立 asset pack 或安裝時取得。
- 正式 LICENSE：建議 MIT，但要核對權利人與第三方排除範圍，不能替他人作品重授權。
- 大型套件：Konva／dnd-kit 等先做限定測試，再鎖定版本；本輪未安裝。
- 容量／成本：Profile／Post／Board／音訊配額依實測訂定；已提出的 Board／Folder 數值是初始設計預算，不是測量結果。
- 平台命名：保留既有 Instagram.exe 相容，公開品牌是否改為 OC Social.exe 可在 #27 發行審核決定。

## 12. 本輪交付與邊界

已完成原始碼與 Issues 核對、初始方向、開源研究、11 份逐單規格與本份整合設計；原 Issue 內容保留於 original-issues.json。GitHub 工作單維持 open，未勾選功能驗收項。

這輪不修改產品程式、不安裝新套件、不改使用者內容、不部署。下一步是審閱本設計後，針對 P0 與第一個 OC 垂直流程撰寫逐步程式實作計畫；不要把整個平台包進一個大型 PR。
