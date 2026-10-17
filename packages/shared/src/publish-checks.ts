import { detectPlatformFromUrl } from "./embed-provider";
import { SiteDocumentSchema, type SiteDocument } from "./site";

export type CheckLevel = "ok" | "warn" | "error";
export type PublishCheck = { level: CheckLevel; text: string };

/** Pre-publish checklist. "error" blocks publishing; "warn" is advice only. */
export function buildPublishChecks(document: SiteDocument): PublishCheck[] {
  const windows = document.windows;
  const untitled = windows.filter((window) => !window.title.trim()).length;

  const captions: string[] = [];
  for (const window of windows) {
    if (window.type === "gallery") for (const image of window.content.images) if (image.src) captions.push(image.caption || image.title);
    if (window.type === "document") for (const block of window.content.blocks) if (block.kind === "image" && block.src) captions.push(block.alt);
    if (window.type === "moodboard") for (const element of window.content.elements) if (element.kind === "image" && element.src) captions.push(element.alt);
  }
  const missingAlt = captions.filter((text) => !text || !text.trim()).length;

  let emptyLinks = 0;
  for (const window of windows) {
    if (window.type !== "links") continue;
    for (const link of window.content.links) {
      if (link.target === "window" ? !link.windowId : !link.url || link.url === "https://") emptyLinks += 1;
    }
  }
  const autoOpen = windows.filter((window) => window.defaultOpen).length;
  const uploadedAudioWithoutRights = windows.reduce((count, window) => count + (window.type === "music" ? window.content.tracks.filter((track) => track.source.kind === "uploadedAudio" && !track.rightsNote.trim()).length : 0), 0);
  const audioFile = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|webm)$/i;
  const platformAsAudio = windows.reduce((count, window) => count + (window.type === "music" ? window.content.tracks.filter((track) => {
    if (track.source.kind !== "audioUrl") return false;
    try { return !!detectPlatformFromUrl(track.source.url) && !audioFile.test(new URL(track.source.url).pathname); } catch { return false; }
  }).length : 0), 0);
  const schema = SiteDocumentSchema.safeParse(document);

  const checks: PublishCheck[] = [
    windows.length ? { level: "ok", text: `共 ${windows.length} 個視窗` } : { level: "error", text: "桌面上還沒有任何視窗" },
    untitled ? { level: "error", text: `${untitled} 個視窗沒有標題` } : { level: "ok", text: "每個視窗都有標題" },
    autoOpen ? { level: "ok", text: `訪客進站時會自動開啟 ${autoOpen} 個視窗` } : { level: "warn", text: "沒有預設開啟的視窗，訪客需要自己點圖示" },
    missingAlt ? { level: "warn", text: `${missingAlt} 張圖片缺少說明文字（影響無障礙）` } : { level: "ok", text: "已上傳的圖片都有說明文字" },
    emptyLinks ? { level: "warn", text: `${emptyLinks} 個連結還沒設定目的地` } : { level: "ok", text: "所有連結都有目的地" },
    platformAsAudio ? { level: "warn", text: `${platformAsAudio} 首曲目的「音訊直連」其實是 YouTube／Spotify 等平台網頁，訪客無法在站內播放；請改成外部連結或平台播放器` } : { level: "ok", text: "音樂來源類型與網址相符" },
    uploadedAudioWithoutRights ? { level: "error", text: `${uploadedAudioWithoutRights} 首上傳音訊尚未填寫權利說明` } : { level: "ok", text: "上傳音訊都有權利說明" },
    { level: "ok", text: "手機版會自動排列圖示並以單視窗顯示" }
  ];
  if (!schema.success) {
    const first = schema.error.issues[0];
    checks.unshift({ level: "error", text: "內容格式有問題：" + (first?.path.length ? first.path.join(" → ") + " " : "") + (first?.message ?? "") });
  }
  return checks;
}

export const hasBlockingCheck = (checks: PublishCheck[]) => checks.some((check) => check.level === "error");
