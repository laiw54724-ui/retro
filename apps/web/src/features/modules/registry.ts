import { createElement, type ReactElement } from "react";
import { localizeDefaults } from "../../i18n/localizedDefaults";
import { makeWindow, type DesktopWindow } from "@retrodesk/shared";
import type { ModuleCtx, ModuleProps, WindowModule, WindowOf } from "./types";
import { DocumentInlineEditor, DocumentView } from "./document";
import { GalleryInlineEditor, GalleryView } from "./gallery";
import { LinksInlineEditor, LinksView } from "./links";
import { AboutInlineEditor, AboutView } from "./about";
import { IgInlineEditor, IgView } from "./instagram";
import { MusicInlineEditor, MusicView } from "./music";
import { MoodboardInlineEditor, MoodboardView } from "./moodboard";
import { ExplorerInlineEditor, ExplorerView } from "./explorer";
import { MinesweeperInlineEditor, MinesweeperView } from "./minesweeper";
import { CharacterDialogInlineEditor, CharacterDialogView } from "./character-dialog";
import { GuestbookInlineEditor, GuestbookView } from "./guestbook";
import { ImageView, ImageInlineEditor } from "./image";
import { canCreateWindowType } from "../../lib/imageWindowCreation";

type WindowType = DesktopWindow["type"];
type Registry = { [K in WindowType]: WindowModule<K> };

function factory<T extends WindowType>(type: T, index = 0): WindowOf<T> {
  const window = makeWindow(type, index);
  if (window.type !== type) throw new Error(`Window factory returned ${window.type} for ${type}`);
  return localizeDefaults(window) as WindowOf<T>;
}

const defaultCapabilities = { editor: true, visitor: true, mobile: true, links: true, uploads: true } as const;

export const registry: Registry = {
  image: { type: "image", schemaVersion: 1, label: "圖片", description: "單張圖片（唯讀）", icon: "photo", capabilities: { editor: false, visitor: true, mobile: true, links: false, uploads: false }, mobile: { mode: "window", icon: "photo" }, create: (index) => factory("image", index), View: ImageView, InlineEditor: ImageInlineEditor },
  document: { type: "document", schemaVersion: 1, label: "文件視窗", description: "標題、段落、圖片、按鈕、清單", icon: "doc", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "doc" }, create: (index) => factory("document", index), View: DocumentView, InlineEditor: DocumentInlineEditor },
  gallery: { type: "gallery", schemaVersion: 1, label: "相簿視窗", description: "多張圖片網格，點擊放大", icon: "photo", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "photo" }, create: (index) => factory("gallery", index), View: GalleryView, InlineEditor: GalleryInlineEditor },
  links: { type: "links", schemaVersion: 1, label: "連結視窗", description: "社群與外部連結按鈕", icon: "link", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "link" }, create: (index) => factory("links", index), View: LinksView, InlineEditor: LinksInlineEditor },
  about: { type: "about", schemaVersion: 1, label: "名片／關於我", description: "頭像、檔案欄位、簡介與橫幅", icon: "user", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "user" }, create: (index) => factory("about", index), View: AboutView, InlineEditor: AboutInlineEditor },
  instagram: { type: "instagram", schemaVersion: 1, label: "復古 IG 個人頁", description: "帳號、追蹤數、簡介與貼文格狀", icon: "camera", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "camera" }, create: (index) => factory("instagram", index), View: IgView, InlineEditor: IgInlineEditor },
  music: { type: "music", schemaVersion: 1, label: "音樂播放器", description: "角色播放清單、原生音訊與作品連結", icon: "music", capabilities: { ...defaultCapabilities, uploads: true }, mobile: { mode: "window", icon: "music" }, create: (index) => factory("music", index), View: MusicView, InlineEditor: MusicInlineEditor },
  moodboard: { type: "moodboard", schemaVersion: 1, label: "Moodboard 畫板", description: "用圖片、文字與色塊組成角色靈感板", icon: "photo", capabilities: { ...defaultCapabilities, links: false }, mobile: { mode: "window", icon: "photo" }, create: (index) => factory("moodboard", index), View: MoodboardView, InlineEditor: MoodboardInlineEditor },
  explorer: { type: "explorer", schemaVersion: 1, label: "世界觀資料夾", description: "用多層資料夾整理桌面視窗與角色設定", icon: "doc", capabilities: { ...defaultCapabilities, uploads: false }, mobile: { mode: "window", icon: "doc" }, create: (index) => factory("explorer", index), View: ExplorerView, InlineEditor: ExplorerInlineEditor },
  minesweeper: { type: "minesweeper", schemaVersion: 1, label: "掃雷", description: "不記分、不上傳的訪客小遊戲", icon: "star", capabilities: { ...defaultCapabilities, links: false, uploads: false }, mobile: { mode: "window", icon: "star" }, create: (index) => factory("minesweeper", index), View: MinesweeperView, InlineEditor: MinesweeperInlineEditor },
  "character-dialog": { type: "character-dialog", schemaVersion: 1, label: "角色彈窗", description: "可關閉的角色歡迎訊息", icon: "user", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "user" }, create: (index) => factory("character-dialog", index), View: CharacterDialogView, InlineEditor: CharacterDialogInlineEditor },
  guestbook: { type: "guestbook", schemaVersion: 1, label: "訪客留言簿", description: "預設待審的公開純文字留言", icon: "doc", capabilities: { ...defaultCapabilities, links: false, uploads: false }, mobile: { mode: "window", icon: "doc" }, create: (index) => factory("guestbook", index), View: GuestbookView, InlineEditor: GuestbookInlineEditor }
};

// Object insertion order is the single source of truth for authoring surfaces.
export const moduleDefinitions = Object.freeze(Object.values(registry));
export const creatableModuleDefinitions = Object.freeze(moduleDefinitions.filter((module): module is Exclude<(typeof moduleDefinitions)[number], WindowModule<"image">> => canCreateWindowType(module.type)));
export const WINDOW_TYPES = moduleDefinitions.map((module) => module.type) as WindowType[];
export const COMING_SOON = ["日記", "角色檔案", "視覺小說"];

export function getModule<T extends WindowType>(type: T): WindowModule<T> {
  const module = registry[type];
  if (!module || module.type !== type) throw new Error(`Unregistered window type: ${type}`);
  return module;
}

export function createWindow<T extends WindowType>(type: T, index = 0): WindowOf<T> {
  return getModule(type).create(index);
}

export type RenderModuleOptions = {
  window: DesktopWindow;
  ctx: ModuleCtx;
  editing: boolean;
  update: (recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
};

export function renderModule({ window, ctx, editing, update }: RenderModuleOptions): ReactElement {
  switch (window.type) {
    case "image": {
      const props: ModuleProps<"image"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"image">), key) };
      // The leaf stays read-only until the writer gate; its absolute image needs a measured stage.
      return createElement("div", { style: { height: "100%", minHeight: 180, display: "grid", gridTemplateRows: "minmax(180px, 1fr)" } }, createElement(registry.image.View, props));
    }
    case "document": {
      const props: ModuleProps<"document"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"document">), key) };
      return createElement(editing ? registry.document.InlineEditor : registry.document.View, props);
    }
    case "gallery": {
      const props: ModuleProps<"gallery"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"gallery">), key) };
      return createElement(editing ? registry.gallery.InlineEditor : registry.gallery.View, props);
    }
    case "links": {
      const props: ModuleProps<"links"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"links">), key) };
      return createElement(editing ? registry.links.InlineEditor : registry.links.View, props);
    }
    case "about": {
      const props: ModuleProps<"about"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"about">), key) };
      return createElement(editing ? registry.about.InlineEditor : registry.about.View, props);
    }
    case "instagram": {
      const props: ModuleProps<"instagram"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"instagram">), key) };
      return createElement(editing ? registry.instagram.InlineEditor : registry.instagram.View, props);
    }
    case "music": {
      const props: ModuleProps<"music"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"music">), key) };
      return createElement(editing ? registry.music.InlineEditor : registry.music.View, props);
    }
    case "moodboard": {
      const props: ModuleProps<"moodboard"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"moodboard">), key) };
      return createElement(editing ? registry.moodboard.InlineEditor : registry.moodboard.View, props);
    }
    case "explorer": {
      const props: ModuleProps<"explorer"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"explorer">), key) };
      return createElement(editing ? registry.explorer.InlineEditor : registry.explorer.View, props);
    }
    case "minesweeper": {
      const props: ModuleProps<"minesweeper"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"minesweeper">), key) };
      return createElement(editing ? registry.minesweeper.InlineEditor : registry.minesweeper.View, props);
    }
    case "character-dialog": {
      const props: ModuleProps<"character-dialog"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"character-dialog">), key) };
      return createElement(editing ? registry["character-dialog"].InlineEditor : registry["character-dialog"].View, props);
    }
    case "guestbook": {
      const props: ModuleProps<"guestbook"> = { window, ctx, update: (recipe, key) => update((current) => recipe(current as WindowOf<"guestbook">), key) };
      return createElement(editing ? registry.guestbook.InlineEditor : registry.guestbook.View, props);
    }
  }
}
