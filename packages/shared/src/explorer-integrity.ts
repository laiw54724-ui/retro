/**
 * Explorer shortcuts are references. Deleting the window, character or post they point at would leave a reference
 * that the document schema refuses to save, so every delete path lists the affected shortcuts first and removes them
 * together with the target (one undo step restores both).
 *
 * These helpers accept both the legacy document (windows only) and the canonical one (windows + entities). Without
 * `entities`, profile and post targets cannot be checked and are treated as present.
 */
type ShortcutLike = { id: string; parentId: string | null; label: string; target: { kind: "window" | "profile" | "post"; id: string; siteId: string } };
type FolderLike = { id: string; parentId: string | null; name: string };
type WindowLike = { id: string; type: string; title?: string; content?: unknown };
type EntitiesLike = { profiles?: Array<{ id: string; siteId: string; name?: string; displayName?: string }>; posts?: Array<{ id: string; siteId: string; title?: string }> };
export type IntegrityDocument = { windows: WindowLike[]; entities?: EntitiesLike };

export interface DanglingShortcut {
  explorerId: string;
  explorerTitle: string;
  shortcutId: string;
  label: string;
  /** "桌面 / 角色 / 主角設定"-style location of the shortcut inside its Explorer (without the Explorer title). */
  folderPath: string;
  /** Folder names from the Explorer root down to the shortcut (without the localized root label). */
  folderNames: string[];
  targetKind: "window" | "profile" | "post";
  targetId: string;
}

const explorerContent = (window: WindowLike) => window.type === "explorer" ? (window.content as { folders: FolderLike[]; shortcuts: ShortcutLike[] }) : null;

function targetExists(document: IntegrityDocument, target: ShortcutLike["target"]): boolean {
  if (target.kind === "window") return document.windows.some((window) => window.id === target.id);
  const entities = document.entities;
  if (!entities) return true;
  if (target.kind === "profile") return !entities.profiles || entities.profiles.some((item) => item.id === target.id && item.siteId === target.siteId);
  return !entities.posts || entities.posts.some((item) => item.id === target.id && item.siteId === target.siteId);
}

function folderNamesOf(folders: FolderLike[], parentId: string | null): string[] {
  const names: string[] = [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (let cursor = parentId, guard = 0; cursor && guard < 12; guard += 1) {
    const folder = byId.get(cursor);
    if (!folder) break;
    names.unshift(folder.name);
    cursor = folder.parentId;
  }
  return names;
}
const folderPath = (folders: FolderLike[], parentId: string | null) => ["桌面", ...folderNamesOf(folders, parentId)].join(" / ");

export function danglingExplorerShortcuts(document: IntegrityDocument): DanglingShortcut[] {
  const result: DanglingShortcut[] = [];
  for (const window of document.windows) {
    const content = explorerContent(window);
    if (!content) continue;
    for (const shortcut of content.shortcuts) {
      if (targetExists(document, shortcut.target)) continue;
      result.push({ explorerId: window.id, explorerTitle: window.title ?? "Explorer", shortcutId: shortcut.id, label: shortcut.label, folderPath: folderPath(content.folders, shortcut.parentId), folderNames: folderNamesOf(content.folders, shortcut.parentId), targetKind: shortcut.target.kind, targetId: shortcut.target.id });
    }
  }
  return result;
}

/** Shortcuts that this edit newly orphans (already-broken ones are not blamed on the edit). */
export function newlyDanglingShortcuts(before: IntegrityDocument | null | undefined, after: IntegrityDocument): DanglingShortcut[] {
  const existing = new Set((before ? danglingExplorerShortcuts(before) : []).map((item) => `${item.explorerId}\0${item.shortcutId}`));
  return danglingExplorerShortcuts(after).filter((item) => !existing.has(`${item.explorerId}\0${item.shortcutId}`));
}

/** Removes the listed shortcuts (and nothing else). */
export function removeExplorerShortcuts<T extends { windows: WindowLike[] }>(document: T, items: Array<Pick<DanglingShortcut, "explorerId" | "shortcutId">>): T {
  if (!items.length) return document;
  const drop = new Set(items.map((item) => `${item.explorerId}\0${item.shortcutId}`));
  return {
    ...document,
    windows: document.windows.map((window) => {
      const content = explorerContent(window);
      if (!content || !content.shortcuts.some((shortcut) => drop.has(`${window.id}\0${shortcut.id}`))) return window;
      return { ...window, content: { ...content, shortcuts: content.shortcuts.filter((shortcut) => !drop.has(`${window.id}\0${shortcut.id}`)) } };
    })
  };
}

/** Human description of what a shortcut pointed at, taken from the document that still has it. */
export function describeShortcutTarget(document: IntegrityDocument, item: Pick<DanglingShortcut, "targetKind" | "targetId">): string {
  if (item.targetKind === "window") return `視窗：${document.windows.find((window) => window.id === item.targetId)?.title ?? "已刪除的視窗"}`;
  if (item.targetKind === "profile") {
    const profile = document.entities?.profiles?.find((candidate) => candidate.id === item.targetId);
    return `角色：${profile?.displayName ?? profile?.name ?? "已刪除的角色"}`;
  }
  const post = document.entities?.posts?.find((candidate) => candidate.id === item.targetId);
  return `貼文：${post?.title || "已刪除的貼文"}`;
}

/** Language-neutral form of {@link describeShortcutTarget}: the kind and the name from the document that still has it. */
export function describeShortcutTargetParts(document: IntegrityDocument, item: Pick<DanglingShortcut, "targetKind" | "targetId">): { kind: DanglingShortcut["targetKind"]; name: string | null } {
  if (item.targetKind === "window") return { kind: "window", name: document.windows.find((window) => window.id === item.targetId)?.title ?? null };
  if (item.targetKind === "profile") {
    const profile = document.entities?.profiles?.find((candidate) => candidate.id === item.targetId);
    return { kind: "profile", name: profile?.displayName ?? profile?.name ?? null };
  }
  return { kind: "post", name: document.entities?.posts?.find((candidate) => candidate.id === item.targetId)?.title || null };
}
