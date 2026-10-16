import { z } from "zod";
import { AssetReferenceSchema } from "./asset-reference";

export const usernamePattern = /^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/;
export const reservedUsernames = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "help",
  "login",
  "logout",
  "retro",
  "settings",
  "signup",
  "support",
  "www"
]);

export const ImageUrlSchema = z.union([z.string().max(2048).refine((value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Unsupported image URL"), AssetReferenceSchema]);

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(20)
  .regex(usernamePattern, "Use lowercase letters, numbers, or hyphens")
  .refine((value) => !reservedUsernames.has(value), "This username is reserved");

export const ThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  wall: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  pattern: z.enum(["none", "dots", "checker", "stars", "image"]),
  patternColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  wallImage: ImageUrlSchema.nullable().optional(),
  face: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  light: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  shadow: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dark: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titleFrom: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titleTo: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  taskbar: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(["noto", "maru", "dot", "pixel"]),
  iconStyle: z.enum(["classic", "sticker", "tile"])
});

const DesktopLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().min(220).max(1400),
  h: z.number().min(140).max(1200),
  z: z.number().int().min(1).max(9999),
  iconX: z.number().finite().default(16),
  iconY: z.number().finite().default(16)
});

const MobileLayoutSchema = z.object({
  order: z.number().int().min(0).max(999)
});

export const WindowLayoutSchema = z.object({
  desktop: DesktopLayoutSchema,
  mobile: MobileLayoutSchema
});

export const SafeUrlSchema = z.string().max(2048).refine((value) => {
  // A bare scheme is what the editor pre-fills; treat it as "not filled in yet" (rendered as an inert link).
  if (value === "" || value === "https://" || value === "http://") return true;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}, "Unsupported URL protocol");

export const WebUrlSchema = z.string().max(2048).refine((value) => {
  if (value === "" || value === "https://" || value === "http://") return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, "Use an HTTP(S) web address");

export const HttpsAudioUrlSchema = z.string().max(2048).refine((value) => {
  if (value === "" || value === "https://") return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Audio URL must use HTTPS");

export const ImageCropSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  zoom: z.number().min(1).max(4)
});
export type ImageCrop = z.infer<typeof ImageCropSchema>;

const BaseBlockSchema = z.object({ id: z.string().min(1) });

export const DocumentBlockSchema = z.discriminatedUnion("kind", [
  BaseBlockSchema.extend({ kind: z.literal("heading"), text: z.string().max(500) }),
  BaseBlockSchema.extend({ kind: z.literal("text"), text: z.string().max(10_000), align: z.enum(["left", "center", "right"]).default("left"), bold: z.boolean().default(false), italic: z.boolean().default(false) }),
  BaseBlockSchema.extend({ kind: z.literal("image"), src: ImageUrlSchema.nullable(), srcUrl: z.string().max(2048).default(""), alt: z.string().max(300).default("") }),
  BaseBlockSchema.extend({ kind: z.literal("button"), text: z.string().max(200), url: SafeUrlSchema }),
  BaseBlockSchema.extend({ kind: z.literal("link"), text: z.string().max(500), url: SafeUrlSchema }),
  BaseBlockSchema.extend({ kind: z.literal("list"), text: z.string().max(10_000) }),
  BaseBlockSchema.extend({ kind: z.literal("divider") })
]);

export const GalleryImageSchema = z.object({
  id: z.string().min(1),
  src: ImageUrlSchema.nullable(),
  title: z.string().max(200),
  caption: z.string().max(1000),
  srcUrl: z.string().max(2048).default(""),
  href: SafeUrlSchema.default("")
});

export const LinkItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  icon: z.string().max(120).default("link"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  target: z.enum(["url", "window"]),
  url: SafeUrlSchema,
  windowId: z.string().max(120).default(""),
  iconUrl: z.string().max(2048).default("")
});

export const AboutFieldSchema = z.object({ id: z.string().min(1), key: z.string().max(100), value: z.string().max(500) });
export const SocialLinkSchema = z.object({ id: z.string().min(1), label: z.string().max(100), url: SafeUrlSchema });

export const IgCommentSchema = z.object({ id: z.string().min(1), user: z.string().max(64), text: z.string().max(1000) });
export const IgExtraImageSchema = z.object({ id: z.string().min(1), src: ImageUrlSchema.nullable(), srcUrl: z.string().max(2048).default("") });
export const IgPostSchema = GalleryImageSchema.extend({
  location: z.string().max(120).default(""),
  date: z.string().max(40).default(""),
  likes: z.number().int().min(0).max(1e9).default(0),
  comments: z.array(IgCommentSchema).max(200).default([]),
  extra: z.array(IgExtraImageSchema).max(9).default([])
});
export const IgHighlightSchema = z.object({ id: z.string().min(1), title: z.string().max(40), src: ImageUrlSchema.nullable(), srcUrl: z.string().max(2048).default("") });

export const MusicCharacterRefSchema = z.object({ siteId: z.string().trim().min(1).max(160), id: z.string().trim().min(1).max(160), kind: z.literal("profile") });
export const MusicSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("audioUrl"), url: HttpsAudioUrlSchema }),
  z.object({ kind: z.literal("uploadedAudio"), asset: z.union([AssetReferenceSchema, HttpsAudioUrlSchema]) }),
  z.object({ kind: z.literal("externalLink"), url: WebUrlSchema })
]);
export const MusicTrackSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().max(200),
  artist: z.string().max(200),
  cover: ImageUrlSchema.nullable(),
  coverUrl: z.string().max(2048).default(""),
  source: MusicSourceSchema,
  characterRef: MusicCharacterRefSchema.optional(),
  lyrics: z.string().max(20_000).default(""),
  rightsNote: z.string().max(1000).default("")
});
export const MusicPlaylistSchema = z.object({ id: z.string().min(1).max(160), title: z.string().max(200), trackIds: z.array(z.string().min(1).max(160)).max(100) });
export const MusicContentSchema = z.object({ tracks: z.array(MusicTrackSchema).max(100), playlist: MusicPlaylistSchema }).superRefine((content, ctx) => {
  const trackIds = new Set<string>();
  for (const [index, track] of content.tracks.entries()) {
    if (trackIds.has(track.id)) ctx.addIssue({ code: "custom", path: ["tracks", index, "id"], message: "Duplicate music track id" });
    trackIds.add(track.id);
  }
  const playlistIds = new Set<string>();
  for (const [index, trackId] of content.playlist.trackIds.entries()) {
    if (playlistIds.has(trackId)) ctx.addIssue({ code: "custom", path: ["playlist", "trackIds", index], message: "Duplicate playlist track id" });
    else if (!trackIds.has(trackId)) ctx.addIssue({ code: "custom", path: ["playlist", "trackIds", index], message: "Playlist references a missing track" });
    playlistIds.add(trackId);
  }
});

export const InstagramProfileSchema = z.object({
  username: z.string().max(64),
  avatar: ImageUrlSchema.nullable(),
  avatarCrop: ImageCropSchema.optional(),
  name: z.string().max(100),
  alt: z.string().max(100),
  bio: z.string().max(2000),
  followers: z.string().max(32),
  following: z.string().max(32),
  followedBy: z.string().max(300),
  avatarUrl: z.string().max(2048).default(""),
  linkLabel: z.string().max(120).default(""),
  linkUrl: SafeUrlSchema.default(""),
  dmUrl: SafeUrlSchema.default(""),
  verified: z.boolean().default(false),
  showCounts: z.boolean().default(true),
  showHighlights: z.boolean().default(true),
  showFollowedBy: z.boolean().default(true),
  showLikes: z.boolean().default(true),
  allowLikes: z.boolean().default(true),
  allowComments: z.boolean().default(true),
  highlights: z.array(IgHighlightSchema).max(20).default([])
});

export const WindowAppearanceSchema = z.object({
  titleFrom: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titleTo: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  titleGradient: z.boolean().default(true)
});

export const BaseWindowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  icon: z.string().min(1).max(500),
  layout: WindowLayoutSchema,
  defaultOpen: z.boolean(),
  appearance: WindowAppearanceSchema.optional()
});

export const DesktopWindowSchema = z.discriminatedUnion("type", [
  BaseWindowSchema.extend({
    type: z.literal("document"),
    content: z.object({ blocks: z.array(DocumentBlockSchema).max(100) })
  }),
  BaseWindowSchema.extend({
    type: z.literal("gallery"),
    content: z.object({ columns: z.number().int().min(1).max(5), images: z.array(GalleryImageSchema).max(200) })
  }),
  BaseWindowSchema.extend({
    type: z.literal("links"),
    content: z.object({ links: z.array(LinkItemSchema).max(100) })
  }),
  BaseWindowSchema.extend({
    type: z.literal("about"),
    content: z.object({
      avatar: ImageUrlSchema.nullable(),
      avatarCrop: ImageCropSchema.optional(),
      nickname: z.string().max(160),
      bio: z.string().max(5000),
      banner: z.string().max(500).default(""),
      quote: z.string().max(500).default(""),
      detailsTitle: z.string().max(100).default("File Details"),
      avatarUrl: z.string().max(2048).default(""),
      fields: z.array(AboutFieldSchema).max(50),
      socials: z.array(SocialLinkSchema).max(50)
    })
  }),
  BaseWindowSchema.extend({
    type: z.literal("instagram"),
    content: z.object({ skin: z.enum(["win98", "modern"]).default("win98"), profile: InstagramProfileSchema, images: z.array(IgPostSchema).max(60) })
  }),
  BaseWindowSchema.extend({
    type: z.literal("music"),
    content: MusicContentSchema
  })
]);

export const SiteDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  siteName: z.string().min(1).max(120),
  theme: ThemeSchema,
  windows: z.array(DesktopWindowSchema).max(100),
  mobileColumns: z.number().int().min(3).max(4).default(4)
});

export type RetroTheme = z.infer<typeof ThemeSchema>;
export type DesktopWindow = z.infer<typeof DesktopWindowSchema>;
export type SiteDocument = z.infer<typeof SiteDocumentSchema>;
export type DocumentBlock = z.infer<typeof DocumentBlockSchema>;

export const THEME_PRESETS: Record<string, RetroTheme> = {
  indigo: { id: "indigo", name: "靛藍名片", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c8c8c8", light: "#e6e6e6", shadow: "#858585", dark: "#0a0a0a", text: "#111111", titleFrom: "#2e1a7a", titleTo: "#2e1a7a", taskbar: "#c8c8c8", accent: "#5b3fd0", font: "noto", iconStyle: "classic" },
  whiteweb: { id: "whiteweb", name: "白色網路", wall: "#ffffff", pattern: "none", patternColor: "#eeeeee", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#0a0a0a", text: "#111111", titleFrom: "#0a0a6b", titleTo: "#0a0a6b", taskbar: "#c0c0c0", accent: "#0a0a6b", font: "dot", iconStyle: "classic" },
  midnight: { id: "midnight", name: "午夜星空", wall: "#1d1a3a", pattern: "stars", patternColor: "#4a4590", face: "#d8d4ea", light: "#eceaf5", shadow: "#8a84ad", dark: "#120f26", text: "#14112a", titleFrom: "#2a2470", titleTo: "#e05a9b", taskbar: "#d8d4ea", accent: "#c2185b", font: "dot", iconStyle: "classic" },
  classic98: {
    id: "classic98",
    name: "經典 98",
    wall: "#008080",
    pattern: "none",
    patternColor: "#0a8f8f",
    face: "#c0c0c0",
    light: "#dfdfdf",
    shadow: "#808080",
    dark: "#0a0a0a",
    text: "#111111",
    titleFrom: "#000080",
    titleTo: "#1084d0",
    taskbar: "#c0c0c0",
    accent: "#000080",
    font: "noto",
    iconStyle: "classic"
  },
  pink98: {
    id: "pink98",
    name: "粉紅 98",
    wall: "#f7b6cf",
    pattern: "dots",
    patternColor: "#fbd3e2",
    face: "#f4dde7",
    light: "#fbeef3",
    shadow: "#c9879f",
    dark: "#4a1d31",
    text: "#2a1420",
    titleFrom: "#c2185b",
    titleTo: "#f48fb1",
    taskbar: "#f4dde7",
    accent: "#d81b60",
    font: "noto",
    iconStyle: "sticker"
  },
  lavender: {
    id: "lavender",
    name: "薰衣草",
    wall: "#c9b8f0",
    pattern: "checker",
    patternColor: "#d6c9f5",
    face: "#e6def7",
    light: "#f3effc",
    shadow: "#9b88c9",
    dark: "#2c1f4d",
    text: "#1e1433",
    titleFrom: "#5b3fa8",
    titleTo: "#b39ddb",
    taskbar: "#e6def7",
    accent: "#5b3fa8",
    font: "maru",
    iconStyle: "sticker"
  },
  mint: {
    id: "mint",
    name: "薄荷汽水",
    wall: "#a8e0cf",
    pattern: "stars",
    patternColor: "#c4ecdf",
    face: "#dff2ea",
    light: "#f0faf6",
    shadow: "#7fb8a3",
    dark: "#173d31",
    text: "#10291f",
    titleFrom: "#1f7a5c",
    titleTo: "#7fd1b0",
    taskbar: "#dff2ea",
    accent: "#1f7a5c",
    font: "noto",
    iconStyle: "tile"
  }
};

const id = () => crypto.randomUUID();

export function makeWindow(type: DesktopWindow["type"], index = 0): DesktopWindow {
  const offset = (index % 6) * 28;
  const iconColumn = Math.floor(index / 7);
  const iconRow = index % 7;
  const layout = {
    desktop: {
      x: 130 + offset,
      y: 24 + offset,
      w: 380,
      h: 320,
      z: index + 1,
      iconX: 16 + iconColumn * 88,
      iconY: 18 + iconRow * 78
    },
    mobile: { order: index }
  };

  switch (type) {
    case "gallery":
      return {
        id: id(), type, title: "相簿", icon: "photo", layout: { ...layout, desktop: { ...layout.desktop, w: 420, h: 360 } }, defaultOpen: true,
        content: { columns: 3, images: [] }
      };
    case "links":
      return {
        id: id(), type, title: "連結", icon: "link", layout: { ...layout, desktop: { ...layout.desktop, w: 300, h: 300 } }, defaultOpen: true,
        content: { links: [{ id: id(), label: "Instagram", icon: "heart", color: "#000080", target: "url", url: "https://instagram.com/", windowId: "", iconUrl: "" }] }
      };
    case "about":
      return {
        id: id(), type, title: "關於我", icon: "user", layout: { ...layout, desktop: { ...layout.desktop, w: 340, h: 400 } }, defaultOpen: true,
        content: { avatar: null, nickname: "你的名字", bio: "寫一點關於你的介紹。", banner: "", quote: "", detailsTitle: "File Details", avatarUrl: "", fields: [], socials: [] }
      };
    case "instagram":
      return {
        id: id(), type, title: "Instagram.exe", icon: "camera", layout: { ...layout, desktop: { ...layout.desktop, w: 420, h: 560 } }, defaultOpen: true,
        content: { skin: "win98", profile: { username: "retro", avatar: null, name: "Retro User", alt: "", bio: "", followers: "0", following: "0", followedBy: "", avatarUrl: "", linkLabel: "", linkUrl: "", dmUrl: "", verified: false, showCounts: true, showHighlights: true, showFollowedBy: true, showLikes: true, allowLikes: true, allowComments: true, highlights: [] }, images: [] }
      };
    case "music": {
      const playlistId = id();
      return {
        id: id(), type, title: "Music Player.exe", icon: "music", layout: { ...layout, desktop: { ...layout.desktop, w: 390, h: 430 } }, defaultOpen: true,
        content: { tracks: [], playlist: { id: playlistId, title: "我的播放清單", trackIds: [] } }
      };
    }
    default:
      return {
        id: id(), type: "document", title: "新文件.txt", icon: "doc", layout, defaultOpen: true,
        content: {
          blocks: [
            { id: id(), kind: "heading", text: "哈囉，歡迎光臨！" },
            { id: id(), kind: "text", text: "這是一個文件視窗。", align: "left", bold: false, italic: false },
            { id: id(), kind: "button", text: "打聲招呼", url: "mailto:hello@example.com" }
          ]
        }
      };
  }
}

export type StarterTemplate = "blank" | "card" | "oc" | "portfolio" | "instagram";

const TEMPLATE_WINDOWS: Record<StarterTemplate, DesktopWindow["type"][]> = {
  blank: [],
  card: ["about", "links"],
  oc: ["about", "gallery", "document"],
  portfolio: ["about", "gallery", "links"],
  instagram: ["instagram", "links"]
};

export function createStarterDocument(siteName: string, themeId = "classic98", template: StarterTemplate = "card"): SiteDocument {
  const theme = THEME_PRESETS[themeId] ?? THEME_PRESETS.classic98;
  return {
    schemaVersion: 1,
    siteName,
    theme,
    windows: TEMPLATE_WINDOWS[template].map((type, index) => makeWindow(type, index)),
    mobileColumns: 4
  };
}

/**
 * Parses a stored document, applying defaults for fields added after it was saved.
 * Falls back to the raw value if it no longer validates, so the editor can still show and repair it.
 */
export function normalizeDocument(raw: unknown): SiteDocument {
  const parsed = SiteDocumentSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as SiteDocument);
}

// ---- Factories: build new content items with every default filled in ----
const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export type DocumentBlockKind = DocumentBlock["kind"];

export function makeBlock(kind: DocumentBlockKind): DocumentBlock {
  const id = newId();
  switch (kind) {
    case "heading": return { id, kind, text: "標題" };
    case "text": return { id, kind, text: "", align: "left", bold: false, italic: false };
    case "image": return { id, kind, src: null, srcUrl: "", alt: "" };
    case "button": return { id, kind, text: "按鈕", url: "" };
    case "link": return { id, kind, text: "連結文字", url: "" };
    case "list": return { id, kind, text: "項目一\n項目二" };
    case "divider": return { id, kind };
  }
}

export type GalleryImage = Extract<DesktopWindow, { type: "gallery" }>["content"]["images"][number];
export type LinkItem = Extract<DesktopWindow, { type: "links" }>["content"]["links"][number];
export type IgPost = Extract<DesktopWindow, { type: "instagram" }>["content"]["images"][number];
export type IgComment = IgPost["comments"][number];
export type IgHighlight = Extract<DesktopWindow, { type: "instagram" }>["content"]["profile"]["highlights"][number];
export type MusicTrack = z.infer<typeof MusicTrackSchema>;
export type MusicPlaylist = z.infer<typeof MusicPlaylistSchema>;

export function makeGalleryImage(init: Partial<GalleryImage> = {}): GalleryImage {
  return { id: newId(), src: null, title: "", caption: "", srcUrl: "", href: "", ...init };
}

export function makeLink(init: Partial<LinkItem> = {}): LinkItem {
  return { id: newId(), label: "新連結", icon: "link", color: "#000080", target: "url", url: "", windowId: "", iconUrl: "", ...init };
}

export function makeIgPost(init: Partial<IgPost> = {}): IgPost {
  return { ...makeGalleryImage(), location: "", date: "", likes: 0, comments: [], extra: [], ...init };
}

export function makeIgHighlight(init: Partial<IgHighlight> = {}): IgHighlight {
  return { id: newId(), title: "精選", src: null, srcUrl: "", ...init };
}

export function makeIgComment(user: string, text: string): IgComment {
  return { id: newId(), user, text };
}
