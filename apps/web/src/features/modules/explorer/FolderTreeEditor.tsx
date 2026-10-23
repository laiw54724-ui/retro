import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, EditorStatusBar, InlineErrorBanner, PopoverPanel, type ContextMenuItem } from "../../../components/editing";
import { Icon } from "../../../components/Icon";
import { IconPickerAction } from "../links/IconPicker";
import { targetCatalog } from "../../navigation/targetCatalog";
import type { ModuleProps } from "../types";
import { MoveDialog } from "./ExplorerDialogs";
import { canCreateFolder, canCreateShortcut, moveOptions, nextOrderIn, pathLabel, rootLabel, sortFolders, sortShortcuts, targetStatus, uniqueName, type Folder, type TargetOption } from "./explorerModel";
import { itemExists, moveSelection, removeSelection, type ExplorerItem } from "./selectionModel";
import "./inlineEditor.css";

const GLYPH = { window: "▣", profile: "☺", post: "▧" } as const;
const uid = () => crypto.randomUUID();
function RenameInput({ value, label, onCommit, onCancel }: { value: string; label: string; onCommit: (value: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null), canceled = useRef(false), composing = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return <input ref={ref} className="explorer-rename" aria-label={label} defaultValue={value} maxLength={160}
    onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
    onBlur={e => { if (!canceled.current) onCommit(e.currentTarget.value); }} onKeyDown={e => {
      e.stopPropagation(); if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === "Escape") { e.preventDefault(); canceled.current = true; onCancel(); }
    }} />;
}
function useCoarsePointer(mobile: boolean) {
  const [coarse, setCoarse] = useState(mobile || matchMedia("(pointer: coarse)").matches);
  useEffect(() => { const query = matchMedia("(pointer: coarse)"); const changed = () => setCoarse(mobile || query.matches); changed(); query.addEventListener("change", changed); return () => query.removeEventListener("change", changed); }, [mobile]);
  return coarse;
}
export function FolderTreeEditor(props: ModuleProps<"explorer">) { return <FolderEditor key={props.window.id} {...props} />; }
function FolderEditor({ window, ctx, update }: ModuleProps<"explorer">) {
  const { t } = useTranslation("modules"), content = window.content, coarse = useCoarsePointer(ctx.mobile);
  const root = useRef<HTMLDivElement>(null), origin = useRef<HTMLElement | null>(null), pickerSearch = useRef<HTMLInputElement>(null), renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null), [selection, setSelection] = useState<ExplorerItem[]>([]), [open, setOpen] = useState<Set<string>>(new Set());
  const [rename, setRename] = useState<ExplorerItem | null>(null), [query, setQuery] = useState(""), [pickQuery, setPickQuery] = useState("");
  const [picker, setPicker] = useState<"create" | ExplorerItem | null>(null), [pendingTarget, setPendingTarget] = useState<TargetOption | null>(null), [iconItem, setIconItem] = useState<ExplorerItem | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: ExplorerItem[] } | null>(null), [clipboard, setClipboard] = useState<ExplorerItem[]>([]);
  const [dragging, setDragging] = useState<ExplorerItem[]>([]), [over, setOver] = useState<string | null>(null), [confirm, setConfirm] = useState<ExplorerItem[] | null>(null);
  const [moving, setMoving] = useState<ExplorerItem | null>(null), [selectMode, setSelectMode] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState("");
  const foldersById = useMemo(() => new Map(content.folders.map(folder => [folder.id, folder])), [content.folders]);
  const current = folderId ? foldersById.get(folderId) : undefined, parentId = current?.id ?? null;
  const folders = sortFolders(content.folders.filter(folder => folder.parentId === parentId)), shortcuts = sortShortcuts(content.shortcuts.filter(shortcut => shortcut.parentId === parentId));
  const items: ExplorerItem[] = [...folders.map(folder => ({ kind: "folder" as const, id: folder.id })), ...shortcuts.map(shortcut => ({ kind: "shortcut" as const, id: shortcut.id }))];
  const selected = selection.filter(item => itemExists(content, item)), one = selected.length === 1 ? selected[0] : null;
  const record = (item: ExplorerItem) => item.kind === "folder" ? foldersById.get(item.id) : content.shortcuts.find(shortcut => shortcut.id === item.id);
  const name = (item: ExplorerItem) => { const value = record(item); return value ? "name" in value ? value.name : value.label : ""; };
  const targetOptions = useMemo(() => targetCatalog({ siteId: ctx.navigationSiteId ?? ctx.siteId ?? null, windows: ctx.windows, profiles: ctx.profileDirectory ?? [] }, { window: t("explorer.window"), profile: "OC", post: t("explorer.post") }, window.id), [ctx.navigationSiteId, ctx.siteId, ctx.windows, ctx.profileDirectory, window.id, t]);
  const statusOf = (shortcut: typeof content.shortcuts[number]) => targetStatus(shortcut.target, targetOptions, { window: ctx.windows.length > 0, profile: !!ctx.profileDirectory, post: !!ctx.profileDirectory });
  const broken = content.shortcuts.filter(shortcut => statusOf(shortcut).status === "missing").length;
  const crumbs: Folder[] = []; let cursor = current; const seen = new Set<string>();
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); crumbs.unshift(cursor); cursor = cursor.parentId ? foldersById.get(cursor.parentId) : undefined; }
  const clearRenameTimer = () => { if (renameTimer.current) clearTimeout(renameTimer.current); renameTimer.current = null; };
  useEffect(() => () => { if (renameTimer.current) clearTimeout(renameTimer.current); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (picker) pickerSearch.current?.focus(); }, [picker]);
  const focusItem = (id?: string) => { const button = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".explorer-open") ?? []).find(button => button.dataset.itemId === id); (button ?? root.current)?.focus({ preventScroll: true }); };
  const closePanels = () => { setMenu(null); setPicker(null); setPendingTarget(null); setIconItem(null); };
  function navigate(id: string | null, select: ExplorerItem[] = []) {
    clearRenameTimer(); setFolderId(id); setSelection(select); setRename(null); setQuery(""); closePanels();
    const ancestors = new Set(open); let folder = id ? foldersById.get(id) : undefined; const visited = new Set<string>();
    while (folder && !visited.has(folder.id)) { visited.add(folder.id); ancestors.add(folder.id); folder = folder.parentId ? foldersById.get(folder.parentId) : undefined; } setOpen(ancestors);
  }
  function openItem(item: ExplorerItem) { clearRenameTimer(); if (item.kind === "folder") navigate(item.id); else { setSelection([item]); closePanels(); setNotice(t("explorer.shortcutsDontNavigateWhileEditing")); } }
  function choose(item: ExplorerItem, event: MouseEvent) {
    closePanels(); setRename(null);
    if (event.ctrlKey || event.metaKey || coarse && selectMode) { setSelection(selected.some(other => other.id === item.id) ? selected.filter(other => other.id !== item.id) : [...selected, item]); return; }
    if (event.shiftKey && selected.length) { const a = items.findIndex(candidate => candidate.id === selected[0].id), b = items.findIndex(candidate => candidate.id === item.id); setSelection(items.slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1)); return; }
    if (coarse) { openItem(item); return; } setSelection([item]);
  }
  function addFolder() {
    const check = canCreateFolder(content, parentId); if (!check.ok) { setError(check.reason); return; }
    const item: Folder = { id: uid(), parentId, name: uniqueName(t("explorer.newFolder"), folders.map(folder => folder.name)), order: nextOrderIn(content.folders, parentId), visibility: "published" };
    update(current => ({ ...current, content: { ...current.content, folders: [...current.content.folders, item] } })); closePanels(); setSelection([{ kind: "folder", id: item.id }]); setRename({ kind: "folder", id: item.id });
  }
  function commitRename(item: ExplorerItem, value: string) {
    setRename(null); const trimmed = value.trim(); if (!trimmed) { setError(t("explorer.theNameCantBeBlank")); focusItem(item.id); return; }
    update(current => ({ ...current, content: item.kind === "folder" ? { ...current.content, folders: current.content.folders.map(folder => folder.id === item.id ? { ...folder, name: trimmed.slice(0, 120) } : folder) } : { ...current.content, shortcuts: current.content.shortcuts.map(shortcut => shortcut.id === item.id ? { ...shortcut, label: trimmed.slice(0, 160) } : shortcut) } })); focusItem(item.id);
  }
  function pickTarget(option: TargetOption) {
    if (!ctx.siteId || !picker) return;
    if (picker === "create") {
      const check = canCreateShortcut(content); if (!check.ok) { setError(check.reason); return; }
      const id = uid(); const shortcut = { id, parentId, label: option.label.slice(0, 160), order: nextOrderIn(content.shortcuts, parentId), visibility: "published" as const, target: { siteId: ctx.siteId, kind: option.kind, id: option.id } };
      update(current => ({ ...current, content: { ...current.content, shortcuts: [...current.content.shortcuts, shortcut] } })); setSelection([{ kind: "shortcut", id }]); setRename({ kind: "shortcut", id });
    } else {
      const existing = content.shortcuts.find(shortcut => shortcut.id === picker.id);
      if (existing?.target.kind === option.kind && existing.target.id === option.id && existing.target.siteId === ctx.siteId) {
        setPicker(null); setPendingTarget(null); setPickQuery(""); return;
      }
      update(current => ({ ...current, content: { ...current.content, shortcuts: current.content.shortcuts.map(shortcut => shortcut.id === picker.id ? { ...shortcut, target: { siteId: ctx.siteId!, kind: option.kind, id: option.id } } : shortcut) } })); setNotice(t("explorer.theShortcutNowPointsTo", { label: option.label }));
    } setPicker(null); setPendingTarget(null); setPickQuery("");
  }
  function move(list: ExplorerItem[], target: string | null) {
    const result = moveSelection(content, list, target); if (!result.ok) { if (result.reason) setError(result.reason); return false; }
    update(current => { const next = moveSelection(current.content, list, target); return next.ok ? { ...current, content: next.content } : current; });
    setNotice(t("explorer.inline.moved", { count: list.length, path: pathLabel(content.folders, target) })); setMoving(null); return true;
  }
  function paste(target = parentId) { if (move(clipboard, target)) { setSelection(clipboard); setClipboard([]); closePanels(); } }
  function cut(list = selected) { if (!list.length) return; setClipboard(list); setNotice(t("explorer.inline.cutStatus", { count: list.length })); }
  function doDelete(list: ExplorerItem[]) {
    const next = removeSelection(content, list); let back = current;
    while (back && !next.folders.some(folder => folder.id === back?.id)) back = back.parentId ? foldersById.get(back.parentId) : undefined;
    update(current => ({ ...current, content: removeSelection(current.content, list) })); setFolderId(back?.id ?? null); setSelection([]); setConfirm(null); setNotice(list.length === 1 && list[0].kind === "shortcut" ? t("explorerDialogs.aShortcutIsOnlyA") : t("explorer.inline.deleted", { count: list.length })); root.current?.focus();
  }
  function requestDelete(list = selected) { if (!list.length) return; if (list.some(item => item.kind === "folder")) { setConfirm(list); closePanels(); } else doDelete(list); }
  function duplicate(item: ExplorerItem) {
    const source = content.shortcuts.find(shortcut => shortcut.id === item.id); if (!source) return;
    const check = canCreateShortcut(content); if (!check.ok) { setError(check.reason); return; }
    const copy = { ...source, id: uid(), label: t("explorer.copy", { label: source.label }).slice(0, 160), order: nextOrderIn(content.shortcuts, source.parentId) };
    update(current => ({ ...current, content: { ...current.content, shortcuts: [...current.content.shortcuts, copy] } })); setSelection([{ kind: "shortcut", id: copy.id }]); setRename({ kind: "shortcut", id: copy.id });
  }
  function setVisibility(list: ExplorerItem[], visibility: "published" | "draft") {
    const ids = new Set(list.map(item => item.id)); update(current => ({ ...current, content: { folders: current.content.folders.map(folder => ids.has(folder.id) ? { ...folder, visibility } : folder), shortcuts: current.content.shortcuts.map(shortcut => ids.has(shortcut.id) ? { ...shortcut, visibility } : shortcut) } }));
  }
  function menuAt(event: { preventDefault(): void; stopPropagation(): void; clientX: number; clientY: number; currentTarget: EventTarget }, list: ExplorerItem[]) {
    event.preventDefault(); event.stopPropagation(); clearRenameTimer(); const bounds = root.current!.getBoundingClientRect(); origin.current = event.currentTarget as HTMLElement;
    setPicker(null); setIconItem(null); setRename(null); if (list.length) setSelection(list); setMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, items: list });
  }
  const dropProps = (target: string | null) => ({
    onDragOver: (event: DragEvent) => { if (dragging.length && moveSelection(content, dragging, target).ok) { event.preventDefault(); event.stopPropagation(); setOver(target ?? "root"); } },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null); },
    onDrop: (event: DragEvent) => { if (!dragging.length) return; event.preventDefault(); event.stopPropagation(); move(dragging, target); setDragging([]); setOver(null); },
    "data-drop": over === (target ?? "root") || undefined,
  });
  function itemKey(event: KeyboardEvent<HTMLButtonElement>, item: ExplorerItem, index: number) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const cols = Math.max(1, Math.floor((event.currentTarget.closest(".explorer-grid")?.clientWidth ?? 92) / 92));
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowDown" ? index + cols : event.key === "ArrowUp" ? index - cols : null;
    if (next !== null) { event.preventDefault(); event.stopPropagation(); const target = items[next]; if (target) { setSelection([target]); focusItem(target.id); } }
    else if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); openItem(item); }
    else if (event.key === "F2") { event.preventDefault(); event.stopPropagation(); setSelection([item]); setRename(item); }
    else if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") { const bounds = event.currentTarget.getBoundingClientRect(); menuAt({ ...event, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(), clientX: bounds.left + 12, clientY: bounds.bottom, currentTarget: event.currentTarget }, selected.some(other => other.id === item.id) ? selected : [item]); }
  }
  function rootKey(event: KeyboardEvent) {
    const nested = (event.target as Element).closest("input,textarea,select,[role=menu],[role=dialog]");
    if (!event.currentTarget.contains(event.target as Node) || event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || nested && event.currentTarget.contains(nested)) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "a") { event.preventDefault(); event.stopPropagation(); setSelection(items); }
    else if (mod && event.key.toLowerCase() === "x") { event.preventDefault(); event.stopPropagation(); cut(); }
    else if (mod && event.key.toLowerCase() === "v") { event.preventDefault(); event.stopPropagation(); if (clipboard.length) paste(); }
    else if (event.key === "Delete") { event.preventDefault(); event.stopPropagation(); requestDelete(); }
    else if (event.key === "Backspace" && current) { event.preventDefault(); event.stopPropagation(); navigate(current.parentId, [{ kind: "folder", id: current.id }]); }
    else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clearRenameTimer(); const hadOverlay = !!(picker || iconItem || menu || confirm); closePanels(); setConfirm(null); if (hadOverlay) requestAnimationFrame(() => origin.current?.focus({ preventScroll: true })); else setSelection([]); }
  }
  const menuItems: ContextMenuItem[] = [];
  const mItems = (menu?.items ?? []).filter(item => itemExists(content, item)), mOne = mItems.length === 1 ? mItems[0] : null;
  const addMenu = (id: string, label: string, onSelect: () => void, options: Partial<ContextMenuItem> = {}) => menuItems.push({ id, label, onSelect, ...options });
  if (mItems.length) {
    if (mOne) {
      addMenu("open", t("explorer.inline.open"), () => openItem(mOne), { primary: true, shortcut: "Enter" });
      addMenu("rename", t("explorer.rename"), () => setRename(mOne), { shortcut: "F2" });
      if (mOne.kind === "shortcut") { const shortcut = content.shortcuts.find(item => item.id === mOne.id); if (shortcut) addMenu("target", t(statusOf(shortcut).status === "missing" ? "explorer.repairTarget" : "explorer.changeTarget"), () => { setPickQuery(""); setPendingTarget(targetOptions.find(option => option.kind === shortcut.target.kind && option.id === shortcut.target.id) ?? null); setPicker(mOne); }); addMenu("duplicate", t("explorer.duplicateShortcut"), () => duplicate(mOne)); }
      addMenu("icon", t("explorer.inline.changeIcon"), () => setIconItem(mOne));
      addMenu("move", t("explorer.moveTo"), () => setMoving(mOne));
    }
    addMenu("cut", t("explorer.inline.cut"), () => cut(mItems), { shortcut: "Ctrl+X", separatorBefore: true });
    if (mOne?.kind === "folder" && clipboard.length) addMenu("paste", t("explorer.inline.paste", { count: clipboard.length }), () => paste(mOne.id));
    const draft = mItems.some(item => record(item)?.visibility === "draft"); addMenu("visibility", t(draft ? "explorer.makePublic" : "explorer.makeDraft"), () => setVisibility(mItems, draft ? "published" : "draft"));
    addMenu("delete", t("links.delete"), () => requestDelete(mItems), { shortcut: "Del", danger: true, separatorBefore: true });
  } else { addMenu("folder", t("explorer.newFolder2"), addFolder); addMenu("shortcut", t("explorer.createShortcut"), () => { setPickQuery(""); setPicker("create"); }); addMenu("paste", t("explorer.inline.paste", { count: clipboard.length }), () => paste(), { disabled: !clipboard.length, separatorBefore: true }); }
  const filteredTargets = targetOptions.filter(option => `${option.label} ${option.group}`.toLowerCase().includes(pickQuery.trim().toLowerCase()));
  const retarget = picker && picker !== "create" ? content.shortcuts.find(item => item.id === picker.id) : undefined;
  const pickerTitle = retarget ? t(statusOf(retarget).status === "missing" ? "explorer.repairShortcut" : "explorer.changeShortcutTarget", { label: retarget.label }) : t("explorer.createShortcut");
  const afterDelete = confirm ? removeSelection(content, confirm) : content;
  const q = query.trim().toLowerCase(); const results: ExplorerItem[] = q ? [...content.folders.filter(item => item.name.toLowerCase().includes(q)).map(item => ({ kind: "folder" as const, id: item.id })), ...content.shortcuts.filter(item => item.label.toLowerCase().includes(q)).map(item => ({ kind: "shortcut" as const, id: item.id }))] : [];
  function tree(parent: string | null, depth = 0, ancestors = new Set<string>()): React.ReactNode {
    return sortFolders(content.folders.filter(folder => folder.parentId === parent && !ancestors.has(folder.id))).map(folder => {
      const children = content.folders.some(item => item.parentId === folder.id), expanded = open.has(folder.id);
      return <div key={folder.id} role="treeitem" aria-expanded={children ? expanded : undefined} aria-selected={parentId === folder.id}>
        <div className="folder-tree-node" data-draft={folder.visibility === "draft" || undefined} style={{ paddingLeft: depth * 14 }} {...dropProps(folder.id)}>
          <button type="button" className="folder-tree-expand" aria-label={t(expanded ? "explorer.inline.collapse" : "explorer.inline.expand", { name: folder.name })} disabled={!children} onClick={() => setOpen(previous => { const next = new Set(previous); if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id); return next; })}>{children ? expanded ? "−" : "+" : ""}</button>
          <button type="button" className="folder-tree-open" aria-current={parentId === folder.id ? "page" : undefined} onClick={() => navigate(folder.id)}><span className="folder-inline-icon" aria-hidden="true" />{folder.name}</button>
        </div>{children && expanded ? <div role="group">{tree(folder.id, depth + 1, new Set([...ancestors, folder.id]))}</div> : null}
      </div>;
    });
  }
  const status = notice || (dragging.length ? t("explorer.inline.dragHint") : rename ? t("explorer.inline.renameHint") : selected.length ? t("explorer.inline.selected", { count: selected.length }) : broken ? t("explorer.inline.broken", { count: broken }) : t(coarse ? "explorer.inline.touchHint" : "explorer.inline.hint"));
  return <div ref={root} tabIndex={-1} className="explorer-shell editing folder-tree-editor" data-mobile={ctx.mobile || undefined} onKeyDown={rootKey} style={{ background: ctx.tv.face, color: ctx.tv.text }}>
    <div className="explorer-address">
      <button type="button" className="w98-btn" disabled={!current} onClick={() => navigate(current?.parentId ?? null)} {...dropProps(current?.parentId ?? null)}>{t("explorer.upOneLevel")}</button>
      <nav aria-label={t("explorer.folderPath")}><button type="button" aria-current={!current ? "page" : undefined} onClick={() => navigate(null)} {...dropProps(null)}>{rootLabel()}</button>{crumbs.map(folder => <span key={folder.id}> › <button type="button" aria-current={parentId === folder.id ? "page" : undefined} onClick={() => navigate(folder.id)} {...dropProps(folder.id)}>{folder.name}</button></span>)}</nav>
      <input type="search" aria-label={t("explorer.inline.search")} placeholder={t("explorer.typeAName")} value={query} onChange={event => setQuery(event.target.value)} />
    </div>
    <div className="explorer-authoring" role="toolbar" aria-label={t("explorer.actionsForTheSelectedItem")}>
      <button type="button" className="w98-btn" onClick={addFolder}>＋ {t("explorer.folder")}</button>
      <button type="button" className="w98-btn" aria-expanded={picker === "create"} onClick={event => { origin.current = event.currentTarget; setPickQuery(""); setPicker(picker === "create" ? null : "create"); setIconItem(null); }}>＋ {t("explorer.shortcut2")} ▾</button>
      {coarse ? <button type="button" className="w98-btn" aria-pressed={selectMode} onClick={() => setSelectMode(!selectMode)}>{t("explorer.inline.selectMode")}</button> : null}
      {selected.length ? <button type="button" className="w98-btn" aria-expanded={!!menu} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); menuAt({ ...event, preventDefault: () => event.preventDefault(), stopPropagation: () => event.stopPropagation(), clientX: bounds.left, clientY: bounds.bottom, currentTarget: event.currentTarget }, selected); }}>{t("explorer.inline.actions")}</button> : null}
      {clipboard.length ? <button type="button" className="w98-btn folder-paste" onClick={() => paste()}>{t("explorer.inline.paste", { count: clipboard.length })}</button> : null}
    </div>
    <div className="folder-workspace">
      {!ctx.mobile ? <div role="tree" aria-label={t("explorer.inline.tree")} className="folder-tree"><div role="treeitem" aria-selected={!current}><button type="button" className="folder-tree-open" aria-current={!current ? "page" : undefined} onClick={() => navigate(null)} {...dropProps(null)}>{rootLabel()}</button></div>{tree(null)}</div> : null}
      <div className="folder-items-pane" onContextMenu={event => menuAt(event, [])}>
        {q ? <div className="explorer-results" role="list" aria-label={t("explorer.searchResults")}>{results.map(item => <button type="button" role="listitem" key={item.id} onClick={() => { const value = record(item); navigate(value?.parentId ?? null, [item]); requestAnimationFrame(() => focusItem(item.id)); }}><strong>{name(item)}</strong><small>{pathLabel(content.folders, record(item)?.parentId ?? null)}</small></button>)}{!results.length ? <p>{t("explorer.inline.noResults")}</p> : null}</div> : <div className="explorer-grid" role="list" aria-label={current?.name ?? rootLabel()} onClick={event => { if (event.currentTarget === event.target) { setSelection([]); closePanels(); } }}>
          {items.map((item, index) => {
            const value = record(item)!; const isFolder = item.kind === "folder", on = selected.some(candidate => candidate.id === item.id), isRenaming = rename?.id === item.id;
            const shortcut = isFolder ? undefined : content.shortcuts.find(shortcut => shortcut.id === item.id)!;
            const missing = shortcut && statusOf(shortcut).status === "missing";
            const count = isFolder ? content.folders.filter(folder => folder.parentId === item.id).length + content.shortcuts.filter(shortcut => shortcut.parentId === item.id).length : 0;
            return <div key={item.id} role="listitem" className={`explorer-item${on ? " selected" : ""}`} data-item={item.id} data-draft={value.visibility === "draft" || undefined} data-cut={clipboard.some(candidate => candidate.id === item.id) || dragging.some(candidate => candidate.id === item.id) || undefined} draggable={!isRenaming}
              onDragStart={event => { const moving = on ? selected : [item]; setDragging(moving); setSelection(moving); closePanels(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", moving.map(item => item.id).join(",")); }} onDragEnd={() => { setDragging([]); setOver(null); }} {...(isFolder ? dropProps(item.id) : {})} onContextMenu={event => menuAt(event, on ? selected : [item])}>
              <button type="button" className="explorer-open" data-item-id={item.id} aria-label={name(item)} aria-pressed={on} onClick={event => choose(item, event)} onDoubleClick={() => { if (!coarse) openItem(item); }} onKeyDown={event => itemKey(event, item, index)}>
                <span className={`explorer-icon${isFolder && !value.icon ? " folder-inline-icon" : ""}`} aria-hidden="true">{value.icon ? <Icon name={value.icon} size={36} /> : !isFolder ? GLYPH[shortcut!.target.kind] : null}{!isFolder ? <i className="explorer-arrow">↗</i> : null}{missing ? <b className="folder-broken">!</b> : null}</span>
                {!isRenaming ? <strong onClick={event => { if (on && !coarse && selected.length === 1 && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.detail === 1) { event.stopPropagation(); clearRenameTimer(); renameTimer.current = setTimeout(() => setRename(item), 450); } }}>{name(item)}</strong> : null}
              </button>
              {isRenaming ? <RenameInput value={name(item)} label={t(isFolder ? "explorer.folderName" : "explorer.shortcutName")} onCommit={value => commitRename(item, value)} onCancel={() => { setRename(null); focusItem(item.id); }} /> : null}
              <small className="explorer-desc" data-broken={missing || undefined}>{value.visibility === "draft" ? `${t("explorer.draft")} · ` : ""}{isFolder ? t("explorer.folderItems", { v1: count }) : missing ? t("explorer.targetIsNoLongerAvailable") : statusOf(shortcut!).status === "ok" ? `${statusOf(shortcut!).kindLabel}：${statusOf(shortcut!).name}` : t("explorer.shortcut", { kindLabel: statusOf(shortcut!).kindLabel })}</small>
            </div>;
          })}{!items.length ? <p className="explorer-empty">{t("explorer.folderEmpty")}</p> : null}
        </div>}
      </div>
    </div>
    {confirm ? <div className="folder-delete-confirm" role="alertdialog" aria-label={t("links.delete")}><p>{t("explorer.inline.confirmDelete", { folders: content.folders.length - afterDelete.folders.length, shortcuts: content.shortcuts.length - afterDelete.shortcuts.length })}</p><ul>{content.folders.filter(folder => !afterDelete.folders.some(kept => kept.id === folder.id)).slice(0, 6).map(folder => <li key={folder.id}>{folder.name}</li>)}{content.shortcuts.filter(shortcut => !afterDelete.shortcuts.some(kept => kept.id === shortcut.id)).slice(0, 6).map(shortcut => <li key={shortcut.id}>{shortcut.label}</li>)}</ul><p>{t("explorerDialogs.aShortcutIsOnlyA")}</p><button type="button" className="w98-btn danger" onClick={() => doDelete(confirm)}>{t("links.delete")}</button><button type="button" className="w98-btn" autoFocus onClick={() => { setConfirm(null); focusItem(one?.id); }}>{t("iconPicker.cancel")}</button></div> : null}
    <EditorStatusBar className="explorer-status" tv={ctx.tv} mobile={ctx.mobile} message={status} count={t("explorer.inline.count", { count: items.length })} />
    <InlineErrorBanner tv={ctx.tv} mobile={ctx.mobile} message={error} onClose={() => setError("")} />
    <PopoverPanel open={!!picker} onClose={() => { setPicker(null); setPendingTarget(null); }} triggerRef={origin} scopeRef={root} floating tv={ctx.tv} mobile={ctx.mobile} label={pickerTitle} doneLabel={t("iconPicker.cancel")} className="folder-target-panel">
      <input ref={pickerSearch} type="search" className="w98-input" value={pickQuery} aria-label={t("explorer.inline.searchTarget")} placeholder={t("explorer.inline.searchTarget")} onChange={event => setPickQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229 && filteredTargets[0]) { event.preventDefault(); event.stopPropagation(); setPendingTarget(filteredTargets[0]); } }} />
      <div className="folder-target-list" role="listbox" aria-label={t("explorer.inline.searchTarget")}>{(["window", "profile", "post"] as const).map(kind => <section key={kind}>{filteredTargets.some(option => option.kind === kind) ? <strong>{kind === "profile" ? "OC" : t(kind === "window" ? "explorer.window" : "explorer.post")}</strong> : null}{filteredTargets.filter(option => option.kind === kind).map(option => <button type="button" role="option" key={option.id} aria-selected={pendingTarget ? pendingTarget.kind === option.kind && pendingTarget.id === option.id : retarget?.target.kind === option.kind && retarget.target.id === option.id} onClick={() => setPendingTarget(option)} onDoubleClick={() => pickTarget(option)}>{GLYPH[kind]} {option.label}</button>)}</section>)}{!filteredTargets.length ? <p>{t("explorer.inline.noResults")}</p> : null}</div>
      <p role="status">{pendingTarget ? t("navigationTargets.selected", { group: pendingTarget.group, label: pendingTarget.label }) : retarget ? t("explorer.changeTargetHint") : t("explorer.theShortcutWillBePlaced", { v1: pathLabel(content.folders, parentId) })}</p>
      <button type="button" className="w98-btn folder-target-apply" disabled={!pendingTarget} onClick={() => pendingTarget && pickTarget(pendingTarget)}>{t(picker === "create" ? "explorer.createShortcut" : "explorer.pointToThis")}</button>
    </PopoverPanel>
    <PopoverPanel open={!!iconItem} onClose={() => setIconItem(null)} triggerRef={origin} scopeRef={root} floating tv={ctx.tv} mobile={ctx.mobile} label={t("explorer.inline.changeIcon")} className="folder-target-panel">{iconItem && record(iconItem) ? <IconPickerAction mediaTarget={{ windowId: window.id, windowType: "explorer", itemId: iconItem.id, itemKind: iconItem.kind }} siteId={ctx.siteId} upload={ctx.upload} value={record(iconItem)?.icon ?? ""} defaultValue="" defaultPreview={iconItem.kind === "folder" ? "folder" : "link"} label={name(iconItem)} onChange={icon => update(current => ({ ...current, content: iconItem.kind === "folder" ? { ...current.content, folders: current.content.folders.map(folder => folder.id === iconItem.id ? { ...folder, icon: icon || undefined } : folder) } : { ...current.content, shortcuts: current.content.shortcuts.map(shortcut => shortcut.id === iconItem.id ? { ...shortcut, icon: icon || undefined } : shortcut) } }))} /> : null}</PopoverPanel>
    {menu ? <ContextMenu tv={ctx.tv} mobile={ctx.mobile} items={menuItems} label={t("explorer.inline.actions")} position={menu} containerRef={root} returnFocusRef={origin} onClose={() => setMenu(null)} /> : null}
    {moving ? <MoveDialog itemName={name(moving)} kindLabel={t(moving.kind === "folder" ? "explorer.folder" : "explorer.shortcut2")} options={moveOptions(content, moving)} onPick={id => move([moving], id)} onClose={() => setMoving(null)} /> : null}
  </div>;
}
