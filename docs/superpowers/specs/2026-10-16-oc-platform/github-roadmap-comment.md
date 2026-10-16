## 2026-10-16：逐單調查後的整體設計與依賴

#18–#28 已逐張補上現況證據、設計、範圍、開源選型、工作拆分、驗收與風險；全部維持 open，未宣稱實作完成。原始碼基準為 e4d9722。

### 產品主線

Retro 是創作者的角色小電腦。首發完整流程為：建立兩名 OC → 發作品 → 指定誰喜歡／追蹤／留言 → 點名單進另一角色 → 分享已公開角色／貼文。

角色資料置於 site 層，IG 視窗、Explorer、作品與音樂引用同一份角色 ID。單一創作者控制多個虛構角色是第一版；真正多人共同編輯屬 #21B。

### 設計收斂

- Win98 方形視窗與立體控制，圓形頭像／精選；Cubic 11 中英文優先。
- 角色頁包含可點統計、簡介、圓形精選、作品格狀／動態／合集；有內容才開放相關頁籤。
- 作者點哪裡改哪裡；進階數字和角色互動收在 contextual inspector，手機改全頁子畫面。
- 具名讚／追蹤／留言引用 OC，訪客本次操作不冒充角色也不混入作者設定的數字。
- 視窗容器寬度決定布局；底部導覽固定，內容有單一垂直捲動容器。
- 隱藏／最小化／noindex 均不是私密；所有公開出口使用 server projection，草稿媒體另需受保護通道。

### 執行順序

| 階段 | 工作 |
| --- | --- |
| P0 | #27A 授權／素材、#18A 版本與引用、#26A 圓形精選與容器規則 |
| P0 發布安全 | #18B 公開投影、私密媒體、原子發布與重試 |
| P1 | #19 多角色 → #20 內容 → #21A 具名互動；#28A 真分享 |
| P2 | #22 音樂、#23 Moodboard、#24 Explorer、#26B 主題、#28B/C SEO／匯出，各自交付 |
| P3 | #25A 小玩具、#25B 受審核留言簿、#21B 真人協作 |

A/B/C 是既有 Issue 內的里程碑；不要等整張大單全做完才接下一個契約，也不要因首段完成就關閉仍有後續範圍的 Issue。

### 開源決定

延伸現有 React／Zod／CSS，不搬整套社群 clone。Windows 圖示採 [trapd00r/win95-winxp_icons](https://github.com/trapd00r/win95-winxp_icons) 為主要來源、[WinClassic resources](https://winclassic.github.io/resources) 為補充查找與年代對照；Pixelarticons 免費 MIT 只作缺漏替代。Konva 是 Moodboard 試作候選；基本音樂先用原生 audio；ZIP 階段評估 fflate。

重要限制：圖示來源已指定，但 trapd00r repo 沒有 license，WinClassic 也明示圖示屬各原權利人；Retro 的 MIT 不涵蓋這些素材。#27 會固定來源 commit、建立檔名／hash 對照並決定非 MIT 素材的發行方式。[tldraw 目前授權](https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md) 也不能當成無條件 production MIT 依賴。候選套件均未安裝或完成相容性測試。

### 首發驗收情境

A、B 公開，C 為草稿；A 的作品有 B 喜歡／留言且 A 追蹤 B。匿名訪客能沿名單逛 A／B、返回位置正確、真正複製分享連結；原始 JSON、已知媒體 URL、OG、公開匯出不能讀到 C。這條端到端情境與舊站無損遷移是首發門檻。

本輪只有研究與規劃，沒有修改產品程式或部署。詳細設計與 11 份獨立規格保存於 repo 的 docs/superpowers/specs/2026-10-16-oc-platform/。
