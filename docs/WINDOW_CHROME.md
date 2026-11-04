# 視窗骨架使用契約（Issue #49）

`RetroWindow` 是既有 App 的相容入口；`WindowChrome` 提供可替換樣式的 frame、titlebar 與區塊插槽。App 繼續持有內容與操作狀態，視窗管理器繼續持有拖曳、縮放、焦點、最小化、最大化、關閉與手機導覽。更換 preset 不應建立另一份 App、重建內容 schema，或以 preset 作為 React `key`。

本文件對應 `feat/retro-window-chrome`。PR stack 的 base 是 `codex/appearance-foundation`，起點 `d47e798`，**Blocked by [PR #38](https://github.com/laiw54724-ui/retro/pull/38)**。最後 fetch 的 `origin/main` 為 `aa8b75a`（[PR #48](https://github.com/laiw54724-ui/retro/pull/48)）。另以自己的 detached worktree，將 #38 與本 Issue 的 diff 依序套用至該 main，已通過 typecheck、22 項 editor 整合測試與 23 項專用視覺／瀏覽器測試；未建立 merge commit 或修改 main。#38 合併後仍須由整合者調整 PR base，若最終內容改變則重跑相應驗證。

## 1. 匯入與責任邊界

| 入口 | 用途 |
| --- | --- |
| [`RetroWindow.tsx`](../apps/web/src/components/RetroWindow.tsx) | 保留 `icon?: string` 的現有呼叫方式；轉接內建 `Icon`，提供可選的通用狀態列。匯出 `RetroWindowProps`。 |
| [`components/window-chrome`](../apps/web/src/components/window-chrome/index.ts) | 匯出 `WindowChrome`、`WindowChromeSlot`、`WindowTitleBar` 與下列 primitives、runtime types。`WindowChrome.icon` 接受 `ReactNode`。 |
| [`@retrodesk/shared`](../packages/shared/src/window-chrome.ts) | 只提供可序列化 `window.chrome` schema、types 與 `resolveWindowChrome()`。不依賴 React。 |
| [`resolveWindowAppearance`](../apps/web/src/lib/windowAppearance.ts) | 統一處理 preset、主題、自訂標題配色與作用中狀態；desktop、mobile、外觀預覽共用。 |

骨架不決定視窗何時開啟、不發 API request，也不修改 store。現有 desktop editor 的位置／大小／層級編輯仍可以儲存；visitor manager 的相同手勢只改 runtime state。`onClose` 表示交由 host 關閉，不表示刪除使用者的視窗資料。

### 核心 props

`WindowChromeProps` 是下表契約；`RetroWindowProps` 只把 `icon` 改成字串。三個視窗操作 callback 也可用匯出的 `WindowControlHandlers` 描述。全部 React nodes、函式與 style props 均為 runtime 值，不能存入 `SiteDocument`。

| Props | 型別／預設 | 呼叫端需要知道的行為 |
| --- | --- | --- |
| `title`, `theme`, `children` | `string`, `RetroTheme`, `ReactNode`；必填 | `children` 是原 App。預設 frame 為 `role="dialog"`，名稱來自 title。這不是 modal 或 focus trap。 |
| `appearance` | `DesktopWindow["appearance"]`；optional | 沿用既有自訂配色，與 `chrome` 分開儲存。 |
| `chrome` | `WindowChromeInput`；optional | 缺席時使用 render defaults，不回寫 document。 |
| `icon` | `ReactNode`；optional | `RetroWindow` 的同名 prop 是 `string`；`showIcon: false` 隱藏 titlebar icon。 |
| `active`, `maximized` | 預設 `true`, `false` | 由 manager 傳入；骨架不自行變更。 |
| `interactiveControls` | 預設 `false` | `false` 是無 tab stop 的裝飾控制；`true` 才是按鈕，缺少對應 callback 的按鈕會 disabled。 |
| `onMinimize`, `onMaximize`, `onClose` | `() => void`；optional | `onMaximize` 也用於「還原」，由 manager 依目前狀態切換。 |
| `presentation` | `"desktop" \| "mobile"`；預設 desktop | Mobile 保留同一份 preset，控制項只保留設定中存在的 close；不顯示 minimize／maximize。 |
| `slots` | `WindowChromeSlots`；optional | `titleBar` 是 render function，其餘是 App 或 host 提供的 React nodes。 |
| `fallbackSlots` | `Partial<Record<WindowChromeSection, ReactNode>>`；optional | 僅在同區沒有直接 slot 內容，也沒有 App portal registration 時顯示；適合通用狀態列。 |
| `titleBarLeading`, `titleBarTrailing` | `ReactNode`；optional | 放返回鈕等 host 導覽；不受 `controls` 或 `showIcon` 隱藏。 |
| `titleBarProps`, `contentProps`, `frameProps` | 對應 element 的 React HTML props | 用於 manager 手勢、ARIA、className 等接線。`frameProps` 可將展示 frame 改為 `role="group"`。 |
| `style`, `bodyStyle` | `CSSProperties`；optional | 提供 frame 尺寸或內容區樣式；不是使用者 CSS schema。一般標題配色應走 appearance resolver。 |

控制項固定依 minimize → maximize／restore → close 顯示；`controls` 是顯示 allowlist，不是任意排序 API。若要保留 titlebar 雙擊最大化，host 除了 `onMaximize`，也要傳 `titleBarProps.onDoubleClick`；骨架會確認 maximize 可用，並排除按鈕、輸入等互動目標。

現有 manager 仍使用 `.retro-titlebar`、`.titlebar-controls`、`.retro-window`、`.retro-window-body` 與外層 `.window-resize-handle` 作為接線點。自訂 titlebar 應透過 `slots.titleBar: (props) => <WindowTitleBar {...props} />` 延伸，保留傳入的 ARIA、手勢與控制 props。調整 resize handle 與 outer wrapper 的工作屬於 manager。

## 2. 可儲存的 `window.chrome`

`WindowChromeSchema` 已作為 optional 欄位加入 v1 `BaseWindowSchema` 與 v2 `BaseV2Window`，所有現有 window type 共用，不改 App content。整個物件與 `sections` 都採 strict 驗證：未知 key、React node、callback、任意 CSS、非法控制 action 或重複 action 會被拒絕。

| 欄位 | 允許值 | 物件存在時的預設 |
| --- | --- | --- |
| `preset` | `classic-95`、`classic-98`、`compact-98` | `classic-98`；沒有 `pixel-flat`。 |
| `controls` | `minimize`、`maximize`、`close` 組成的陣列，最多 3 項且不得重複 | 三項全開；`[]` 合法。 |
| `showIcon` | boolean | `true`。 |
| `density` | `normal`、`compact` | `normal`；compact preset 或 compact density 都可使間距緊湊。 |
| `sections` | optional strict object | 不建立預設物件。 |
| `sections.menuBar` / `toolbar` / `statusBar` / `footerActions` | 各自 optional boolean | 缺席表示依供應內容自動顯示。 |

匯出型別包括 `WindowChromeInput = z.input<typeof WindowChromeSchema>`、`WindowChromeConfig = z.output<typeof WindowChromeSchema>`、`WindowChromePreset`、`WindowControlAction`、`WindowChromeSection`。Input 允許省略預設欄位，Config 則已有解析後的預設值；各 enum／sections schema 也可單獨匯入。

```ts
import { WindowChromeSchema, resolveWindowChrome } from "@retrodesk/shared";

const chrome = WindowChromeSchema.parse({
  preset: "classic-95",
  controls: ["close"],
  sections: { statusBar: true }
});

// UI 的 Apply：沿用既有 updateWindow，整組設定一次進入 history。
updateWindow(windowId, (current) => ({ ...current, chrome }));

// UI 的 Reset 也要由 Apply 提交，只重設 chrome。
updateWindow(windowId, (current) => ({ ...current, chrome: undefined }));

// 僅供 render 使用，不會把 chrome 補寫到舊 document。
const resolved = resolveWindowChrome(existingWindow.chrome);
```

`resolveWindowChrome()` 會嚴格解析，無效 runtime 值會 throw；不要把未驗證的外部 JSON 直接送進 renderer。v1/v2 載入、migration、legacy projection／merge、public projection、export/import 均保留合法設定。原先沒有 `chrome` 的 document 不會因讀取或遷移而多出這個欄位。已有 v2 的 validation-only load／migration 仍保留原輸入物件，不因驗證而補寫預設值。

## 3. 區塊供應、隱藏與 App state

`WindowChromeSlots` 提供 `titleBar?: (props: WindowTitleBarProps) => ReactNode`，以及 `menuBar`、`toolbar`、`statusBar`、`footerActions` 四個 optional ReactNode。`titleBar` 不是 `WindowChromeSection`，不受 `sections` 開關控制。

| 該區資料／供應情況 | 最終行為 |
| --- | --- |
| `sections[name]` 缺席，且有直接 slot 或 App portal | 自動顯示。 |
| `sections[name] === true`，且有直接 slot 或 App portal | 顯示供應的內容。 |
| `sections[name] === false` | 隱藏該區，即使 App 有供應內容；不占版面空間。 |
| 沒有直接內容、沒有 portal registration，但有 fallback | 可以顯示 fallback，仍受 `false` 隱藏。 |
| 以上都沒有 | 不顯示空白區；`true` 本身不會製造一個工具列。 |

請以 `null`、`undefined` 或 `false` 表示沒有 slot 內容；空 Fragment、空陣列或會回傳 null 的元件不等於沒有供應 ReactNode。每個 section 應有單一明確的 App／host owner；同時提供直接 slot 與同名 portal 不會自動合併或去重。

`RetroWindow` 的通用狀態列只在 `chrome.sections.statusBar === true` 時成為 fallback。它顯示視窗標題及視窗／最大化狀態；App 直接提供 statusBar 或註冊同名 `WindowChromeSlot` 時，通用 fallback 退讓，不應重複顯示兩條狀態列。

### App 內供應 runtime slot

若 toolbar 或 status 需要讀取 App 的 state，使用 `WindowChromeSlot`。它在 App 的 React tree 內透過 portal 放到 frame outlet，不必把 App state 搬進全域 store，也不需要修改 registry。

```tsx
import { useState } from "react";
import {
  WindowChromeSlot, WindowChromeButton, WindowToolbar,
  WindowStatusBar, WindowStatusField
} from "../../components/window-chrome";

function ExampleApp() {
  const [count, setCount] = useState(0);
  return <>
    <WindowChromeSlot name="toolbar">
      <WindowToolbar label="範例操作">
        <WindowChromeButton onClick={() => setCount((value) => value + 1)}>
          增加
        </WindowChromeButton>
      </WindowToolbar>
    </WindowChromeSlot>
    <p>App 內容與狀態由這個元件持有。</p>
    <WindowChromeSlot name="statusBar">
      <WindowStatusBar><WindowStatusField>次數：{count}</WindowStatusField></WindowStatusBar>
    </WindowChromeSlot>
  </>;
}
```

同一個 WindowChrome host 會保留 frame、內容區與 outlet DOM。切換 preset 或把某區設為 `false` 時，已掛載的 portal 子樹只被隱藏，不因切換外觀而 remount；輸入內容與 App state 因而可以保留。沒有外層 WindowChrome 的獨立預覽則直接在原位置 render slot children。

呼叫端應保留穩定的 window id、元件 type、React key 與 slot name。若主動切換 portal target、移除 App、重建 host，或 manager 在關閉／最小化時 unmount App，既有 React lifecycle 仍會生效；此契約不代表 runtime state 已持久化或能跨 reload 保存。

## 4. Primitives 與鍵盤行為

| 元件／type | 使用方式與邊界 |
| --- | --- |
| `WindowTitleBar` / `WindowTitleBarProps` | 保留 controls、active title 視覺及 manager 傳入的 titleBarProps；自訂 titleBar slot 的建議起點。 |
| `WindowMenuBar` / `WindowMenuBarProps` | `menus: readonly WindowMenu[]`，optional label 預設「視窗選單」。提供單層 menubar，支援方向鍵、Home／End、Enter／Space、Escape、Tab 離開與字首搜尋。 |
| `WindowMenu`, `WindowMenuItem` | Menu 有 `id / label / items / disabled?`。Item 為 `{ id, separator: true }`，或 `{ id, label, onSelect?, disabled?, shortcut?, checked? }`。ID 在各自範圍保持穩定且唯一。 |
| `WindowToolbar` / `WindowToolbarProps` | 必填 `label`，orientation 預設 horizontal；普通控制項以 roving tab stop 與方向鍵導覽。文字輸入及內嵌複合元件保留自己的按鍵用途。 |
| `WindowChromeButton` / `WindowChromeButtonProps` | 接受原生 button props，預設 `type="button"`；`pressed` 為 controlled 狀態。`isDefault` 只標示預設按鈕外觀，不自動綁 Enter 或 submit。 |
| `WindowStatusBar`, `WindowStatusField` | 提供狀態列與 sunken 分區；StatusBar 為 `role="status"`、`aria-live="off"`，避免頻繁內容更新造成無意義宣讀。 |
| `WindowFooterActions` | 包裝 App 底部操作鈕，不決定按鈕行為。 |
| `WindowSeparator` / `WindowSeparatorProps` | horizontal／vertical 分隔線；使用 separator 語意。 |
| `WindowSunkenPanel` | 可捲動的凹陷內容區，使用 native div props。 |

Menu 的 `shortcut` 是顯示提示，實際快捷鍵綁定屬於 App。`checked` 也由 App 更新。Disabled 或沒有 `onSelect` 的 command 不執行；disabled menu item 仍可供鍵盤閱讀。選單觸發 command 前會先還原到 trigger，讓 callback 開啟的新對話框接管焦點。這些 primitives 沒有新增 action registry、腳本執行器或多層選單。

窄視窗的 popup 會依 frame 與 viewport 邊界定位；隱藏後再顯示的 toolbar 會恢復可用的 tab stop。220 × 140 的最小尺寸展示仍保留內容區、可捲到 footer，且 titlebar 固定於 frame 頂端以維持控制鈕可達。Desktop coarse-pointer 控制鈕與 mobile close／back 的 hit target 為 44 px；desktop layout overlay 的局部 CSS 配合放大後的 titlebar，避免遮住控制鈕下半部。

## 5. 與 #35／#50／#51／#52 的整合方式

### #35：外觀 resolver 優先序

正常渲染路徑的優先序如下；刻意傳入 `titleBarProps.style` 仍是呼叫端的 CSS override，後續 App 應共用 resolver，避免各自重寫背景與文字色規則。

| 狀態 | 背景與文字色來源 |
| --- | --- |
| Active 且有明確 `appearance` | 依 `titleGradient` 使用自訂純色或漸層，並計算可讀文字色。**這比 preset 的預設填色優先**；Classic 95 也可保留作者明確指定的漸層。 |
| Active、無 appearance、Classic 95 | 使用主題 `titleFrom` 純色與可讀文字色。 |
| Active、無 appearance、Classic 98／Compact 98 | 使用主題 title gradient 與主題文字色計算。 |
| Inactive、Classic 95 | 使用主題 `shadow` 純色及可讀文字色。 |
| Inactive、Classic 98／Compact 98 | 使用既有 inactive title gradient 與主題文字色；inactive 外觀不沿用 active 的 appearance。 |

切 preset 不應清除 `window.appearance`、更換 theme 或修改 App content。此 Issue 提供視窗樣式選擇及既有 appearance 的接線，不代替 #35 的後續外觀工作。

| 後續 Issue | 使用此契約的方式 | 留給該 Issue 的工作 |
| --- | --- | --- |
| #50 | App 按鈕／選單透過 runtime callback 呼叫 host；一般視窗控制沿用 `onMinimize / onMaximize / onClose`。 | 動作定義、按哪個鈕開哪個視窗、trigger 與 App 行為。不要把 handler 或 action schema 塞進 `window.chrome`。 |
| #51 Image App | 圖像內容放 `children`，需要的操作列／狀態列放 `slots` 或 `WindowChromeSlot`；一份 App 可套三個 preset。 | Image App 本身的資料、媒體呈現與編輯互動。 |
| #52 Music／播放器 | 音訊與播放狀態由原 App／音訊協調器持有；transport、metadata、status 可進 runtime slots。 | 播放器內容、音訊操作與其他皮膚；更換 chrome 不應創建第二個 audio instance。 |

### Editor 與手機

Desktop 的「版面」tab、mobile 的「編輯視窗」sheet 共用 `WindowChromeEditor`。preset、控制鈕、icon、density 與 sections 都先留在元件內 preview；取消不寫入，Apply 才以一次 `updateWindow` 進入 history。Reset 同樣先 preview，Apply 時只重設 chrome。

`availableSlots` 是 `WindowChromeEditor` 的 runtime capability prop，不能憑 `window.type` 猜測 App 有何能力。現有 editor 尚未接 App capability provider，因此 menu、toolbar、footer 的開關 disabled；statusBar 可啟用通用 fallback。後續接 App slots 時，host 應一併提供 capability，並與實際供應內容保持一致。

MobileScreen 使用相同 `chrome` 與 appearance，傳 `presentation="mobile"`，由 `titleBarLeading` 保留「‹ 桌面」。即使 `controls: []` 或 `showIcon: false`，返回入口仍存在。手機 close／back 使用較大的觸控範圍；骨架不在手機重新實作 desktop 拖曳管理器。

## 6. 展示、視覺回歸與驗證命令

使用既有 Vite 開發服務，開啟 **`/window-chrome.html`**；例如 [http://127.0.0.1:5173/window-chrome.html](http://127.0.0.1:5173/window-chrome.html)。入口為 [`apps/web/window-chrome.html`](../apps/web/window-chrome.html)，展示實作為 [`WindowChromeShowcase.tsx`](../apps/web/src/dev/WindowChromeShowcase.tsx)，不需要新增 Storybook 依賴。

五組 fixture 為 Application Error、Sound Recorder、Paint、Help、Instagram。Help 的 tabs／搜尋／counter／draft 與既有 Instagram navigation 可互動；Recorder waveform、Paint 畫面是明確標示的展示內容，並不代表已完成錄音或繪圖 App。**Screenshot baselines 來自這些自製 HTML/CSS fixture 與本地示例內容，不是 Windows 系統圖片，也不構成與原生 Windows 逐像素一致的證據。**

頁尾可展開「API contract and minimum-size example」：220 × 140 frame 示範全部 sections、長標題、起初隱藏的 toolbar、App／直接 slot／fallback 狀態列的供應關係，以及真正接線的最小化、最大化、關閉與還原。

請使用 repository 指定的 Node 22 與 pnpm 10.18.2，依既有開發文件安裝依賴與瀏覽器。以下命令從 repository root 執行：

```sh
# 開啟展示；或讓下方 Playwright config 自動啟動 Vite。
pnpm --filter @retrodesk/web dev --host 127.0.0.1 --port 5173

# Chromium Linux：專用 screenshot baseline 與行為驗收。
pnpm exec playwright test --config=playwright.chrome.config.ts --project=chrome-linux --workers=1

# Playwright WebKit：只執行 @smoke 行為測試，不拿 Linux Chromium PNG 比對。
pnpm exec playwright test --config=playwright.chrome.config.ts --project=chrome-webkit --workers=1

# 真實 editor／mobile sheet／visitor manager、Minesweeper 與原生 audio 的整合測試。
pnpm exec playwright test tests/e2e/window-chrome-editor.spec.ts --project=chromium --workers=1

# schema 與 store 的局部驗證。
pnpm --filter @retrodesk/shared test:unit
pnpm --filter @retrodesk/web exec vitest run src/features/editor/windowChrome.test.ts

# Repository 規定的完整 contributor gate。
pnpm verify:contributor
```

專用 [`playwright.chrome.config.ts`](../playwright.chrome.config.ts) 固定 viewport、locale、timezone、色彩模式、縮放比與動畫設定；PNG 存在 `tests/e2e/__screenshots__/window-chrome/`，檔名包含 project 與 OS。一般 e2e config 會發現 visual spec 的 smoke tests，但 screenshot 比對只在專用 `chrome-linux` project 的 Linux Chromium 執行。調整外觀後應先檢視差異，再於相同環境以 `--update-snapshots` 更新，不要以不同 OS／browser 的圖直接覆蓋。

[`window-chrome.visual.spec.ts`](../tests/e2e/window-chrome.visual.spec.ts) 覆蓋三種 preset、active／inactive、窄視窗、選單、slot 隱藏與同一 DOM/state 保留；[`window-chrome-editor.spec.ts`](../tests/e2e/window-chrome-editor.spec.ts) 使用 canonical v2 mock，避免將 v1 migration autosave 誤判為 preview 寫入。它的 9 項測試驗證 local preview／cancel／Apply／Reset、save/reload、public／visitor parity、320／375／430 px 手機、visitor 手勢零寫入、coarse-pointer 控制鈕及真實 Minesweeper state。音訊測試經由原有 Music editor 與 audio coordinator 播放自製 PCM WAV，確認切換 chrome 後仍為同一個 HTMLAudioElement，時間持續前進，且沒有額外 load／play／pause 或中斷事件。

### 實際驗證結果（2026-10-17）

已驗證 source candidate 的 Git tree 為 **`fe909bc44a28a503c3ca09a779a8dea88b5b8b71`**；遠端 commit `9102db661ec3131d77647da015da2054461e9572` 與本機測試 commit `3da7ce1` 的 tree 完全相同，後續文件提交不變更程式或 baseline。主要完整 gate 使用 **Node 22.23.3、pnpm 10.18.2、Playwright 1.64.1、Chromium 156.0.8078.4、Linux**，exit code 0。同一 source candidate 另於環境預設的 Node 24.19.0 完整通過一次。專用視覺／WebKit 與 main 整合驗證使用 Node 24.19.0；WebKit engine 為 27.2。

| 範圍 | 實際結果 |
| --- | --- |
| `pnpm verify:contributor` | **PASS**，Node 22 與 Node 24 各完成一次；包含下列 audits、typecheck、unit、build 與一般 E2E。 |
| Secrets／assets／licenses 稽核 | **PASS**：365 個 worktree paths、2,841 個 Git objects；2 個已確認來源的 bundled assets；148 個 packages 的 license assertions。build 後另掃描 14 個 artifact files。 |
| 全專案 typecheck | **PASS**，shared、web、API 三個 package。 |
| 全專案 unit tests | **267 / 267 PASS**：shared 94、web 67、API 106。包含新增 19 個 shared chrome 契約／roundtrip tests、2 個真實 editor store history tests。 |
| 全專案 build | **PASS**；web production bundle 與 API Wrangler **dry-run**，未部署。原有 bundle size、Zod annotation 與 Wrangler environment 提示仍可見。 |
| 一般 E2E | **140 PASS、9 SKIP、0 FAIL**；新增 9 個 editor chrome tests 全部執行通過。9 個 SKIP 是刻意留給專用 Linux config 的 screenshot tests，已在下一列全部執行。 |
| `playwright.chrome.config.ts` | **23 / 23 PASS**：Chromium 16、WebKit smoke 7。9 個 Chromium screenshot tests 共比較 **27 張已提交 PNG**，其餘為行為驗收；最後驗證沒有更新 baseline。全部 PNG 另經視覺檢視。 |
| 最新 main 整合候選 | `aa8b75a` + #38 + source candidate 的 patches 乾淨套用，Git tree **`1d9dbccf8691eb4dc07f3ad6538576a12e661880`**，未產生 merge commit。全專案 typecheck **PASS**。 |
| main 整合的 editor 驗證 | `editor-layout.spec.ts` + `window-chrome-editor.spec.ts`：**22 / 22 PASS**，包括 #48 的 sidebar／focus scrim 與本 Issue 的 9 個 chrome 測試。 |
| main 整合的專用視覺驗證 | **23 / 23 PASS**；同一組 27 張 PNG 全部比較通過。 |

首次完整 gate 曾有 4 個既有 E2E fixture 失敗，已逐一修正後重新執行完整 gate：外觀欄位 locator 改為 exact match；layout fixture 改用 canonical v2 與明確 z-order、攔截並計算真正 mutation；分享連結依目前 origin 建立預期值；icon autosave 等待指定 icon 寫入而非搶先完成的 migration save。這些修正不改產品行為，也未降低驗收 assertion。

目前的 200% 自動測試使用 `document.documentElement.style.zoom = "2"`，是 **CSS zoom**；尚未完成瀏覽器原生介面的 200% page zoom 人工驗收。Playwright WebKit 是特定測試 engine，不能等同使用者 iPhone／macOS 上真正的 Safari。Native browser zoom、真 Safari／iPhone 的觸控與捲動仍待人工驗收，不能以 CSS zoom 或 WebKit smoke 代替。
