import {
  createStarterDocument, makeBlock, makeGalleryImage, makeIgComment, makeIgHighlight, makeIgPost, makeLink, makeWindow,
  type DesktopWindow, type SiteDocument, type StarterTemplate
} from "./site";

export type DemoKind = "card" | "ig" | "oc" | "portfolio";

// Public-domain / CC0 demonstration media. Sources and authors: docs/DEMO_MEDIA.md.
// Pinned self-hosted copies: no visitor image requests to Wikimedia. Not MIT-licensed Retro artwork.
const DEMO_MEDIA_PATHS = {
  cat: "/demo-assets/commons/cat.jpg",
  heart: "/demo-assets/commons/heart.png",
  house: "/demo-assets/commons/house.png",
  kenney: "/demo-assets/commons/kenney.svg",
  moon: "/demo-assets/commons/moon.jpg",
  books: "/demo-assets/commons/books.jpg",
  stars: "/demo-assets/commons/stars.jpg",
  typewriter: "/demo-assets/commons/typewriter.jpg",
  coffee: "/demo-assets/commons/coffee.jpg",
  neon: "/demo-assets/commons/neon.jpg",
  architecture: "/demo-assets/commons/architecture.jpg",
  camera: "/demo-assets/commons/camera.jpg",
  notebook: "/demo-assets/commons/notebook.jpg",
  flowers: "/demo-assets/commons/flowers.jpg",
} as const;
const DEMO_SOURCES = {
  cat: "https://commons.wikimedia.org/wiki/File:Green-eyed_white_cat_looking_at_camera.jpg",
  house: "https://commons.wikimedia.org/wiki/File:House_Pixel_icon.png",
  moon: "https://commons.wikimedia.org/wiki/File:Photo_of_Moon.jpg",
  neon: "https://commons.wikimedia.org/wiki/File:Neon_Sign.jpg",
  kenney: "https://commons.wikimedia.org/wiki/File:Kenney.nl_platformer_characters_-_player_vector.svg",
} as const;

// Display two different visual references per example, rather than four identical gray placeholders.
export const DEMO_PREVIEW_IMAGES: Record<DemoKind, readonly [string, string]> = {
  card: [DEMO_MEDIA_PATHS.cat, DEMO_MEDIA_PATHS.flowers],
  ig: [DEMO_MEDIA_PATHS.house, DEMO_MEDIA_PATHS.kenney],
  oc: [DEMO_MEDIA_PATHS.moon, DEMO_MEDIA_PATHS.books],
  portfolio: [DEMO_MEDIA_PATHS.neon, DEMO_MEDIA_PATHS.architecture]
};


export const DEMO_EXAMPLES: Array<{ kind: DemoKind; theme: string; name: string; desc: string }> = [
  { kind: "card", theme: "indigo", name: "電子名片 — Mochi", desc: "檔案欄位、簡介、社群選單與橫幅。" },
  { kind: "ig", theme: "whiteweb", name: "復古 IG — pixel 日記", desc: "追蹤數、簡介與貼文格狀，像 2000 年的 IG。" },
  { kind: "oc", theme: "midnight", name: "OC 展示頁 — 月面圖書館", desc: "角色檔案、設定圖相簿和世界觀文件。" },
  { kind: "portfolio", theme: "mint", name: "作品集 — Ren", desc: "自我介紹、作品網格與聯絡方式。" }
];

function place(window: DesktopWindow, x: number, y: number, w: number, h: number, z: number, order: number, iconRow: number): DesktopWindow {
  return { ...window, layout: { desktop: { x, y, w, h, z, iconX: 8, iconY: 10 + iconRow * 94 }, mobile: { order } } };
}

function aboutWindow(nickname: string, bio: string, fields: Array<[string, string]>, banner: string, avatar: string): DesktopWindow {
  const base = makeWindow("about", 0);
  if (base.type !== "about") throw new Error("unreachable");
  return {
    ...base, title: "關於我.exe",
    content: {
      ...base.content, avatar, avatarUrl: avatar, nickname, bio, banner, quote: "慢慢來，比較快。",
      fields: fields.map(([key, value], index) => ({ id: "f" + index, key, value })),
      socials: [] // Fictional examples have no real social accounts; never link to platform homepages.
    }
  };
}

/** Read-only fictional examples. Each image is an actual CC0/public-domain reference, not an authored OC or client portfolio work. */
export function createDemoDocument(kind: DemoKind): SiteDocument {
  // Saved-document image fields require absolute HTTP(S) URLs. Resolve these built-in
  // paths against the current deployment, not a hard-coded production hostname.
  // The localhost fallback keeps non-browser consumers and unit tests deterministic.
  const origin = typeof location === "undefined" ? "http://localhost" : location.origin;
  const DEMO_MEDIA = Object.fromEntries(Object.entries(DEMO_MEDIA_PATHS).map(([key, path]) => [key, new URL(path, origin).href])) as Record<keyof typeof DEMO_MEDIA_PATHS, string>;
  const example = DEMO_EXAMPLES.find((item) => item.kind === kind)!;
  const base = createStarterDocument(example.name.split(" — ")[0], example.theme, "blank");

  if (kind === "card") {
    const links = makeWindow("links", 1);
    if (links.type === "links") links.content.links = [makeLink({ label: "貓咪照片來源（CC0）", icon: "image", url: DEMO_SOURCES.cat }), makeLink({ label: "Retro 原始碼", icon: "folder", color: "#5b3fa8", url: "https://github.com/laiw54724-ui/retro" })];
    return { ...base, windows: [place(aboutWindow("Mochi 麻糬", "插畫師、貓奴。\n接商稿、做小周邊。", [["職業", "插畫師"], ["所在地", "Taipei"], ["最愛", "牛奶糖"]], "OPEN FOR COMMISSION", DEMO_MEDIA.cat), 130, 30, 420, 420, 1, 0, 0), place({ ...links, title: "連結.exe" }, 580, 60, 300, 260, 2, 1, 1)] };
  }
  if (kind === "ig") {
    const ig = makeWindow("instagram", 0);
    if (ig.type === "instagram") {
      ig.title = "pixel_diary";
      ig.content.profile = { ...ig.content.profile, username: "pixel_diary", name: "Pixel 日記", alt: "（畫畫中）", bio: "每天一張像素小圖\n歡迎留言聊聊", followers: "1280", following: "86", followedBy: "followed by neko_ren and 12 others", avatar: DEMO_MEDIA.house, avatarUrl: DEMO_MEDIA.house, linkLabel: "像素圖來源 · Commons", linkUrl: DEMO_SOURCES.house, verified: false, highlights: [makeIgHighlight({ title: "日常", src: DEMO_MEDIA.house, srcUrl: DEMO_MEDIA.house }), makeIgHighlight({ title: "作品", src: DEMO_MEDIA.heart, srcUrl: DEMO_MEDIA.heart })] };
      ig.content.images = [
        makeIgPost({ src: DEMO_MEDIA.house, srcUrl: DEMO_MEDIA.house, title: "House pixel icon", caption: "像素圖來源 · Commons", location: "", date: "10月3日", likes: 128, comments: [makeIgComment("neko_ren", "好漂亮！"), makeIgComment("mochi", "喜歡這個配色")] }),
        makeIgPost({ src: DEMO_MEDIA.kenney, srcUrl: DEMO_MEDIA.kenney, title: "CC0 character sprite sheet", caption: "新的像素角色設定。", date: "10月1日", likes: 64 }),
        makeIgPost({ src: DEMO_MEDIA.heart, srcUrl: DEMO_MEDIA.heart, title: "Pixel heart", caption: "週末塗鴉。", date: "9月28日", likes: 40 })
      ];
    }
    return { ...base, windows: [place(ig, 120, 16, 420, 640, 1, 0, 0)] };
  }
  if (kind === "oc") {
    const gallery = makeWindow("gallery", 1);
    if (gallery.type === "gallery") gallery.content = { columns: 3, images: (["月面", "館藏", "星空", "手稿", "夜燈", "咖啡"] as const).map((title, i) => makeGalleryImage({ title, src: [DEMO_MEDIA.moon, DEMO_MEDIA.books, DEMO_MEDIA.stars, DEMO_MEDIA.typewriter, DEMO_MEDIA.neon, DEMO_MEDIA.coffee][i], alt: `月面圖書館的${title}氛圍參考`, caption: `${title} · CC0 氛圍參考素材（非角色原畫）` })) };
    const doc = makeWindow("document", 2);
    if (doc.type === "document") doc.content.blocks = [{ ...makeBlock("heading"), text: "世界觀" } as never, { ...makeBlock("text"), text: "月面圖書館收藏著所有被遺忘的故事。館員只在滿月時醒來。" } as never, { ...makeBlock("button"), text: "月球影像來源（CC0）", url: DEMO_SOURCES.moon } as never];
    return { ...base, windows: [place(aboutWindow("Luna", "月面圖書館的館員。\n看起來很兇，其實很怕黑。", [["年齡", "不明"], ["身高", "158cm"], ["喜歡", "舊書與紅茶"]], "OC · MOON LIBRARY", DEMO_MEDIA.moon), 30, 24, 380, 400, 1, 0, 0), place({ ...gallery, title: "設定圖" }, 300, 70, 420, 360, 2, 1, 1), place({ ...doc, title: "世界觀.txt" }, 560, 30, 340, 300, 3, 2, 2)] };
  }
  const gallery = makeWindow("gallery", 1);
  if (gallery.type === "gallery") gallery.content = { columns: 3, images: (["Logo", "Poster", "Web", "App", "Zine", "Photo"] as const).map((title, i) => makeGalleryImage({ title, src: [DEMO_MEDIA.neon, DEMO_MEDIA.architecture, DEMO_MEDIA.camera, DEMO_MEDIA.notebook, DEMO_MEDIA.typewriter, DEMO_MEDIA.coffee][i], alt: `Ren ${title} 主題的授權攝影參考`, caption: `${title} · CC0 素材展示（非實際客戶作品）` })) };
  const links = makeWindow("links", 2);
  if (links.type === "links") links.content.links = [makeLink({ label: "霓虹攝影來源（CC0）", icon: "image", url: DEMO_SOURCES.neon }), makeLink({ label: "Retro 原始碼", icon: "folder", color: "#1f7a5c", url: "https://github.com/laiw54724-ui/retro" })];
  return { ...base, windows: [place(aboutWindow("Ren", "平面設計師，喜歡把東西做得小小的。", [["專長", "品牌 / 插畫"], ["接案", "開放中"]], "", DEMO_MEDIA.camera), 30, 24, 360, 380, 1, 0, 0), place({ ...gallery, title: "作品.exe" }, 330, 60, 440, 380, 2, 1, 1), place({ ...links, title: "聯絡.exe" }, 640, 40, 280, 240, 3, 2, 2)] };
}

export function createTemplateDocument(siteName: string, themeId: string, template: StarterTemplate | "ig"): SiteDocument {
  if (template === "ig") {
    const document = createStarterDocument(siteName, themeId, "instagram");
    return document;
  }
  return createStarterDocument(siteName, themeId, template);
}
