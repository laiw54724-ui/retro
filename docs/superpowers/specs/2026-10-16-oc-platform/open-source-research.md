# 開源選型與素材風險調查

查核日期：2026-10-16。授權結論以所連結上游文件為依據；分支內容會變動，真正引入時必須固定版本／commit、保存 license 與來源。這是工程選型記錄，不是對整個專案完成法律清查的宣告。

## 結論

推薦「現有 React／CSS／Zod 為核心，挑小型積木」，不搬入一整套 Instagram clone，也不全面替換成 React95。OC 身分、作者編排的社群關係、發布快照都必須由 Retro 自己定義。

目前專案 manifest 使用 React ^19.2.0，鎖檔解析為 React／React DOM 19.3.1；評估相容性應看鎖檔。下列候選均尚未安裝、執行相容性測試或量測 bundle；授權與 README 調查不等於完成採用驗證。

## 選型矩陣

| 候選 | 上游證據／授權 | 用於哪張單 | 決定與原因 |
| --- | --- | --- | --- |
| 98.css | [專案](https://github.com/jdan/98.css)、[MIT](https://raw.githubusercontent.com/jdan/98.css/main/LICENSE) | #26 | 視窗／表單細節參考，必要時抽取有署名的 scoped 規則；不直接加全域 reset。現有 themeView 與 bevel 已可用。 |
| react95-io/React95 | [專案](https://github.com/react95-io/React95)、[MIT](https://raw.githubusercontent.com/react95-io/React95/master/LICENSE) | #26 | 比較用，不作整套替換；重疊既有元件與主題，新增樣式體系成本大。 |
| React95/React95（@react95/core） | [授權](https://raw.githubusercontent.com/React95/React95/master/LICENSE) | #26、#27 | 另一個不同專案。程式 MIT，但文件明確排除 Windows 相關圖片；不能拿來替現有圖示背書。 |
| Pixelarticons 免費版 | [MIT](https://raw.githubusercontent.com/halfmage/pixelarticons/master/LICENSE)、[官方安裝說明](https://pixelarticons.com/docs/) | #26、#27 | 圖示替代候選，維持原創 SVG／像素風並做統一映射。只採免費版，付費 Pro 素材不列入公開 repo。 |
| trapd00r/win95-winxp_icons | [收藏 repo](https://github.com/trapd00r/win95-winxp_icons)、固定 commit [728a866](https://github.com/trapd00r/win95-winxp_icons/tree/728a866ad59a54fd4082dbe000e1e62e50bd90e9) | #26、#27 | 使用者指定的主要 Windows 95／98／2000／XP 圖示來源。作為圖示 ID、檔名與來源基準；repo 未宣告 license，因此不把素材標成 MIT。 |
| WinClassic resources | [資源頁](https://winclassic.github.io/resources)、[舊程式圖示頁](https://winclassic.github.io/icons) | #26、#27 | 次要查找與年代／程式對照來源。網站明示所列圖示屬各自權利人，作歷史收藏；不是 Retro 的再授權來源。 |
| Cubic 11 | [專案與 OFL 說明](https://github.com/ACh-K/Cubic-11)、[OFL](https://github.com/ACh-K/Cubic-11/blob/main/OFL.txt) | #26、#27 | 繼續沿用，保留 OFL；修改字型時需另核對保留名稱條件。字型缺字仍要安全 fallback，不承諾涵蓋所有 Unicode。 |
| dnd-kit | [專案](https://github.com/clauderic/dnd-kit)、[MIT](https://raw.githubusercontent.com/clauderic/dnd-kit/master/LICENSE) | #20、#24 | 排序需求成形後做小型驗證；即使採用仍保留上移／下移和移動到選單，避免只有拖曳。 |
| react-konva／Konva | [MIT](https://raw.githubusercontent.com/konvajs/react-konva/master/LICENSE)、[peer dependencies](https://raw.githubusercontent.com/konvajs/react-konva/master/package.json) | #23 | Moodboard 優先試作候選；查核時 master 要求 React ^19.3.0，與目前鎖檔系列相符，但須選定發布版實測。文字輸入／讀屏使用 DOM 層。 |
| tldraw | [目前自訂授權](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md) | #23 | 不作預設依賴；此授權對 production 使用有限制，不能因原始碼可看就當成 MIT／無條件可部署。 |
| 原生 audio | [MDN autoplay 指南](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) | #22 | 第一版播放控制優先；不用引入整套音樂介面。必須等待使用者操作並處理 play() 失敗。 |
| howler.js | [專案](https://github.com/goldfire/howler.js)、[MIT](https://raw.githubusercontent.com/goldfire/howler.js/master/LICENSE.md) | #22 | 需要複雜音效混音時才採用，基本播放清單先不用。 |
| Webamp | [專案](https://github.com/captbaritone/webamp)、[MIT](https://raw.githubusercontent.com/captbaritone/webamp/master/LICENSE.txt) | #22 | 可作日後 Winamp 外觀選項，不嵌套第二套桌面／視窗管理；音樂和第三方 skin 權利另外核對。 |
| react-arborist | [專案](https://github.com/brimdata/react-arborist)、[MIT](https://raw.githubusercontent.com/brimdata/react-arborist/main/LICENSE) | #24 | 大型樹狀目錄候選；初版小目錄用原生清單與麵包屑，避免先增加虛擬化和拖曳依賴。 |
| fflate | [專案、MIT 與串流 ZIP API](https://github.com/101arrowz/fflate) | #28 | JSON 匯出不需要；媒體封裝 ZIP 階段做非同步／串流驗證，再決定採用。 |

## 有沒有現成 IG 可以搬？

- [karlhadwen/instagram](https://github.com/karlhadwen/instagram) 提供 MIT 的 React／Firebase 教學專案。可參考頁面拆分，並非 Retro 的 site document／R2／Win98／多虛構角色模型；不搬入另一套 Auth 和 Firestore。
- [ProsperOjonimi/instagram-clone](https://github.com/ProsperOjonimi/instagram-clone) 的 React／Supabase 技術比較接近，但功能目標仍是真實帳號、即時讚與留言。此次未確認可用的獨立 license 文件，不能據 README 或公開 repo 身分就複製程式碼。
- 本輪評估沒有選出可直接嵌入且已驗證符合需求的完整 OC Instagram。這不是宣稱網路上不存在，而是目前證據不足以讓整套替換優於延伸現有模組。

## 本 repo 的具體開源風險

在 e4d9722 查核：

- 尚未找到已追蹤的專案根目錄 LICENSE；建議自有程式 MIT，實際加入授權前記錄權利人與授權範圍。
- 已追蹤的 apps/web/public/win98-icons 下有 1,757 個檔案。使用者已指定 [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons) 為主要來源、[WinClassic resources](https://winclassic.github.io/resources) 為補充來源；後續以固定 commit、原檔名與 hash 建立對照，不再標記為「來源不明」。
- 來源可追溯不等於取得再散布授權：GitHub repo 沒有 license，WinClassic 也說明圖示屬各自權利人。Retro 程式可採 MIT，但 Windows 圖示必須列為非 MIT 的第三方／原權利人素材，並在正式開源發行前決定隨 repo 提供、獨立 asset pack 或安裝時由使用者取得的方式。
- 字型已附 apps/web/public/fonts/OFL.txt，但仍應補來源與版本／檔案 hash。
- 使用者提供的 Windows 圖示資料夾與 zip 可依上述兩個指定來源做檔案對照；未比對成功的檔案仍先留在研究輸入，不自動納入發行。參考圖只作設計研究。
- 角色插畫、上傳照片、音樂、歌詞與引用作品的權利，不隨程式碼 MIT 改變；預設保留原作者權利。範例資料要用自製或有明確授權的內容。
- Instagram.exe 作為既有稱呼可先保留相容，但公開產品名稱建議「OC Social.exe／角色社群」，避免暗示官方關聯；這是命名建議，不在本輪自動更名。

## 採用門檻

每個新套件都要記錄：精確版本、直接與轉接依賴授權、來源、必要 notices、React／build 相容、鍵盤／觸控實測、bundle 增量及卸載替代方案。用鎖檔與 frozen-lockfile 驗證可重現安裝。不能以星數取代安全檢查，不能把 Pro／範例素材一起打包。

## 後續驗證重點

1. #26：98.css scoped 對照，確認不改壞全站 input、字型、焦點與已設定的顏色。
2. #23：Konva 驗證中文輸入、字型載入、縮放後拖曳、PNG 匯出與跨域圖片。參考 [Konva canvas 污染說明](https://konvajs.org/docs/posts/Tainted_Canvas.html)。
3. #22：原生 audio 的錯誤／暫停／播放仲裁，素材權利與外站連結的可播放性分開判定。
4. #24：達到大型目錄需求後才比較原生清單與 react-arborist。
5. #28：fflate 驗證記憶體、取消、檔案數／解壓大小限制，不能只測小 ZIP。
