import { createElement, type ReactElement } from "react";
import { makeWindow, type DesktopWindow } from "@retrodesk/shared";
import type { ModuleCtx, ModuleProps, WindowModule, WindowOf } from "./types";
import { DocumentInlineEditor, DocumentView } from "./document";
import { GalleryInlineEditor, GalleryView } from "./gallery";
import { LinksInlineEditor, LinksView } from "./links";
import { AboutInlineEditor, AboutView } from "./about";
import { IgInlineEditor, IgView } from "./instagram";

type WindowType = DesktopWindow["type"];
type Registry = { [K in WindowType]: WindowModule<K> };

function factory<T extends WindowType>(type: T, index = 0): WindowOf<T> {
  const window = makeWindow(type, index);
  if (window.type !== type) throw new Error(`Window factory returned ${window.type} for ${type}`);
  return window as WindowOf<T>;
}

const defaultCapabilities = { editor: true, visitor: true, mobile: true, links: true, uploads: true } as const;

export const registry: Registry = {
  document: { type: "document", schemaVersion: 1, label: "文件視窗", description: "標題、段落、圖片、按鈕、清單", icon: "doc", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "doc" }, create: (index) => factory("document", index), View: DocumentView, InlineEditor: DocumentInlineEditor },
  gallery: { type: "gallery", schemaVersion: 1, label: "相簿視窗", description: "多張圖片網格，點擊放大", icon: "photo", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "photo" }, create: (index) => factory("gallery", index), View: GalleryView, InlineEditor: GalleryInlineEditor },
  links: { type: "links", schemaVersion: 1, label: "連結視窗", description: "社群與外部連結按鈕", icon: "link", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "link" }, create: (index) => factory("links", index), View: LinksView, InlineEditor: LinksInlineEditor },
  about: { type: "about", schemaVersion: 1, label: "名片／關於我", description: "頭像、檔案欄位、簡介與橫幅", icon: "user", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "user" }, create: (index) => factory("about", index), View: AboutView, InlineEditor: AboutInlineEditor },
  instagram: { type: "instagram", schemaVersion: 1, label: "復古 IG 個人頁", description: "帳號、追蹤數、簡介與貼文格狀", icon: "camera", capabilities: defaultCapabilities, mobile: { mode: "window", icon: "camera" }, create: (index) => factory("instagram", index), View: IgView, InlineEditor: IgInlineEditor }
};

// Object insertion order is the single source of truth for authoring surfaces.
export const moduleDefinitions = Object.freeze(Object.values(registry));
export const WINDOW_TYPES = moduleDefinitions.map((module) => module.type) as WindowType[];
export const COMING_SOON = ["日記", "留言板", "音樂播放器", "角色檔案", "視覺小說"];

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
  }
}
