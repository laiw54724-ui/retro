import { i18n } from "./index";

/**
 * New windows and the starter/demo templates are created from Traditional Chinese defaults in the shared package.
 * Right after creation, text that still equals one of those exact defaults is replaced by the current UI language.
 * The result is ordinary authored content: it is never re-translated on a later language switch, and anything the
 * author has already changed is left untouched.
 */
const DEFAULTS: Readonly<Record<string, string>> = {
  "歡迎留下訊息。新留言會先交由站長審核。": "defaults.leaveAMessageNew",
  "圖片": "defaults.image",
  "相簿": "defaults.gallery",
  "連結": "defaults.links",
  "關於我": "defaults.aboutMe",
  "你的名字": "defaults.yourName",
  "寫一點關於你的介紹。": "defaults.writeALittleAbout",
  "我的播放清單": "defaults.myPlaylist",
  "我的角色": "defaults.myCharacter",
  "嗨！歡迎來到我的桌面。": "defaults.hiWelcomeToMy",
  "新文件.txt": "defaults.newDocumentTxt",
  "哈囉，歡迎光臨！": "defaults.helloWelcome",
  "這是一個文件視窗。": "defaults.thisIsADocument",
  "打聲招呼": "defaults.sayHello",
  "電子名片 — Mochi": "defaults.digitalCardMochi",
  "檔案欄位、簡介、社群選單與橫幅。": "defaults.profileFieldsBioSocial",
  "復古 IG — pixel 日記": "defaults.retroIgPixelDiary",
  "追蹤數、簡介與貼文格狀，像 2000 年的 IG。": "defaults.followerCountsBioAnd",
  "OC 展示頁 — 月面圖書館": "defaults.ocShowcaseMoonLibrary",
  "角色檔案、設定圖相簿和世界觀文件。": "defaults.characterProfileConceptArt",
  "作品集 — Ren": "defaults.portfolioRen",
  "自我介紹、作品網格與聯絡方式。": "defaults.introductionAGridOf",
  "關於我.exe": "defaults.aboutMeExe",
  "慢慢來，比較快。": "defaults.slowAndSteadyWins",
  "合作邀約": "defaults.workWithMe",
  "Mochi 麻糬": "defaults.mochi",
  "插畫師、貓奴。\n接商稿、做小周邊。": "defaults.illustratorAndCatServant",
  "職業": "defaults.occupation",
  "插畫師": "defaults.illustrator",
  "所在地": "defaults.location",
  "最愛": "defaults.favorite",
  "牛奶糖": "defaults.milkCandy",
  "連結.exe": "defaults.linksExe",
  "Pixel 日記": "defaults.pixelDiary",
  "（畫畫中）": "defaults.drawing",
  "每天一張像素小圖\n歡迎留言聊聊": "defaults.oneSmallPixelPicture",
  "日常": "defaults.dailyLife",
  "作品": "defaults.work",
  "今天的夕陽。": "defaults.todaysSunset",
  "淡水": "defaults.tamsui",
  "10月3日": "defaults.oct3",
  "好漂亮！": "defaults.soPretty",
  "喜歡這個配色": "defaults.loveThisColorScheme",
  "新的像素角色設定。": "defaults.aNewPixelCharacter",
  "10月1日": "defaults.oct1",
  "週末塗鴉。": "defaults.weekendDoodle",
  "9月28日": "defaults.sep28",
  "正面": "defaults.front",
  "側面": "defaults.side",
  "表情": "defaults.expressions",
  "服裝": "defaults.outfit",
  "武器": "defaults.weapon",
  "場景": "defaults.scene",
  "世界觀": "defaults.world",
  "月面圖書館收藏著所有被遺忘的故事。館員只在滿月時醒來。": "defaults.theMoonLibraryKeeps",
  "角色設定集": "defaults.characterSettings",
  "月面圖書館的館員。\n看起來很兇，其實很怕黑。": "defaults.aLibrarianOfThe",
  "年齡": "defaults.age",
  "不明": "defaults.unknown",
  "身高": "defaults.height",
  "喜歡": "defaults.likes",
  "舊書與紅茶": "defaults.oldBooksAndBlack",
  "設定圖": "defaults.conceptArt",
  "世界觀.txt": "defaults.worldTxt",
  "平面設計師，喜歡把東西做得小小的。": "defaults.graphicDesignerWhoLikes",
  "專長": "defaults.specialties",
  "品牌 / 插畫": "defaults.brandingIllustration",
  "接案": "defaults.freelance",
  "開放中": "defaults.open",
  "作品.exe": "defaults.workExe",
  "聯絡.exe": "defaults.contactExe",
};

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^設定圖：(.+)$/s, "defaults.captionConceptArt"],
  [/^作品：(.+)$/s, "defaults.captionWork"],
];

const tx = (key: string, options?: Record<string, unknown>) => String(i18n.t(`editor:${key}` as never, options as never));

export function localizeDefaultText(value: string): string {
  const exact = DEFAULTS[value];
  if (exact) return tx(exact);
  for (const [pattern, key] of PATTERNS) {
    const match = pattern.exec(value);
    if (match) return tx(key, { title: localizeDefaultText(match[1]) });
  }
  return value;
}

/** Walks a window or document and localizes every untouched default string. Returns a new value. */
export function localizeDefaults<T>(value: T): T {
  if (typeof value === "string") return localizeDefaultText(value) as T;
  if (Array.isArray(value)) return value.map(localizeDefaults) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeDefaults(item)])) as T;
  return value;
}

export const DEFAULT_TEXT_KEYS: readonly string[] = [...Object.values(DEFAULTS), ...PATTERNS.map(([, key]) => key)];

const SITE_NAME_SENTINEL = "__RETRO_SITE_NAME_9f3a__";

function substituteDeep<T>(value: T, from: string, to: string): T {
  if (typeof value === "string") return value.split(from).join(to) as T;
  if (Array.isArray(value)) return value.map((item) => substituteDeep(item, from, to)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteDeep(item, from, to)])) as T;
  return value;
}

/**
 * Builds a new document and localizes its built-in default text, while the author's own site name is carried through
 * verbatim: the name is built in as a placeholder, so it can never be mistaken for (or rewritten as) a default string.
 */
export function createLocalizedDocument<T>(siteName: string, create: (name: string) => T): T {
  return substituteDeep(localizeDefaults(create(SITE_NAME_SENTINEL)), SITE_NAME_SENTINEL, siteName);
}
