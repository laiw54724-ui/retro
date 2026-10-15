import { z } from "zod";

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
  wallImage: z.string().url().nullable().optional(),
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
  z: z.number().int().min(1).max(9999)
});

const MobileLayoutSchema = z.object({
  order: z.number().int().min(0).max(999)
});

export const WindowLayoutSchema = z.object({
  desktop: DesktopLayoutSchema,
  mobile: MobileLayoutSchema
});

const SafeUrlSchema = z.string().max(2048).refine((value) => {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}, "Unsupported URL protocol");

const BaseBlockSchema = z.object({ id: z.string().min(1) });

export const DocumentBlockSchema = z.discriminatedUnion("kind", [
  BaseBlockSchema.extend({ kind: z.literal("heading"), text: z.string().max(500) }),
  BaseBlockSchema.extend({ kind: z.literal("text"), text: z.string().max(10_000), align: z.enum(["left", "center", "right"]).default("left") }),
  BaseBlockSchema.extend({ kind: z.literal("image"), src: z.string().url().nullable(), alt: z.string().max(300).default("") }),
  BaseBlockSchema.extend({ kind: z.literal("button"), text: z.string().max(200), url: SafeUrlSchema }),
  BaseBlockSchema.extend({ kind: z.literal("link"), text: z.string().max(500), url: SafeUrlSchema }),
  BaseBlockSchema.extend({ kind: z.literal("list"), text: z.string().max(10_000) }),
  BaseBlockSchema.extend({ kind: z.literal("divider") })
]);

const GalleryImageSchema = z.object({
  id: z.string().min(1),
  src: z.string().url().nullable(),
  title: z.string().max(200),
  caption: z.string().max(1000)
});

const LinkItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  icon: z.string().max(120).default("link"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  target: z.enum(["url", "window"]),
  url: SafeUrlSchema,
  windowId: z.string().max(120).default("")
});

const AboutFieldSchema = z.object({ id: z.string().min(1), key: z.string().max(100), value: z.string().max(500) });
const SocialLinkSchema = z.object({ id: z.string().min(1), label: z.string().max(100), url: SafeUrlSchema });

const InstagramProfileSchema = z.object({
  username: z.string().max(64),
  avatar: z.string().url().nullable(),
  name: z.string().max(100),
  alt: z.string().max(100),
  bio: z.string().max(2000),
  followers: z.string().max(32),
  following: z.string().max(32),
  followedBy: z.string().max(300)
});

const BaseWindowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(160),
  icon: z.string().min(1).max(500),
  layout: WindowLayoutSchema,
  defaultOpen: z.boolean()
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
      avatar: z.string().url().nullable(),
      nickname: z.string().max(160),
      bio: z.string().max(5000),
      banner: z.string().max(500).default(""),
      quote: z.string().max(500).default(""),
      fields: z.array(AboutFieldSchema).max(50),
      socials: z.array(SocialLinkSchema).max(50)
    })
  }),
  BaseWindowSchema.extend({
    type: z.literal("instagram"),
    content: z.object({ profile: InstagramProfileSchema, images: z.array(GalleryImageSchema).max(60) })
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
  const layout = { desktop: { x: 130 + offset, y: 24 + offset, w: 380, h: 320, z: index + 1 }, mobile: { order: index } };

  switch (type) {
    case "gallery":
      return {
        id: id(), type, title: "相簿", icon: "photo", layout: { ...layout, desktop: { ...layout.desktop, w: 420, h: 360 } }, defaultOpen: true,
        content: { columns: 3, images: [] }
      };
    case "links":
      return {
        id: id(), type, title: "連結", icon: "link", layout: { ...layout, desktop: { ...layout.desktop, w: 300, h: 300 } }, defaultOpen: true,
        content: { links: [{ id: id(), label: "Instagram", icon: "heart", color: "#000080", target: "url", url: "https://instagram.com/", windowId: "" }] }
      };
    case "about":
      return {
        id: id(), type, title: "關於我", icon: "user", layout: { ...layout, desktop: { ...layout.desktop, w: 340, h: 400 } }, defaultOpen: true,
        content: { avatar: null, nickname: "你的名字", bio: "寫一點關於你的介紹。", banner: "", quote: "", fields: [], socials: [] }
      };
    case "instagram":
      return {
        id: id(), type, title: "Instagram.exe", icon: "camera", layout: { ...layout, desktop: { ...layout.desktop, w: 420, h: 560 } }, defaultOpen: true,
        content: { profile: { username: "retro", avatar: null, name: "Retro User", alt: "", bio: "", followers: "0", following: "0", followedBy: "" }, images: [] }
      };
    default:
      return {
        id: id(), type: "document", title: "新文件.txt", icon: "doc", layout, defaultOpen: true,
        content: {
          blocks: [
            { id: id(), kind: "heading", text: "哈囉，歡迎光臨！" },
            { id: id(), kind: "text", text: "這是一個文件視窗。", align: "left" },
            { id: id(), kind: "button", text: "打聲招呼", url: "mailto:hello@example.com" }
          ]
        }
      };
  }
}

export function createStarterDocument(siteName: string, themeId = "classic98"): SiteDocument {
  const theme = THEME_PRESETS[themeId] ?? THEME_PRESETS.classic98;
  return {
    schemaVersion: 1,
    siteName,
    theme,
    windows: [makeWindow("about", 0), makeWindow("links", 1)],
    mobileColumns: 4
  };
}
