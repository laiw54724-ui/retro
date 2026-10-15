# #26 Win98 優先的視覺規則、圓形精選與跨裝置一致性

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

[themeView.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/lib/themeView.ts) 與 [shared schema](https://github.com/laiw54724-ui/retro/blob/e4d9722/packages/shared/src/site.ts) 已有主題和單視窗外觀資料，並非從零建立。Cubic 11 已在本地字型資產中。
[ig.css:94](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/styles/ig.css#L94) 同時把頭像、精選封面改方形，是使用者問題的直接原因。既有 [DesktopTaskbar.tsx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/site/DesktopTaskbar.tsx) 已有共用開始／時間元件，不再寫第二份。

## 26A：OC 首發必要設計

視窗系統為 Win98 預設；保留使用者已選的主題，不因升級抹掉配色。Windows 式立體邊框、清楚的作用中標題列、方形控制鈕；社群內容的頭像與精選使用圓形。這是不同層級的形狀規則，不用全域 border-radius: 0 解決。

外觀優先序：基礎 tokens → 站點主題 → 單視窗覆寫 → App 內容 token。單視窗標題列可獨立選純色／漸層及起訖色；inactive、focus、disabled 色狀態明確，不能覆寫網站字型或內容圖片。

Cubic 11 作為中英文優先字型，所有 input／button／select 繼承。無字形時合理 fallback，不能保證所有生僻字都有字。手機載入失敗先可讀，不顯示長時間空白文字。正文建議 16px 起、標籤至少 14px，以 200% 縮放與長中文驗證，不把整個桌面 scale 小來湊版面。

基本間距使用 4／8／12／16／24px。視窗邊框與裝飾可以細緻，觸控主要控制點至少 44px；視覺 icon 小但點擊區可擴大。文字與控制狀態需符合 WCAG AA 對比，不只靠顏色表達選中。

## 窗口與手機行為

按容器寬度切 IG 內容布局，桌面 360px 小窗也要用緊湊版。外框 flex／min-height: 0，中間唯一垂直 scroll owner，導覽列 flex-shrink: 0；列表、精選橫向捲動不可攔住整個頁面的垂直觸控。

桌面編輯、訪客預覽、公開頁共用外觀元件；手機以單一 active window 呈現，不保留桌面視窗任意座標。先確認開始選單、時間、最小化／還原、焦點返回等既有行為不退步。

背景圖的 cover／contain／tile、position 與原始尺寸必須是明確設定且所有模式一致，不把預覽圖當原始圖片縮放。這是回歸門檻，不在本單重做已完成的發布背景修復。

## 26B：後續個人化

建立 classic Win98、Y2K、像素三個經驗證的 preset，所有 preset 都使用同一 token 契約。可預覽、取消、重設；未經確認不立即覆蓋整站。圖示選擇延續「精選＋搜尋」，來源只用 #27 已清查素材。

## 開源選型

[98.css（MIT）](https://github.com/jdan/98.css) 作細節參考／scoped 抽取；[react95-io/React95](https://github.com/react95-io/React95) 不作全面替換。另一個 [@react95/core 的 license](https://raw.githubusercontent.com/React95/React95/master/LICENSE) 排除 Windows 圖片，不能順便複製圖示。
Windows 圖示採使用者指定的 [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons) 為主要來源、[WinClassic resources](https://winclassic.github.io/resources) 為查找與年代對照；Pixelarticons 免費版只作缺漏圖示的替代候選。字型沿用 [Cubic 11 OFL](https://github.com/ACh-K/Cubic-11)。圖示選擇仍是「精選＋搜尋」，任何引用附來源與適用的權利聲明。

## 工作拆分與驗收

先修改 styles/ig.css、lib/themeView.ts 與代表性 ProfileHeader；再盤點共用 controls、DesktopTaskbar、手機 renderer。避免一次重寫所有 CSS。

- [ ] Win98 頭像／精選圓形；視窗控制鈕仍保留方形及 bevel。
- [ ] 純色／漸層／單視窗覆寫保存重載一致，預覽／公開頁一致。
- [ ] 中英文、表單、開始選單與時間皆依字型規則；缺字／慢網可讀。
- [ ] 320–430px 手機、360–720px 內窗、200% zoom 無橫向溢位或遮擋。
- [ ] 鍵盤焦點可見、Esc 返回、減少動態、長名稱與空內容正確。
- [ ] 開始／時間／任務列與背景顯示回歸測試全過。
- [ ] 新 CSS 沒有無差別改全站 controls；主題快照涵蓋明暗與作用中／未作用中。
- [ ] preset 撤銷可恢復原外觀；素材只有已核對授權的來源。

## 依賴與風險

26A 圓角與容器規則可獨立先做，#19／#20 沿用；新版資料不構成這項 CSS 修正的前置依賴。26B 依 #27 素材清查。規模 M；風險為全域 CSS 互相覆蓋、對比與原設定被重設。
