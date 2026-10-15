# #22 Music Player：角色播放清單與可控音訊

## 狀態與查核基準

2026-10-16 規劃更新，原始碼基準 e4d9722。以下清單均為待實作／待驗收，不代表已完成。原始 Issue 需求已保留。

## 獨立調查

[registry.ts](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/registry.ts) 的音樂播放器仍是 COMING_SOON。[ModuleCtx](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/web/src/features/modules/types.ts) 與 [assets API](https://github.com/laiw54724-ui/retro/blob/e4d9722/apps/api/src/routes/assets.ts) 只接受 image／icon 與圖片 MIME，不能說「沿用上傳」就已支援音訊。現有上傳上限 8 MB 也是圖片規則。

## 第一版決定

做原生 audio＋Retro 控制列，先以合法 HTTPS 音訊直連播放與外部平台連結為兩種明確來源。一般 YouTube／Spotify 網頁是「外部開啟」，不是音訊 URL；不抓取、不抽音、不繞 DRM，不自動嵌入追蹤第三方的 iframe。

Track 包含 id、title、artist、coverRef、source（audioUrl／externalLink）、可選 characterRef、rightsNote；Playlist 保存 trackIds 和順序。設定資料持久化，播放進度／音量屬訪客 session，不能 autosave 到作者草稿。

第一版提供封面、曲名、播放暫停、上一首／下一首、進度、音量、曲目清單；歌詞先接受作者有權使用的純文字，不接歌詞爬取服務。未填資訊顯示實際空狀態，不造假音訊長度。

## 播放生命週期

使用者點擊才開始播放；play() reject、不可 seek、載入逾時、404／403 都要顯示原因與「開啟原連結」。全 site 同時一個音源，啟動另一播放器先暫停前者。

縮小視窗繼續播放並在任務列顯示狀態；關閉視窗或離站暫停；切角色不自動換曲，角色主題曲只提供明確播放按鈕。手機不承諾背景自動播放，遵守瀏覽器限制。離開編輯預覽停止試聽，避免雙音源。

## 音訊上傳第二小階段

新增 kind: audio 前要先定可接受格式、每檔／每站配額、實際 byte 驗證、Range／HEAD／Content-Type、下載與串流快取、私密媒體保護、刪除引用檢查。不能把 8 MB 圖片端點放寬成無限任意檔案。

先用自製短音訊測試 MP3／Ogg／WAV 兼容與流量成本，再固定允許清單和配額。外部 URL 僅由瀏覽器載入，server 不做任意 URL 代理，避免引入 SSRF。

## 開源選型

- 原生 audio 優先，遵循 [MDN autoplay 說明](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)。
- [howler.js（MIT）](https://github.com/goldfire/howler.js) 留待音效／混音需求；基本播放清單不用它。
- [Webamp（MIT）](https://github.com/captbaritone/webamp) 可作日後獨立外觀模式，不直接取代現有視窗管理器。skin 與音樂權利另查。
- 不捆綁未授權音樂或歌詞。

## 工作拆分與檔案

1. packages/shared/src：playlist／track schema；modules/registry.ts 新增 music。
2. apps/web/src/features/modules/music/：View、Editor、單例音源協調 hook；視窗 lifecycle 接現有 site 層。
3. 寫 tests/e2e/music.spec.ts（新檔），驗證兩播放器、最小化／關閉、手機、無效 URL。
4. 獨立 PR 才擴充 assets.ts／DB kind migration 與 upload.test.ts 的 audio cases。

## 驗收

- [ ] 新增排序／刪曲／重載後清單一致，空清單仍可編輯。
- [ ] 第一個播放必由明確操作；播放失敗不顯示正在播放。
- [ ] 第二音源啟動前第一個暫停；縮小持續、關閉／離站停止。
- [ ] 進度與音量鍵盤可操作；不可 seek 音訊不提供假滑桿。
- [ ] 平台頁面只外部開啟，不假裝可播放；壞圖／壞音訊不拖垮其他視窗。
- [ ] 上傳階段通過 MIME／byte／配額／Range／私密素材／owner-boundary 測試。
- [ ] 不把 session 播放狀態寫進作者草稿。

## 依賴與風險

依 #18A app 能力與 lifecycle，OC 關聯依 #19；音訊上傳依 #18B、#27。可獨立於 #23／#24 發布。規模 M（直連），L（受保護上傳）。風險：版權、外站失效、瀏覽器播放限制與媒體費用。
