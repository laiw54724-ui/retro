import { descendants, moveItem, moveOptions, removeFolder, type ExplorerContent } from "./explorerModel";

export type ExplorerItem = { kind: "folder" | "shortcut"; id: string };
export const itemExists = (content: ExplorerContent, item: ExplorerItem) => (item.kind === "folder" ? content.folders : content.shortcuts).some(candidate => candidate.id === item.id);

/** Moving a selected folder already moves its descendants; never detach them. */
export function selectionRoots(content: ExplorerContent, items: ExplorerItem[]) {
  const existing = items.filter(item => itemExists(content, item));
  const parents = existing.filter(item => item.kind === "folder");
  return existing.filter(item => !parents.some(parent => {
    if (parent.id === item.id) return false;
    const subtree = descendants(content.folders, parent.id);
    return item.kind === "folder" ? subtree.has(item.id) : subtree.has(content.shortcuts.find(candidate => candidate.id === item.id)?.parentId ?? "");
  }));
}

export function moveSelection(content: ExplorerContent, items: ExplorerItem[], parentId: string | null) {
  const roots = selectionRoots(content, items);
  if (!roots.length) return { ok: false as const, reason: "" };
  const checks = roots.map(item => moveOptions(content, item).find(option => option.id === parentId));
  const invalid = checks.find(check => !check || check.disabled);
  if (checks.some(check => !check) || invalid) return { ok: false as const, reason: invalid?.reason ?? "" };
  if (checks.every(check => check?.current)) return { ok: false as const, reason: "" };
  let next = content;
  for (const [index, item] of roots.entries()) {
    if (checks[index]?.current) continue;
    const moved = moveItem(next, item, parentId);
    if (!moved.ok) return moved;
    next = moved.content;
  }
  return { ok: true as const, content: next };
}

export function removeSelection(content: ExplorerContent, items: ExplorerItem[]) {
  let next = content;
  for (const item of selectionRoots(content, items)) {
    next = item.kind === "folder" ? removeFolder(next, item.id) : { ...next, shortcuts: next.shortcuts.filter(shortcut => shortcut.id !== item.id) };
  }
  return next;
}
