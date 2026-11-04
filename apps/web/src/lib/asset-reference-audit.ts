import { parseAssetReference, type VersionedSiteDocumentInput } from "@retrodesk/shared";
import { i18n } from "../i18n";
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
  if (path.length === 2 && path[0] === "theme" && path[1] === "wallImage") return i18n.t("collab:assetReferenceAudit.desktopBackground");
  if (path[0] === "windows" && typeof path[1] === "number") {
    const window = record((document.windows as unknown[] | undefined)?.[path[1]]);
    const windowTitle = titleFor(window, i18n.t("collab:assetReferenceAudit.window", { v1: path[1] + 1 }));
    const field = path[2];
    if (field === "icon") return i18n.t("collab:assetReferenceAudit.iconOf", { windowTitle });
    const content = record(window?.content);
    if (field === "content" && window?.type === "about" && (path[3] === "avatar" || path[3] === "avatarUrl")) return i18n.t("collab:assetReferenceAudit.avatarOf", { windowTitle });
    if (field === "content" && window?.type === "about" && path[3] === "banner") return i18n.t("collab:assetReferenceAudit.bannerOf", { windowTitle });
    if (field === "content" && window?.type === "gallery" && path[3] === "images" && typeof path[4] === "number") return i18n.t("collab:assetReferenceAudit.galleryImageOf", { windowTitle, v2: path[4] + 1 });
    if (field === "content" && window?.type === "music" && path[3] === "tracks" && typeof path[4] === "number" && path[5] === "source" && path[6] === "asset") {
      const track = (content?.tracks as unknown[] | undefined)?.[path[4]];
      return i18n.t("collab:assetRef.trackAudio", { windowTitle, title: titleFor(track, i18n.t("collab:assetRef.trackN", { n: path[4] + 1 })) });
    }
    if (field === "content" && path[3] === "profile" && path[4] === "avatar") return i18n.t("collab:assetReferenceAudit.avatarOf", { windowTitle });
    if (field === "content" && path[3] === "profile" && path[4] === "avatarUrl") return i18n.t("collab:assetReferenceAudit.avatarUrlOf", { windowTitle });
    if (field === "content" && path[3] === "profile" && path[4] === "highlights" && typeof path[5] === "number") {
      const highlight = (record(content?.profile)?.highlights as unknown[] | undefined)?.[path[5]];
      return i18n.t("collab:assetRef.highlightCover", { windowTitle, title: titleFor(highlight, i18n.t("collab:assetRef.pageN", { n: path[5] + 1 })) });
    }
    if (field === "content" && path[3] === "profile" && path[4] === "images" && typeof path[5] === "number") {
      const profile = record(content?.profile);
      const image = (profile?.images as unknown[] | undefined)?.[path[5]];
      const postTitle = titleFor(image, i18n.t("collab:assetReferenceAudit.post", { v1: path[5] + 1 }));
      if (path[6] === "extra" && typeof path[7] === "number") return i18n.t("collab:assetReferenceAudit.carouselImageOfIn", { windowTitle, postTitle, v3: path[7] + 2 });
      return i18n.t("collab:assetReferenceAudit.mainImageOfThePost", { windowTitle, postTitle });
    }
    if (field === "content" && path[3] === "images" && typeof path[4] === "number") {
      const image = (content?.images as unknown[] | undefined)?.[path[4]];
      const postTitle = titleFor(image, i18n.t("collab:assetReferenceAudit.post", { v1: path[4] + 1 }));
      if (path[5] === "extra" && typeof path[6] === "number") return i18n.t("collab:assetReferenceAudit.carouselImageOfIn", { windowTitle, postTitle, v3: path[6] + 2 });
      return i18n.t("collab:assetReferenceAudit.mainImageOfThePost", { windowTitle, postTitle });
    }
    if (field === "content") return i18n.t("collab:assetReferenceAudit.contentOfStructuredPath", { windowTitle, v2: path.slice(3).join(".") });
    return i18n.t("collab:assetReferenceAudit.structuredPath", { windowTitle, v2: path.slice(2).join(".") });
  }
  if (path[0] === "entities" && path[1] === "profiles" && typeof path[2] === "number") {
    const profile = list(record(document.entities)?.profiles)[path[2]];
    const name = profileName(profile, i18n.t("collab:assetReferenceAudit.character", { v1: path[2] + 1 }));
    if (path[3] === "avatar" || path[3] === "avatarUrl") return i18n.t("collab:assetReferenceAudit.avatarOfTheCharacter", { name });
    if (path[3] === "highlights" && typeof path[4] === "number") return i18n.t("collab:assetReferenceAudit.pageOfTheHighlightOf", { name, v2: path[4] + 1 });
    return i18n.t("collab:assetReferenceAudit.theCharacterStructuredPath", { name, v2: path.slice(3).join(".") });
  }
  if (path[0] === "entities" && path[1] === "posts" && typeof path[2] === "number") {
    const post = list(record(document.entities)?.posts)[path[2]];
    const title = titleFor(post, i18n.t("collab:assetReferenceAudit.post", { v1: path[2] + 1 }));
    if (path[3] === "media" && typeof path[4] === "number") return i18n.t("collab:assetReferenceAudit.mediaOf", { title, v2: path[4] + 1 });
    if (path[3] === "src" || path[3] === "srcUrl") return i18n.t("collab:assetReferenceAudit.mainImageOf", { title });
    return i18n.t("collab:assetReferenceAudit.structuredPath2", { title, v2: path.slice(3).join(".") });
  }
  if (path[0] === "entities" && path[1] === "highlights" && typeof path[2] === "number") {
    const highlight = list(record(document.entities)?.highlights)[path[2]];
    const name = titleFor(highlight, i18n.t("collab:assetReferenceAudit.group", { v1: path[2] + 1 }));
    if (path[3] === "coverSrc" || path[3] === "coverSrcUrl") return i18n.t("collab:assetReferenceAudit.coverOfTheHighlight", { name });
    if (path[3] === "frames" && typeof path[4] === "number") return i18n.t("collab:assetReferenceAudit.pageOfTheHighlight", { name, v2: path[4] + 1 });
    return i18n.t("collab:assetReferenceAudit.contentOfTheHighlight", { name });
  }
  return i18n.t("collab:assetReferenceAudit.structuredPath3", { v1: path.map(String).join(".") });
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
