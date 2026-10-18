import type { WindowOf } from "../types";
import { i18n } from "../../../i18n";

export type ExplorerContent = WindowOf<"explorer">["content"];
export type Folder = ExplorerContent["folders"][number];
export type Shortcut = ExplorerContent["shortcuts"][number];
export type ShortcutTarget = Shortcut["target"];

export const MAX_DEPTH = 8;
export const MAX_ITEMS = 500;
export const rootLabel = () => i18n.t("modules:explorerModel.desktop");

const byOrder = <T extends { order: number }>(a: T, b: T, nameA: string, nameB: string) => a.order - b.order || nameA.localeCompare(nameB);
export const sortFolders = (folders: Folder[]) => [...folders].sort((a, b) => byOrder(a, b, a.name, b.name));
export const sortShortcuts = (shortcuts: Shortcut[]) => [...shortcuts].sort((a, b) => byOrder(a, b, a.label, b.label));

/** The folder plus every folder below it. */
export function descendants(folders: Folder[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) { result.add(folder.id); changed = true; }
  }
  return result;
}

/** Levels from the desktop down to (and including) this folder. */
export function folderDepth(folders: Folder[], id: string | null): number {
  if (!id) return 0;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let depth = 0, cursor = byId.get(id), remaining = MAX_DEPTH + 1;
  while (cursor && remaining-- > 0) { depth += 1; cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined; }
  return depth;
}

/** Levels in the subtree rooted at this folder (a lone folder is 1). */
export function subtreeHeight(folders: Folder[], id: string): number {
  const children = folders.filter((folder) => folder.parentId === id);
  return children.length ? 1 + Math.max(...children.map((folder) => subtreeHeight(folders, folder.id))) : 1;
}

/** "桌面 / 角色 / 主角", so folders with the same name stay distinguishable. */
export function pathLabel(folders: Folder[], id: string | null): string {
  if (!id) return rootLabel();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(id);
  while (cursor && !seen.has(cursor.id)) { names.unshift(cursor.name); seen.add(cursor.id); cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined; }
  return [rootLabel(), ...names].join(" / ");
}

export type MoveOption = { id: string | null; path: string; disabled: boolean; reason: string; current: boolean };

/** Every place an item can go, with the reason when it cannot. Order: desktop first, then by path. */
export function moveOptions(content: ExplorerContent, item: { kind: "folder" | "shortcut"; id: string }): MoveOption[] {
  const folder = item.kind === "folder" ? content.folders.find((candidate) => candidate.id === item.id) : undefined;
  const blocked = folder ? descendants(content.folders, folder.id) : new Set<string>();
  const height = folder ? subtreeHeight(content.folders, folder.id) : 0;
  const currentParent = folder ? folder.parentId : content.shortcuts.find((candidate) => candidate.id === item.id)?.parentId ?? null;
  const options: MoveOption[] = [{ id: null, path: rootLabel(), disabled: false, reason: "", current: currentParent === null }];
  const folders = content.folders.map((candidate) => ({ candidate, path: pathLabel(content.folders, candidate.id) })).sort((a, b) => a.path.localeCompare(b.path));
  for (const { candidate, path } of folders) {
    let reason = "";
    if (blocked.has(candidate.id)) reason = candidate.id === item.id ? i18n.t("modules:explorerModel.cantMoveItIntoItself") : i18n.t("modules:explorerModel.cantMoveItIntoIts");
    else if (folder && folderDepth(content.folders, candidate.id) + height > MAX_DEPTH) reason = i18n.t("modules:explorerModel.foldersCanBeAtMost", { MAX_DEPTH });
    options.push({ id: candidate.id, path, disabled: !!reason, reason, current: currentParent === candidate.id });
  }
  return options;
}

export type MoveResult = { ok: true; content: ExplorerContent } | { ok: false; reason: string };

export function moveItem(content: ExplorerContent, item: { kind: "folder" | "shortcut"; id: string }, parentId: string | null): MoveResult {
  const option = moveOptions(content, item).find((candidate) => candidate.id === parentId);
  if (!option) return { ok: false, reason: i18n.t("modules:explorerModel.couldntFindTheDestinationFolder") };
  if (option.disabled) return { ok: false, reason: option.reason };
  const nextOrder = (items: Array<{ parentId: string | null; order: number }>) => items.filter((entry) => entry.parentId === parentId).reduce((max, entry) => Math.max(max, entry.order + 1), 0);
  if (item.kind === "folder") {
    const order = nextOrder(content.folders.filter((folder) => folder.id !== item.id));
    return { ok: true, content: { ...content, folders: content.folders.map((folder) => folder.id === item.id ? { ...folder, parentId, order } : folder) } };
  }
  const order = nextOrder(content.shortcuts.filter((shortcut) => shortcut.id !== item.id));
  return { ok: true, content: { ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === item.id ? { ...shortcut, parentId, order } : shortcut) } };
}

export type DeleteImpact = { folders: Folder[]; shortcuts: Shortcut[]; total: number };

/** What disappears with a folder (the folder itself is not counted). Targets are never deleted. */
export function deleteImpact(content: ExplorerContent, folderId: string): DeleteImpact {
  const removed = descendants(content.folders, folderId);
  const folders = content.folders.filter((folder) => removed.has(folder.id) && folder.id !== folderId);
  const shortcuts = content.shortcuts.filter((shortcut) => shortcut.parentId && removed.has(shortcut.parentId));
  return { folders, shortcuts, total: folders.length + shortcuts.length };
}

export function removeFolder(content: ExplorerContent, folderId: string): ExplorerContent {
  const removed = descendants(content.folders, folderId);
  return { folders: content.folders.filter((folder) => !removed.has(folder.id)), shortcuts: content.shortcuts.filter((shortcut) => !shortcut.parentId || !removed.has(shortcut.parentId)) };
}

/** "新資料夾", then "新資料夾 2", "新資料夾 3"… among siblings. */
export function uniqueName(base: string, siblings: string[]): string {
  const taken = new Set(siblings.map((name) => name.trim()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  return `${base} ${Date.now()}`;
}

export type CreateCheck = { ok: true } | { ok: false; reason: string };
export function canCreateFolder(content: ExplorerContent, parentId: string | null): CreateCheck {
  if (content.folders.length >= MAX_ITEMS) return { ok: false, reason: i18n.t("modules:explorerModel.explorerHasReachedItsLimit", { MAX_ITEMS }) };
  if (folderDepth(content.folders, parentId) >= MAX_DEPTH) return { ok: false, reason: i18n.t("modules:explorerModel.foldersCanBeAtMost2", { MAX_DEPTH }) };
  return { ok: true };
}
export function canCreateShortcut(content: ExplorerContent): CreateCheck {
  return content.shortcuts.length >= MAX_ITEMS ? { ok: false, reason: i18n.t("modules:explorerModel.explorerHasReachedItsLimit2", { MAX_ITEMS }) } : { ok: true };
}

export const nextOrderIn = (items: Array<{ parentId: string | null; order: number }>, parentId: string | null) =>
  items.filter((entry) => entry.parentId === parentId).reduce((max, entry) => Math.max(max, entry.order + 1), 0);

export type TargetOption = { kind: ShortcutTarget["kind"]; id: string; label: string; group: string };
export type TargetStatus = { status: "ok"; kindLabel: string; name: string } | { status: "missing"; kindLabel: string; name: string } | { status: "unknown"; kindLabel: string; name: string };
const kindLabels = (): Record<ShortcutTarget["kind"], string> => ({ window: i18n.t("modules:explorerModel.window"), profile: "OC", post: i18n.t("modules:explorerModel.post") });

/** Whether a shortcut still points at something. "unknown" = the host did not provide enough to check. */
export function targetStatus(target: ShortcutTarget, options: TargetOption[], canVerify: Record<ShortcutTarget["kind"], boolean>): TargetStatus {
  const kindLabel = kindLabels()[target.kind];
  const hit = options.find((option) => option.kind === target.kind && option.id === target.id);
  if (hit) return { status: "ok", kindLabel, name: hit.label };
  return { status: canVerify[target.kind] ? "missing" : "unknown", kindLabel, name: "" };
}
