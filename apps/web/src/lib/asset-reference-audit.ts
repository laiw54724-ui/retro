import { parseAssetReference, type VersionedSiteDocumentInput } from "@retrodesk/shared";
import type { AssetRecord } from "./api";

export type AssetReferenceLocation = {
  label: string;
  path: Array<string | number>;
};

export type AssetReferenceAudit = {
  asset: AssetRecord;
  references: AssetReferenceLocation[];
  referenced: boolean;
};

type AnyRecord = Record<string, unknown>;

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function titleFor(value: unknown, fallback: string): string {
  const item = record(value);
  return typeof item?.title === "string" && item.title.trim() ? item.title : fallback;
}

function profileName(value: unknown, fallback: string): string {
  const item = record(value);
  for (const key of ["displayName", "name", "handle", "username"]) {
    if (typeof item?.[key] === "string" && item[key].trim()) return item[key] as string;
  }
  return fallback;
}

function describePath(document: AnyRecord, path: Array<string | number>): string {
  if (path.length === 2 && path[0] === "theme" && path[1] === "wallImage") return "桌面背景";
  if (path[0] === "windows" && typeof path[1] === "number") {
    const window = record((document.windows as unknown[] | undefined)?.[path[1]]);
    const windowTitle = titleFor(window, `視窗 ${path[1] + 1}`);
    const field = path[2];
    if (field === "icon") return `${windowTitle} 的圖示`;
    const content = record(window?.content);
    if (field === "content" && window?.type === "about" && (path[3] === "avatar" || path[3] === "avatarUrl")) return `${windowTitle} 的頭像`;
    if (field === "content" && window?.type === "about" && path[3] === "banner") return `${windowTitle} 的橫幅`;
    if (field === "content" && window?.type === "gallery" && path[3] === "images" && typeof path[4] === "number") return `${windowTitle} 的相簿第 ${path[4] + 1} 張`;
    if (field === "content" && window?.type === "music" && path[3] === "tracks" && typeof path[4] === "number" && path[5] === "source" && path[6] === "asset") {
      const track = (content?.tracks as unknown[] | undefined)?.[path[4]];
      return `${windowTitle} 的曲目「${titleFor(track, `第 ${path[4] + 1} 首`)}」音訊`;
    }
    if (field === "content" && path[3] === "profile" && path[4] === "avatar") return `${windowTitle} 的頭像`;
    if (field === "content" && path[3] === "profile" && path[4] === "avatarUrl") return `${windowTitle} 的頭像網址`;
    if (field === "content" && path[3] === "profile" && path[4] === "highlights" && typeof path[5] === "number") {
      const highlight = (record(content?.profile)?.highlights as unknown[] | undefined)?.[path[5]];
      return `${windowTitle} 的精選「${titleFor(highlight, `第 ${path[5] + 1} 頁`)}」封面`;
    }
    if (field === "content" && path[3] === "profile" && path[4] === "images" && typeof path[5] === "number") {
      const profile = record(content?.profile);
      const image = (profile?.images as unknown[] | undefined)?.[path[5]];
      const postTitle = titleFor(image, `第 ${path[5] + 1} 篇貼文`);
      if (path[6] === "extra" && typeof path[7] === "number") return `${windowTitle} 的「${postTitle}」輪播第 ${path[7] + 2} 張`;
      return `${windowTitle} 的「${postTitle}」貼文主圖`;
    }
    if (field === "content" && path[3] === "images" && typeof path[4] === "number") {
      const image = (content?.images as unknown[] | undefined)?.[path[4]];
      const postTitle = titleFor(image, `第 ${path[4] + 1} 篇貼文`);
      if (path[5] === "extra" && typeof path[6] === "number") return `${windowTitle} 的「${postTitle}」輪播第 ${path[6] + 2} 張`;
      return `${windowTitle} 的「${postTitle}」貼文主圖`;
    }
    if (field === "content") return `${windowTitle} 的內容（結構化路徑：${path.slice(3).join(".")}）`;
    return `${windowTitle}（結構化路徑：${path.slice(2).join(".")}）`;
  }
  if (path[0] === "entities" && path[1] === "profiles" && typeof path[2] === "number") {
    const profile = list(record(document.entities)?.profiles)[path[2]];
    const name = profileName(profile, `角色 ${path[2] + 1}`);
    if (path[3] === "avatar" || path[3] === "avatarUrl") return `角色「${name}」的頭像`;
    if (path[3] === "highlights" && typeof path[4] === "number") return `角色「${name}」的精選第 ${path[4] + 1} 頁`;
    return `角色「${name}」（結構化路徑：${path.slice(3).join(".")}）`;
  }
  if (path[0] === "entities" && path[1] === "posts" && typeof path[2] === "number") {
    const post = list(record(document.entities)?.posts)[path[2]];
    const title = titleFor(post, `第 ${path[2] + 1} 篇貼文`);
    if (path[3] === "media" && typeof path[4] === "number") return `「${title}」媒體第 ${path[4] + 1} 張`;
    if (path[3] === "src" || path[3] === "srcUrl") return `「${title}」貼文主圖`;
    return `「${title}」（結構化路徑：${path.slice(3).join(".")}）`;
  }
  if (path[0] === "entities" && path[1] === "highlights" && typeof path[2] === "number") {
    const highlight = list(record(document.entities)?.highlights)[path[2]];
    const name = titleFor(highlight, `第 ${path[2] + 1} 組`);
    if (path[3] === "coverSrc" || path[3] === "coverSrcUrl") return `精選「${name}」封面`;
    if (path[3] === "frames" && typeof path[4] === "number") return `精選「${name}」第 ${path[4] + 1} 頁`;
    return `精選「${name}」內容`;
  }
  return `結構化路徑：${path.map(String).join(".")}`;
}

function matchesAsset(value: string, asset: AssetRecord): boolean {
  const referencedId = parseAssetReference(value);
  return referencedId === asset.id || value === asset.url;
}

/** Returns every known asset, including assets not referenced by the draft. */
export function auditAssetReferences(document: VersionedSiteDocumentInput, assets: readonly AssetRecord[]): AssetReferenceAudit[] {
  const root = document as unknown;
  const output = assets.map((asset) => ({ asset, references: [] as AssetReferenceLocation[], referenced: false }));
  const visit = (value: unknown, path: Array<string | number>) => {
    if (typeof value === "string") {
      output.forEach((entry) => {
        if (matchesAsset(value, entry.asset)) entry.references.push({ label: describePath(root as AnyRecord, path), path: [...path] });
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    const item = record(value);
    if (item) Object.entries(item).forEach(([key, child]) => visit(child, [...path, key]));
  };
  visit(root, []);
  output.forEach((entry) => { entry.referenced = entry.references.length > 0; });
  return output;
}
