import {
  createStarterDocument, makeBlock, makeGalleryImage, makeIgComment, makeIgHighlight, makeIgPost, makeLink, makeWindow,
  type DesktopWindow, type SiteDocument, type StarterTemplate
} from "./site";

export type DemoKind = "card" | "ig" | "oc" | "portfolio";

export const DEMO_EXAMPLES: Array<{ kind: DemoKind; theme: string; name: string; desc: string }> = [
  { kind: "card", theme: "indigo", name: "電子名片 — Mochi", desc: "檔案欄位、簡介、社群選單與橫幅。" },
  { kind: "ig", theme: "whiteweb", name: "復古 IG — pixel 日記", desc: "追蹤數、簡介與貼文格狀，像 2000 年的 IG。" },
  { kind: "oc", theme: "midnight", name: "OC 展示頁 — 月面圖書館", desc: "角色檔案、設定圖相簿和世界觀文件。" },
  { kind: "portfolio", theme: "mint", name: "作品集 — Ren", desc: "自我介紹、作品網格與聯絡方式。" }
];

function place(window: DesktopWindow, x: number, y: number, w: number, h: number, z: number, order: number, iconRow: number): DesktopWindow {
  return { ...window, layout: { desktop: { x, y, w, h, z, iconX: 8, iconY: 10 + iconRow * 94 }, mobile: { order } } };
}

function aboutWindow(nickname: string, bio: string, fields: Array<[string, string]>, banner: string): DesktopWindow {
  const base = makeWindow("about", 0);
  if (base.type !== "about") throw new Error("unreachable");
  return {
    ...base, title: "關於我.exe",
    content: {
      ...base.content, nickname, bio, banner, quote: "慢慢來，比較快。",
      fields: fields.map(([key, value], index) => ({ id: "f" + index, key, value })),
      socials: [{ id: "s1", label: "Instagram", url: "https://instagram.com/" }, { id: "s2", label: "Twitter", url: "https://x.com/" }]
    }
  };
}

/** Sample desktops used by the landing page. They only use placeholder images. */
export function createDemoDocument(kind: DemoKind): SiteDocument {
  const example = DEMO_EXAMPLES.find((item) => item.kind === kind)!;
  const base = createStarterDocument(example.name.split(" — ")[0], example.theme, "blank");

  if (kind === "card") {
    const links = makeWindow("links", 1);
    if (links.type === "links") links.content.links = [makeLink({ label: "Instagram", icon: "heart", url: "https://instagram.com/" }), makeLink({ label: "合作邀約", icon: "mail", color: "#5b3fa8", url: "mailto:hello@example.com" })];
    return { ...base, windows: [place(aboutWindow("Mochi 麻糬", "插畫師、貓奴。\n接商稿、做小周邊。", [["職業", "插畫師"], ["所在地", "Taipei"], ["最愛", "牛奶糖"]], "OPEN FOR COMMISSION"), 130, 30, 420, 420, 1, 0, 0), place({ ...links, title: "連結.exe" }, 580, 60, 300, 260, 2, 1, 1)] };
  }
  if (kind === "ig") {
    const ig = makeWindow("instagram", 0);
    if (ig.type === "instagram") {
      ig.title = "pixel_diary";
      ig.content.profile = { ...ig.content.profile, username: "pixel_diary", name: "Pixel 日記", alt: "（畫畫中）", bio: "每天一張像素小圖\n歡迎留言聊聊", followers: "1280", following: "86", followedBy: "followed by neko_ren and 12 others", linkLabel: "retrodesk.me/pixel", linkUrl: "https://example.com", verified: true, highlights: [makeIgHighlight({ title: "日常" }), makeIgHighlight({ title: "作品" })] };
      ig.content.images = [
        makeIgPost({ caption: "今天的夕陽。", location: "淡水", date: "10月3日", likes: 128, comments: [makeIgComment("neko_ren", "好漂亮！"), makeIgComment("mochi", "喜歡這個配色")] }),
        makeIgPost({ caption: "新的像素角色設定。", date: "10月1日", likes: 64 }),
        makeIgPost({ caption: "週末塗鴉。", date: "9月28日", likes: 40 })
      ];
    }
    return { ...base, windows: [place(ig, 120, 16, 420, 640, 1, 0, 0)] };
  }
  if (kind === "oc") {
    const gallery = makeWindow("gallery", 1);
    if (gallery.type === "gallery") gallery.content = { columns: 3, images: ["正面", "側面", "表情", "服裝", "武器", "場景"].map((title) => makeGalleryImage({ title, caption: `設定圖：${title}` })) };
    const doc = makeWindow("document", 2);
    if (doc.type === "document") doc.content.blocks = [{ ...makeBlock("heading"), text: "世界觀" } as never, { ...makeBlock("text"), text: "月面圖書館收藏著所有被遺忘的故事。館員只在滿月時醒來。" } as never, { ...makeBlock("button"), text: "角色設定集", url: "https://example.com" } as never];
    return { ...base, windows: [place(aboutWindow("Luna", "月面圖書館的館員。\n看起來很兇，其實很怕黑。", [["年齡", "不明"], ["身高", "158cm"], ["喜歡", "舊書與紅茶"]], "OC · MOON LIBRARY"), 30, 24, 380, 400, 1, 0, 0), place({ ...gallery, title: "設定圖" }, 300, 70, 420, 360, 2, 1, 1), place({ ...doc, title: "世界觀.txt" }, 560, 30, 340, 300, 3, 2, 2)] };
  }
  const gallery = makeWindow("gallery", 1);
  if (gallery.type === "gallery") gallery.content = { columns: 3, images: ["Logo", "Poster", "Web", "App", "Zine", "Photo"].map((title) => makeGalleryImage({ title, caption: `作品：${title}` })) };
  const links = makeWindow("links", 2);
  if (links.type === "links") links.content.links = [makeLink({ label: "Behance", icon: "star", url: "https://behance.net/" }), makeLink({ label: "Email", icon: "mail", color: "#1f7a5c", url: "mailto:ren@example.com" })];
  return { ...base, windows: [place(aboutWindow("Ren", "平面設計師，喜歡把東西做得小小的。", [["專長", "品牌 / 插畫"], ["接案", "開放中"]], ""), 30, 24, 360, 380, 1, 0, 0), place({ ...gallery, title: "作品.exe" }, 330, 60, 440, 380, 2, 1, 1), place({ ...links, title: "聯絡.exe" }, 640, 40, 280, 240, 3, 2, 2)] };
}

export function createTemplateDocument(siteName: string, themeId: string, template: StarterTemplate | "ig"): SiteDocument {
  if (template === "ig") {
    const document = createStarterDocument(siteName, themeId, "instagram");
    return document;
  }
  return createStarterDocument(siteName, themeId, template);
}
