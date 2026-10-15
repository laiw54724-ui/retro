import type { DesktopWindow } from "@retrodesk/shared";
import type { WindowModule } from "./types";
import { DocumentInlineEditor, DocumentView } from "./document";
import { GalleryInlineEditor, GalleryView } from "./gallery";
import { LinksInlineEditor, LinksView } from "./links";
import { AboutInlineEditor, AboutView } from "./about";
import { IgInlineEditor, IgView } from "./instagram";

type Registry = { [K in DesktopWindow["type"]]: WindowModule<K> };

export const registry: Registry = {
  document: { label: "文件視窗", description: "標題、段落、圖片、按鈕、清單", icon: "doc", View: DocumentView, InlineEditor: DocumentInlineEditor },
  gallery: { label: "相簿視窗", description: "多張圖片網格，點擊放大", icon: "photo", View: GalleryView, InlineEditor: GalleryInlineEditor },
  links: { label: "連結視窗", description: "社群與外部連結按鈕", icon: "link", View: LinksView, InlineEditor: LinksInlineEditor },
  about: { label: "名片／關於我", description: "頭像、檔案欄位、簡介與橫幅", icon: "user", View: AboutView, InlineEditor: AboutInlineEditor },
  instagram: { label: "復古 IG 個人頁", description: "帳號、追蹤數、簡介與貼文格狀", icon: "camera", View: IgView, InlineEditor: IgInlineEditor }
};

export const WINDOW_TYPES = Object.keys(registry) as DesktopWindow["type"][];
export const COMING_SOON = ["日記", "留言板", "音樂播放器", "角色檔案", "視覺小說"];
