import { i18n } from "./index";

/**
 * The shared package (publish checks, image-link validation, content operations) returns Traditional Chinese text.
 * The UI translates those known messages by their exact wording; anything else (for example a schema message) is shown as received.
 */
const EXACT: Readonly<Record<string, string>> = {
  "桌面上還沒有任何視窗": "publish.noWindows",
  "每個視窗都有標題": "publish.allTitled",
  "沒有預設開啟的視窗，訪客需要自己點圖示": "publish.noAutoOpen",
  "已上傳的圖片都有說明文字": "publish.allAlt",
  "所有連結都有目的地": "publish.allLinks",
  "音樂來源類型與網址相符": "publish.musicOk",
  "上傳音訊都有權利說明": "publish.allRights",
  "手機版會自動排列圖示並以單視窗顯示": "publish.mobileAuto",
  "請貼上圖片連結。": "imageUrl.empty",
  "連結太長。": "imageUrl.tooLong",
  "這不是有效的網址。": "imageUrl.invalid",
  "只支援 https:// 開頭的連結。": "imageUrl.httpsOnly",
  "請貼上圖片檔案的連結，不是資料夾。": "imageUrl.folder",
  "無法辨識這個 Google 雲端連結，請使用檔案的「共用」連結。": "imageUrl.driveUnknown",
  "角色不能追蹤自己。": "ops.selfFollow",
  "找不到同網站角色。": "ops.sameSiteProfileMissing",
  "追蹤 ID 已存在。": "ops.followIdExists",
  "角色已追蹤。": "ops.alreadyFollowing",
  "找不到追蹤關係。": "ops.followMissing",
  "找不到角色。": "ops.profileMissing",
  "找不到貼文。": "ops.postMissing",
  "喜歡者必須是同網站角色。": "ops.likersMustBeProfiles",
  "留言作者必須是同網站角色。": "ops.commentAuthorMustBeProfile",
  "留言 ID 已存在。": "ops.commentIdExists",
  "找不到留言。": "ops.commentMissing",
  "內容不屬於目前網站。": "ops.notThisSite",
  "內容更新後的網站資料無效。": "ops.siteDataInvalidAfterUpdate",
  "貼文 ID 已存在。": "ops.postIdExists",
  "找不到貼文作者。": "ops.postAuthorMissing",
  "圖片 ID 已存在。": "ops.mediaIdExists",
  "每則貼文最多 10 張圖片。": "ops.maxPostImages",
  "找不到集合。": "ops.collectionMissing",
  "貼文不屬於目前網站。": "ops.postNotThisSite",
  "貼文擁有者與集合不符。": "ops.postOwnerMismatch",
  "集合 ID 已存在。": "ops.collectionIdExists",
  "找不到集合擁有者。": "ops.collectionOwnerMissing",
  "精選更新後的網站資料無效。": "ops.highlightDataInvalid",
  "精選 ID 已存在。": "ops.highlightIdExists",
  "找不到精選擁有者。": "ops.highlightOwnerMissing",
  "找不到精選。": "ops.highlightMissing",
  "每個精選最多 50 個畫面。": "ops.maxHighlightFrames",
  "畫面 ID 已存在。": "ops.frameIdExists",
  "找不到畫面。": "ops.frameMissing",
};

const COUNTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/^共 (\d+) 個視窗$/, "publish.windowCount"],
  [/^(\d+) 個視窗沒有標題$/, "publish.untitled"],
  [/^訪客進站時會自動開啟 (\d+) 個視窗$/, "publish.autoOpen"],
  [/^(\d+) 張圖片缺少說明文字（影響無障礙）$/, "publish.missingAlt"],
  [/^(\d+) 個連結還沒設定目的地$/, "publish.emptyLinks"],
  [/^(\d+) 首曲目的「音訊直連」其實是 .*$/, "publish.platformAsAudio"],
  [/^(\d+) 首上傳音訊尚未填寫權利說明$/, "publish.audioNoRights"],
];

const FORMAT_PROBLEM = "內容格式有問題：";

/** Keys are validated by systemMessages.test.ts against every locale. */
const translate = (key: string, options?: Record<string, unknown>) => String(i18n.t(`common:systemMessages.${key}` as never, options as never));

export function translateSystemMessage(text: string): string {
  const exact = EXACT[text];
  if (exact) return translate(exact);
  for (const [pattern, key] of COUNTED) {
    const match = pattern.exec(text);
    if (match) return translate(key, { count: Number(match[1]) });
  }
  if (text.startsWith(FORMAT_PROBLEM)) return translate("publish.formatProblem") + text.slice(FORMAT_PROBLEM.length);
  return text;
}

export const SYSTEM_MESSAGE_KEYS: readonly string[] = [...Object.values(EXACT), ...COUNTED.map(([, key]) => key), "publish.formatProblem"];
