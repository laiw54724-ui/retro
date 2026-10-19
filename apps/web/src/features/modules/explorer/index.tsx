import { targetCatalog } from "../../navigation/targetCatalog";
import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleProps } from "../types";
import { Icon } from "../../../components/Icon";
import { IconPickerAction } from "../links/IconPicker";

import { DeleteFolderDialog, MoveDialog, TargetPickerDialog } from "./ExplorerDialogs";
import {
  rootLabel, canCreateFolder, canCreateShortcut, deleteImpact, moveItem, moveOptions, nextOrderIn, pathLabel, removeFolder,
  sortFolders, sortShortcuts, targetStatus, uniqueName, type ExplorerContent, type Folder, type Shortcut, type TargetOption
} from "./explorerModel";

type Item = { kind: "folder"; id: string } | { kind: "shortcut"; id: string };
type DialogState = { type: "create-shortcut" } | { type: "retarget"; shortcutId: string } | { type: "move"; item: Item } | { type: "delete"; folderId: string } | null;

const newId = () => globalThis.crypto?.randomUUID?.() ?? `explorer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const GLYPH = { window: "▣", profile: "☺", post: "▧" } as const;

function useCoarsePointer(forced: boolean) {
  const [coarse, setCoarse] = useState(() => forced || (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches));
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const query = matchMedia("(pointer: coarse)");
    const update = () => setCoarse(forced || query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [forced]);
  return coarse;
}

/** Focus after the commit, so it also works right after a modal released the inert page. */
function RenameInput({ label, value, onCommit, onCancel }: { label: string; value: string; onCommit: (value: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const take = () => { ref.current?.focus(); ref.current?.select(); };
    take();
    // Passive effects run unmounts before mounts, so a closing modal has already released the page; retry once as a safety net.
    const frame = requestAnimationFrame(() => { if (globalThis.document.activeElement !== ref.current) take(); });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <input
      ref={ref}
      className="explorer-rename"
      aria-label={label}
      defaultValue={value}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
      }}
    />
  );
}

function ExplorerBrowser({ window, ctx, update, editing }: ModuleProps<"explorer"> & { editing: boolean }) {
  const { t: tr } = useTranslation("modules");
  const visit = !editing ? ctx.navigation?.visitor : undefined;
  const restored = visit?.explorer[window.id];
  const [folderId, setFolderId] = useState<string | null>(() => restored?.folderId && window.content.folders.some((folder) => folder.id === restored.folderId) ? restored.folderId : null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState(restored?.query ?? "");
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState<Item | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const actionBar = useRef<HTMLDivElement | null>(null);
  const targetButton = useRef<HTMLButtonElement | null>(null);
  const idPrefix = useId();
  const coarse = useCoarsePointer(ctx.mobile);
  const content = window.content;
  useEffect(() => { if (visit) visit.explorer[window.id] = { folderId, query }; }, [visit, window.id, folderId, query]);
  const foldersById = useMemo(() => new Map(content.folders.map((folder) => [folder.id, folder])), [content.folders]);
  const active = folderId ? foldersById.get(folderId) ?? null : null;
  const setContent = (next: ExplorerContent, key?: string) => update((current) => ({ ...current, content: next }), key);

  // If the folder being viewed disappears (undo, delete elsewhere), fall back to the desktop.
  useEffect(() => { if (folderId && !foldersById.has(folderId)) setFolderId(null); }, [folderId, foldersById]);
  useEffect(() => {
    if (!selected) return;
    const exists = selected.kind === "folder" ? foldersById.has(selected.id) : content.shortcuts.some((shortcut) => shortcut.id === selected.id);
    if (!exists) { setSelected(null); setRenamingId(null); }
  }, [selected, foldersById, content.shortcuts]);

  const breadcrumbs = useMemo(() => {
    const result: Folder[] = []; let cursor = active; const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) { result.unshift(cursor); seen.add(cursor.id); cursor = cursor.parentId ? foldersById.get(cursor.parentId) ?? null : null; }
    return result;
  }, [active, foldersById]);
  const folders = sortFolders(content.folders.filter((folder) => folder.parentId === folderId));
  const shortcuts = sortShortcuts(content.shortcuts.filter((shortcut) => shortcut.parentId === folderId));
  const search = query.trim().toLowerCase();
  const searchResults = search ? content.shortcuts.filter((shortcut) => shortcut.label.toLowerCase().includes(search)) : [];

  const targetOptions: TargetOption[] = useMemo(() => targetCatalog({ siteId: ctx.navigationSiteId ?? ctx.siteId ?? null, windows: ctx.windows, profiles: ctx.profileDirectory ?? [] }, { window: tr("explorer.window"), profile: "OC", post: tr("explorer.post") }, window.id), [ctx.windows, ctx.profileDirectory, ctx.navigationSiteId, ctx.siteId, window.id, tr]);
  // Only call a shortcut broken when the host actually told us what exists; otherwise we cannot know.
  const canVerify = { window: ctx.windows.length > 0, profile: !!ctx.profileDirectory, post: !!ctx.profileDirectory };
  const statusOf = (shortcut: Shortcut) => targetStatus(shortcut.target, targetOptions, canVerify);
  const folderItemCount = (id: string) => content.folders.filter((folder) => folder.parentId === id).length + content.shortcuts.filter((shortcut) => shortcut.parentId === id).length;

  // ---- actions ----
  function select(item: Item | null) { setSelected(item); if (renamingId && renamingId !== item?.id) setRenamingId(null); }
  function addFolder() {
    const check = canCreateFolder(content, folderId);
    if (!check.ok) { setStatus(check.reason); return; }
    const siblings = content.folders.filter((folder) => folder.parentId === folderId).map((folder) => folder.name);
    const folder: Folder = { id: newId(), parentId: folderId, name: uniqueName(tr("explorer.newFolder"), siblings), order: nextOrderIn(content.folders, folderId), visibility: "published" };
    setContent({ ...content, folders: [...content.folders, folder] });
    setStatus(tr("explorer.folderAddedTypeAName"));
    setSelected({ kind: "folder", id: folder.id });
    setRenamingId(folder.id);
  }
  function createShortcut(option: TargetOption) {
    const check = canCreateShortcut(content);
    if (!check.ok) { setStatus(check.reason); setDialog(null); return; }
    if (!ctx.siteId) { setDialog(null); return; }
    const shortcut: Shortcut = { id: newId(), parentId: folderId, label: option.label.slice(0, 160), order: nextOrderIn(content.shortcuts, folderId), visibility: "published", target: { siteId: ctx.siteId, id: option.id, kind: option.kind } };
    setContent({ ...content, shortcuts: [...content.shortcuts, shortcut] });
    setDialog(null);
    setStatus(tr("explorer.shortcutCreatedYouCanRename"));
    setSelected({ kind: "shortcut", id: shortcut.id });
    setRenamingId(shortcut.id);
  }
  function duplicateShortcut(shortcut: Shortcut) {
    const check = canCreateShortcut(content);
    if (!check.ok) { setStatus(check.reason); return; }
    const copy: Shortcut = { ...shortcut, id: newId(), label: tr("explorer.copy", { label: shortcut.label }).slice(0, 160), order: nextOrderIn(content.shortcuts, shortcut.parentId) };
    setContent({ ...content, shortcuts: [...content.shortcuts, copy] });
    setSelected({ kind: "shortcut", id: copy.id });
    setRenamingId(copy.id);
    setStatus(tr("explorer.duplicateShortcutCreatedItPoints"));
  }
  function closeTargetPicker() {
    setDialog(null);
    requestAnimationFrame(() => targetButton.current?.focus());
  }
  function changeShortcutTarget(shortcutId: string, option: TargetOption) {
    if (!ctx.siteId) return;
    const current = content.shortcuts.find((shortcut) => shortcut.id === shortcutId);
    if (!current) { closeTargetPicker(); return; }
    if (current.target.siteId === ctx.siteId && current.target.kind === option.kind && current.target.id === option.id) { closeTargetPicker(); return; }
    setContent({ ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === shortcutId ? { ...shortcut, target: { siteId: ctx.siteId!, id: option.id, kind: option.kind } } : shortcut) });
    closeTargetPicker();
    setStatus(tr("explorer.theShortcutNowPointsTo", { label: option.label }));
  }
  function commitRename(item: Item, value: string) {
    setRenamingId(null);
    const name = value.trim();
    const current = item.kind === "folder" ? foldersById.get(item.id)?.name : content.shortcuts.find((shortcut) => shortcut.id === item.id)?.label;
    if (!name) { setStatus(tr("explorer.theNameCantBeBlank")); return; }
    if (name === current) return;
    if (item.kind === "folder") setContent({ ...content, folders: content.folders.map((folder) => folder.id === item.id ? { ...folder, name: name.slice(0, 120) } : folder) });
    else setContent({ ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === item.id ? { ...shortcut, label: name.slice(0, 160) } : shortcut) });
  }
  function move(item: Item, parentId: string | null) {
    const result = moveItem(content, item, parentId);
    if (!result.ok) { setStatus(result.reason); return; }
    setContent(result.content);
    setDialog(null);
    const name = item.kind === "folder" ? foldersById.get(item.id)?.name : content.shortcuts.find((shortcut) => shortcut.id === item.id)?.label;
    setStatus(tr("explorer.movedTo", { name, v2: pathLabel(content.folders, parentId) }));
  }
  function deleteShortcut(shortcut: Shortcut) {
    setContent({ ...content, shortcuts: content.shortcuts.filter((item) => item.id !== shortcut.id) });
    setSelected(null);
    setStatus(tr("explorer.deletedTheShortcutTheOriginal", { label: shortcut.label }));
  }
  function setIcon(item: Item, icon: string) {
    const next = icon || undefined;
    update((current) => ({ ...current, content: item.kind === "folder"
      ? { ...current.content, folders: current.content.folders.map((folder) => folder.id === item.id ? { ...folder, icon: next } : folder) }
      : { ...current.content, shortcuts: current.content.shortcuts.map((shortcut) => shortcut.id === item.id ? { ...shortcut, icon: next } : shortcut) }
    }));
  }

  function setVisibility(item: Item, visibility: "published" | "draft") {
    if (item.kind === "folder") setContent({ ...content, folders: content.folders.map((folder) => folder.id === item.id ? { ...folder, visibility } : folder) });
    else setContent({ ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === item.id ? { ...shortcut, visibility } : shortcut) });
  }
  function openShortcut(shortcut: Shortcut) {
    if (editing) { setStatus(tr("explorer.shortcutsDontNavigateWhileEditing")); return; }
    const state = statusOf(shortcut);
    if (state.status === "missing") { setStatus(tr("explorer.thisShortcutsTargetNoLonger")); return; }
    // Legacy public v1 has no site namespace; retain its source-local window callback only.
    if (!ctx.navigationSiteId && shortcut.target.kind === "window") { ctx.onLink({ target: "window", windowId: shortcut.target.id }); return; }
    const result = ctx.onNavigate?.(shortcut.target);
    if (!result?.ok) setStatus(tr("navigationTargets.unavailable"));
  }
  function openItem(item: Item) {
    if (item.kind === "folder") { setFolderId(item.id); setSelected(null); setStatus(""); return; }
    const shortcut = content.shortcuts.find((candidate) => candidate.id === item.id);
    if (shortcut) openShortcut(shortcut);
  }
  function activate(item: Item) {
    // Visitors and touch screens open on a single tap; authors on a mouse select first (double-click or Enter opens).
    if (!editing || coarse) openItem(item);
    else select(item);
  }
  function onItemKey(event: KeyboardEvent<HTMLButtonElement>, item: Item) {
    if (event.key === "Enter") { event.preventDefault(); openItem(item); return; }
    if (!editing) return;
    if (event.key === "F2") { event.preventDefault(); select(item); setRenamingId(item.id); }
    else if (event.key === "Delete") { event.preventDefault(); requestDelete(item); }
  }
  function requestDelete(item: Item) {
    if (item.kind === "folder") setDialog({ type: "delete", folderId: item.id });
    else { const shortcut = content.shortcuts.find((candidate) => candidate.id === item.id); if (shortcut) deleteShortcut(shortcut); }
  }
  function showActions(item: Item) {
    select(item);
    requestAnimationFrame(() => actionBar.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }

  // ---- drag a tile onto a folder, the path bar or "上一層" ----
  const canDrop = (target: string | null) => !!dragging && moveOptions(content, dragging).some((option) => option.id === target && !option.disabled && !option.current);
  function dropOnto(target: string | null, event: DragEvent) {
    event.preventDefault();
    const item = dragging;
    setDragging(null);
    setDropOver(null);
    if (item) move(item, target);
  }
  const dropProps = (target: string | null) => editing ? {
    onDragOver: (event: DragEvent) => { if (canDrop(target)) { event.preventDefault(); setDropOver(target ?? "root"); } },
    onDragLeave: () => setDropOver((current) => current === (target ?? "root") ? null : current),
    onDrop: (event: DragEvent) => dropOnto(target, event)
  } : {};

  const selectedFolder = selected?.kind === "folder" ? foldersById.get(selected.id) : undefined;
  const selectedShortcut = selected?.kind === "shortcut" ? content.shortcuts.find((shortcut) => shortcut.id === selected.id) : undefined;
  const selectedStatus = selectedShortcut ? statusOf(selectedShortcut) : null;
  const retargeting = dialog?.type === "retarget" ? content.shortcuts.find((shortcut) => shortcut.id === dialog.shortcutId) : undefined;
  const repairing = retargeting && statusOf(retargeting).status === "missing";
  const moving = dialog?.type === "move" ? dialog.item : null;
  const movingName = moving ? (moving.kind === "folder" ? foldersById.get(moving.id)?.name : content.shortcuts.find((shortcut) => shortcut.id === moving.id)?.label) ?? "" : "";

  function renderTile(item: Item, name: string, summary: string, opts: { glyph: string; icon?: string; shortcut?: boolean; broken?: boolean; draft?: boolean }) {
    const isSelected = editing && selected?.id === item.id;
    const renaming = renamingId === item.id;
    const descId = `${idPrefix}-${item.id}`;
    return (
      <div
        key={item.id}
        role="listitem"
        className={`explorer-item${isSelected ? " selected" : ""}${opts.broken ? " broken" : ""}${item.kind === "folder" && dropOver === item.id ? " drop" : ""}`}
        draggable={editing && !renaming}
        onDragStart={(event) => { setDragging(item); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }}
        onDragEnd={() => { setDragging(null); setDropOver(null); }}
        {...(item.kind === "folder" ? dropProps(item.id) : {})}
      >
        <button
          type="button"
          className="explorer-open"
          data-navigation-focus={`explorer:${window.id}:${item.kind}:${item.id}`}
          aria-label={name}
          aria-describedby={descId}
          aria-pressed={editing ? isSelected : undefined}
          onClick={() => activate(item)}
          onDoubleClick={() => { if (editing && !coarse) openItem(item); }}
          onKeyDown={(event) => onItemKey(event, item)}
        >
          <span className="explorer-icon" aria-hidden="true">{opts.icon ? <Icon name={opts.icon} size={36} /> : opts.glyph}{opts.shortcut ? <i className="explorer-arrow">↗</i> : null}</span>
          {renaming ? null : <strong>{name}</strong>}
        </button>
        {renaming ? <RenameInput label={item.kind === "folder" ? tr("explorer.folderName") : tr("explorer.shortcutName")} value={name} onCommit={(value) => commitRename(item, value)} onCancel={() => setRenamingId(null)} /> : null}
        <small id={descId} className="explorer-desc">{opts.draft ? tr("explorer.draft") : ""}{summary}</small>
        {editing ? <button type="button" className="explorer-more" aria-label={tr("explorer.actionsFor", { name })} onClick={() => showActions(item)}>⋯</button> : null}
      </div>
    );
  }

  return (
    <div className={`explorer-shell${editing ? " editing" : ""}${coarse ? " touch" : ""}`}>
      <div className="explorer-address">
        <button type="button" className={`w98-btn${dropOver === "up" ? " drop" : ""}`} disabled={!active} onClick={() => { setFolderId(active?.parentId ?? null); setSelected(null); }} {...dropProps(active?.parentId ?? null)}>{tr("explorer.upOneLevel")}</button>
        <nav aria-label={tr("explorer.folderPath")}>
          <button type="button" className={dropOver === "root" ? "drop" : ""} aria-current={!active ? "page" : undefined} onClick={() => { setFolderId(null); setSelected(null); }} {...dropProps(null)}>{rootLabel()}</button>
          {breadcrumbs.map((folder, index) => <span key={folder.id}> / <button type="button" className={dropOver === folder.id ? "drop" : ""} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} onClick={() => { setFolderId(folder.id); setSelected(null); }} {...dropProps(folder.id)}>{folder.name}</button></span>)}
        </nav>
      </div>
      <label className="explorer-search">{tr("explorer.searchShortcuts")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("explorer.typeAName")} /></label>

      {editing ? (
        <>
          <div className="explorer-authoring">
            <button type="button" className="w98-btn" onClick={addFolder}>{tr("explorer.newFolder2")}</button>
            <button type="button" className="w98-btn" onClick={() => setDialog({ type: "create-shortcut" })}>{tr("explorer.createShortcut")}</button>
          </div>
          <p className="w98-hint explorer-scope">{tr("explorer.foldersExistOnlyInThis")}</p>
        </>
      ) : null}

      {search ? (
        <ul className="explorer-results" aria-label={tr("explorer.searchResults")}>{searchResults.map((shortcut) => <li key={shortcut.id}><button type="button" data-navigation-focus={`explorer:${window.id}:shortcut:${shortcut.id}`} onClick={() => openShortcut(shortcut)}>▣ {shortcut.label}</button><small>{pathLabel(content.folders, shortcut.parentId)}</small></li>)}</ul>
      ) : (
        <div className="explorer-grid" role="list" aria-label={active?.name ?? rootLabel()} onClick={(event) => { if (event.target === event.currentTarget) select(null); }}>
          {folders.map((folder) => renderTile({ kind: "folder", id: folder.id }, folder.name, tr("explorer.folderItems", { v1: folderItemCount(folder.id) }), { glyph: "📁", icon: folder.icon, draft: folder.visibility === "draft" }))}
          {shortcuts.map((shortcut) => {
            const state = statusOf(shortcut);
            return renderTile({ kind: "shortcut", id: shortcut.id }, shortcut.label, state.status === "missing" ? tr("explorer.targetIsNoLongerAvailable") : state.status === "ok" ? `${state.kindLabel}：${state.name}` : tr("explorer.shortcut", { kindLabel: state.kindLabel }), { glyph: GLYPH[shortcut.target.kind], icon: shortcut.icon, shortcut: true, broken: state.status === "missing", draft: shortcut.visibility === "draft" });
          })}
          {!folders.length && !shortcuts.length ? <p className="explorer-empty">{tr("explorer.folderEmpty")}{editing ? " " + tr("explorer.useNewFolderOrCreate") : ""}</p> : null}
        </div>
      )}

      <div className="explorer-footer">
        <p className="explorer-status" role="status" aria-live="polite" hidden={!status}>{status}</p>
        {editing ? (
          <>
            {selected && (selectedFolder || selectedShortcut) ? (
              <div ref={actionBar} className="explorer-actions" role="toolbar" aria-label={tr("explorer.actionsForTheSelectedItem")}>
                <span className="explorer-selected">{tr("explorer.selected")}<strong>{selectedFolder?.name ?? selectedShortcut?.label}</strong>{selectedShortcut && selectedStatus ? <small>{selectedStatus.status === "missing" ? tr("explorer.targetIsNoLongerAvailable") : selectedStatus.status === "ok" ? `${selectedStatus.kindLabel}：${selectedStatus.name}` : tr("explorer.shortcut", { kindLabel: selectedStatus.kindLabel })}</small> : <small>{tr("explorer.folder")}</small>}</span>
                <button type="button" className="w98-btn" onClick={() => setRenamingId(selected.id)}>{tr("explorer.rename")}</button>
                <IconPickerAction key={`${window.id}:${selected.kind}:${selected.id}`} mediaTarget={{ windowId: window.id, windowType: "explorer", itemId: selected.id, itemKind: selected.kind }} siteId={ctx.siteId} upload={ctx.upload} value={(selectedFolder ?? selectedShortcut)?.icon ?? ""} defaultValue="" defaultPreview={selectedFolder ? "folder" : "link"} label={selectedFolder?.name ?? selectedShortcut?.label} onChange={(icon) => setIcon(selected, icon)} />
                <button type="button" className="w98-btn" onClick={() => setDialog({ type: "move", item: selected })}>{tr("explorer.moveTo")}</button>
                {selectedShortcut ? <button type="button" className="w98-btn" onClick={() => duplicateShortcut(selectedShortcut)}>{tr("explorer.duplicateShortcut")}</button> : null}
                {selectedShortcut ? <button ref={targetButton} type="button" className={`w98-btn${selectedStatus?.status === "missing" ? " primary" : ""}`} onClick={() => setDialog({ type: "retarget", shortcutId: selectedShortcut.id })}>{tr(selectedStatus?.status === "missing" ? "explorer.repairTarget" : "explorer.changeTarget")}</button> : null}
                <button type="button" className="w98-btn" onClick={() => setVisibility(selected, (selectedFolder ?? selectedShortcut)?.visibility === "draft" ? "published" : "draft")}>{(selectedFolder ?? selectedShortcut)?.visibility === "draft" ? tr("explorer.makePublic") : tr("explorer.makeDraft")}</button>
                <button type="button" className="w98-btn danger" onClick={() => requestDelete(selected)}>{tr("links.delete")}</button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {dialog?.type === "create-shortcut" ? <TargetPickerDialog title={tr("explorer.createShortcut")} hint={tr("explorer.theShortcutWillBePlaced", { v1: pathLabel(content.folders, folderId) })} confirmLabel={tr("explorer.createShortcut")} options={targetOptions} onPick={createShortcut} onClose={() => setDialog(null)} /> : null}
      {retargeting ? <TargetPickerDialog title={tr(repairing ? "explorer.repairShortcut" : "explorer.changeShortcutTarget", { label: retargeting.label })} hint={tr(repairing ? "explorer.theOriginalTargetNoLonger" : "explorer.changeTargetHint")} confirmLabel={tr("explorer.pointToThis")} options={targetOptions} initialTarget={retargeting.target} onPick={(option) => changeShortcutTarget(retargeting.id, option)} onClose={closeTargetPicker} /> : null}
      {moving ? <MoveDialog itemName={movingName} kindLabel={moving.kind === "folder" ? tr("explorer.folder") : tr("explorer.shortcut2")} options={moveOptions(content, moving)} onPick={(parentId) => move(moving, parentId)} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "delete" && foldersById.get(dialog.folderId) ? (
        <DeleteFolderDialog
          folder={foldersById.get(dialog.folderId)!}
          folders={content.folders}
          impact={deleteImpact(content, dialog.folderId)}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const target = foldersById.get(dialog.folderId)!;
            const removedViewed = !!folderId && (folderId === target.id || deleteImpact(content, target.id).folders.some((item) => item.id === folderId));
            setContent(removeFolder(content, target.id));
            setDialog(null);
            setSelected(null);
            if (removedViewed) setFolderId(target.parentId);
            setStatus(tr("explorer.deletedTheFolderTheOriginal", { name: target.name }));
          }}
        />
      ) : null}
    </div>
  );
}

export function ExplorerView(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing={false} />; }
export function ExplorerInlineEditor(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing />; }
