import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { ModuleProps } from "../types";
import { buildPublicEntityUrl } from "../../../lib/publicShare";
import { DeleteFolderDialog, MoveDialog, TargetPickerDialog } from "./ExplorerDialogs";
import {
  ROOT_LABEL, canCreateFolder, canCreateShortcut, deleteImpact, moveItem, moveOptions, nextOrderIn, pathLabel, removeFolder,
  sortFolders, sortShortcuts, targetStatus, uniqueName, type ExplorerContent, type Folder, type Shortcut, type TargetOption
} from "./explorerModel";

type Item = { kind: "folder"; id: string } | { kind: "shortcut"; id: string };
type DialogState = { type: "create-shortcut" } | { type: "repair"; shortcutId: string } | { type: "move"; item: Item } | { type: "delete"; folderId: string } | null;

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
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState<Item | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const actionBar = useRef<HTMLDivElement | null>(null);
  const idPrefix = useId();
  const coarse = useCoarsePointer(ctx.mobile);
  const content = window.content;
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

  const targetOptions: TargetOption[] = useMemo(() => [
    ...ctx.windows.filter((candidate) => candidate.id !== window.id).map((candidate) => ({ kind: "window" as const, id: candidate.id, label: candidate.title || "（未命名視窗）", group: "視窗" })),
    ...(ctx.profileDirectory ?? []).flatMap((entry) => [
      { kind: "profile" as const, id: entry.id, label: entry.profile.name || entry.profile.username, group: "OC" },
      ...entry.posts.map((post) => ({ kind: "post" as const, id: post.id, label: `${entry.profile.name || entry.profile.username}：${post.title || post.caption || post.id}`, group: "貼文" }))
    ])
  ], [ctx.windows, ctx.profileDirectory, window.id]);
  const canVerify = { window: true, profile: !!ctx.profileDirectory, post: !!ctx.profileDirectory };
  const statusOf = (shortcut: Shortcut) => targetStatus(shortcut.target, targetOptions, canVerify);
  const folderItemCount = (id: string) => content.folders.filter((folder) => folder.parentId === id).length + content.shortcuts.filter((shortcut) => shortcut.parentId === id).length;

  // ---- actions ----
  function select(item: Item | null) { setSelected(item); if (renamingId && renamingId !== item?.id) setRenamingId(null); }
  function addFolder() {
    const check = canCreateFolder(content, folderId);
    if (!check.ok) { setStatus(check.reason); return; }
    const siblings = content.folders.filter((folder) => folder.parentId === folderId).map((folder) => folder.name);
    const folder: Folder = { id: newId(), parentId: folderId, name: uniqueName("新資料夾", siblings), order: nextOrderIn(content.folders, folderId), visibility: "published" };
    setContent({ ...content, folders: [...content.folders, folder] });
    setStatus(`已新增資料夾，請輸入名稱。`);
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
    setStatus("已建立捷徑，可以直接改名。");
    setSelected({ kind: "shortcut", id: shortcut.id });
    setRenamingId(shortcut.id);
  }
  function duplicateShortcut(shortcut: Shortcut) {
    const check = canCreateShortcut(content);
    if (!check.ok) { setStatus(check.reason); return; }
    const copy: Shortcut = { ...shortcut, id: newId(), label: `${shortcut.label} 副本`.slice(0, 160), order: nextOrderIn(content.shortcuts, shortcut.parentId) };
    setContent({ ...content, shortcuts: [...content.shortcuts, copy] });
    setSelected({ kind: "shortcut", id: copy.id });
    setRenamingId(copy.id);
    setStatus("已建立副本捷徑；它和原本的捷徑指向同一個內容。");
  }
  function repairShortcut(shortcutId: string, option: TargetOption) {
    if (!ctx.siteId) return;
    setContent({ ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === shortcutId ? { ...shortcut, target: { siteId: ctx.siteId!, id: option.id, kind: option.kind } } : shortcut) });
    setDialog(null);
    setStatus(`已把捷徑改指向「${option.label}」。`);
  }
  function commitRename(item: Item, value: string) {
    setRenamingId(null);
    const name = value.trim();
    const current = item.kind === "folder" ? foldersById.get(item.id)?.name : content.shortcuts.find((shortcut) => shortcut.id === item.id)?.label;
    if (!name) { setStatus("名稱不能空白，已保留原本的名稱。"); return; }
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
    setStatus(`已把「${name}」移到「${pathLabel(content.folders, parentId)}」。`);
  }
  function deleteShortcut(shortcut: Shortcut) {
    setContent({ ...content, shortcuts: content.shortcuts.filter((item) => item.id !== shortcut.id) });
    setSelected(null);
    setStatus(`已刪除捷徑「${shortcut.label}」。原本的內容沒有被刪除，可以用「復原」找回。`);
  }
  function setVisibility(item: Item, visibility: "published" | "draft") {
    if (item.kind === "folder") setContent({ ...content, folders: content.folders.map((folder) => folder.id === item.id ? { ...folder, visibility } : folder) });
    else setContent({ ...content, shortcuts: content.shortcuts.map((shortcut) => shortcut.id === item.id ? { ...shortcut, visibility } : shortcut) });
  }
  function openShortcut(shortcut: Shortcut) {
    if (editing) { setStatus("編輯時不會跳轉；用上方的「▶ 訪客預覽」測試捷徑。"); return; }
    const state = statusOf(shortcut);
    if (state.status === "missing") { setStatus("這個捷徑的目標已經不存在。"); return; }
    if (shortcut.target.kind === "window") { ctx.onLink({ target: "window", windowId: shortcut.target.id, label: shortcut.label }); return; }
    if (ctx.publicShareBaseUrl) {
      const base = new URL(ctx.publicShareBaseUrl, globalThis.location.origin);
      const handle = decodeURIComponent(base.pathname.replace(/^\/@/, "").split("/")[0] ?? "");
      globalThis.location.assign(buildPublicEntityUrl(base.origin, handle, shortcut.target.kind === "profile" ? "oc" : "post", shortcut.target.id));
      return;
    }
    if (shortcut.target.kind === "profile") ctx.onProfileSelect?.(shortcut.target.id);
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
  const repairing = dialog?.type === "repair" ? content.shortcuts.find((shortcut) => shortcut.id === dialog.shortcutId) : undefined;
  const moving = dialog?.type === "move" ? dialog.item : null;
  const movingName = moving ? (moving.kind === "folder" ? foldersById.get(moving.id)?.name : content.shortcuts.find((shortcut) => shortcut.id === moving.id)?.label) ?? "" : "";

  function renderTile(item: Item, name: string, summary: string, opts: { glyph: string; shortcut?: boolean; broken?: boolean; draft?: boolean }) {
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
          aria-label={name}
          aria-describedby={descId}
          aria-pressed={editing ? isSelected : undefined}
          onClick={() => activate(item)}
          onDoubleClick={() => { if (editing && !coarse) openItem(item); }}
          onKeyDown={(event) => onItemKey(event, item)}
        >
          <span className="explorer-icon" aria-hidden="true">{opts.glyph}{opts.shortcut ? <i className="explorer-arrow">↗</i> : null}</span>
          {renaming ? null : <strong>{name}</strong>}
        </button>
        {renaming ? <RenameInput label={`${item.kind === "folder" ? "資料夾" : "捷徑"}名稱`} value={name} onCommit={(value) => commitRename(item, value)} onCancel={() => setRenamingId(null)} /> : null}
        <small id={descId} className="explorer-desc">{opts.draft ? "草稿 · " : ""}{summary}</small>
        {editing ? <button type="button" className="explorer-more" aria-label={`${name} 的操作`} onClick={() => showActions(item)}>⋯</button> : null}
      </div>
    );
  }

  return (
    <div className={`explorer-shell${editing ? " editing" : ""}${coarse ? " touch" : ""}`}>
      <div className="explorer-address">
        <button type="button" className={`w98-btn${dropOver === "up" ? " drop" : ""}`} disabled={!active} onClick={() => { setFolderId(active?.parentId ?? null); setSelected(null); }} {...dropProps(active?.parentId ?? null)}>↑ 上一層</button>
        <nav aria-label="資料夾路徑">
          <button type="button" className={dropOver === "root" ? "drop" : ""} aria-current={!active ? "page" : undefined} onClick={() => { setFolderId(null); setSelected(null); }} {...dropProps(null)}>{ROOT_LABEL}</button>
          {breadcrumbs.map((folder, index) => <span key={folder.id}> / <button type="button" className={dropOver === folder.id ? "drop" : ""} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined} onClick={() => { setFolderId(folder.id); setSelected(null); }} {...dropProps(folder.id)}>{folder.name}</button></span>)}
        </nav>
      </div>
      <label className="explorer-search">搜尋捷徑<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入名稱…" /></label>

      {editing ? (
        <>
          <div className="explorer-authoring">
            <button type="button" className="w98-btn" onClick={addFolder}>新增資料夾</button>
            <button type="button" className="w98-btn" onClick={() => setDialog({ type: "create-shortcut" })}>建立捷徑</button>
          </div>
          <p className="w98-hint explorer-scope">資料夾只存在於這個 Explorer 視窗；捷徑只是指向視窗、OC 或貼文的參照，刪除捷徑不會刪除原本的內容。</p>
        </>
      ) : null}

      {search ? (
        <ul className="explorer-results" aria-label="搜尋結果">{searchResults.map((shortcut) => <li key={shortcut.id}><button type="button" onClick={() => openShortcut(shortcut)}>▣ {shortcut.label}</button><small>{pathLabel(content.folders, shortcut.parentId)}</small></li>)}</ul>
      ) : (
        <div className="explorer-grid" role="list" aria-label={active?.name ?? ROOT_LABEL} onClick={(event) => { if (event.target === event.currentTarget) select(null); }}>
          {folders.map((folder) => renderTile({ kind: "folder", id: folder.id }, folder.name, `資料夾 · ${folderItemCount(folder.id)} 項`, { glyph: "📁", draft: folder.visibility === "draft" }))}
          {shortcuts.map((shortcut) => {
            const state = statusOf(shortcut);
            return renderTile({ kind: "shortcut", id: shortcut.id }, shortcut.label, state.status === "missing" ? "⚠ 目標已失效" : state.status === "ok" ? `${state.kindLabel}：${state.name}` : `${state.kindLabel}捷徑`, { glyph: GLYPH[shortcut.target.kind], shortcut: true, broken: state.status === "missing", draft: shortcut.visibility === "draft" });
          })}
          {!folders.length && !shortcuts.length ? <p className="explorer-empty">這個資料夾是空的。{editing ? "用上方的「新增資料夾」或「建立捷徑」開始。" : ""}</p> : null}
        </div>
      )}

      <div className="explorer-footer">
        <p className="explorer-status" role="status" aria-live="polite" hidden={!status}>{status}</p>
        {editing ? (
          <>
            {selected && (selectedFolder || selectedShortcut) ? (
              <div ref={actionBar} className="explorer-actions" role="toolbar" aria-label="選取項目的操作">
                <span className="explorer-selected">已選取：<strong>{selectedFolder?.name ?? selectedShortcut?.label}</strong>{selectedShortcut && selectedStatus ? <small>{selectedStatus.status === "missing" ? "⚠ 目標已失效" : selectedStatus.status === "ok" ? `${selectedStatus.kindLabel}：${selectedStatus.name}` : `${selectedStatus.kindLabel}捷徑`}</small> : <small>資料夾</small>}</span>
                <button type="button" className="w98-btn" onClick={() => setRenamingId(selected.id)}>重新命名</button>
                <button type="button" className="w98-btn" onClick={() => setDialog({ type: "move", item: selected })}>移動到…</button>
                {selectedShortcut ? <button type="button" className="w98-btn" onClick={() => duplicateShortcut(selectedShortcut)}>建立副本捷徑</button> : null}
                {selectedShortcut && selectedStatus?.status === "missing" ? <button type="button" className="w98-btn primary" onClick={() => setDialog({ type: "repair", shortcutId: selectedShortcut.id })}>修復目標…</button> : null}
                <button type="button" className="w98-btn" onClick={() => setVisibility(selected, (selectedFolder ?? selectedShortcut)?.visibility === "draft" ? "published" : "draft")}>{(selectedFolder ?? selectedShortcut)?.visibility === "draft" ? "設為公開" : "設為草稿"}</button>
                <button type="button" className="w98-btn danger" onClick={() => requestDelete(selected)}>刪除</button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {dialog?.type === "create-shortcut" ? <TargetPickerDialog title="建立捷徑" hint={`捷徑會放在「${pathLabel(content.folders, folderId)}」，點選要指向的內容。`} confirmLabel="建立捷徑" options={targetOptions} onPick={createShortcut} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "repair" && repairing ? <TargetPickerDialog title={`修復捷徑「${repairing.label}」`} hint="原本指向的內容已經不存在。選一個新的目標，捷徑名稱會保留。" confirmLabel="改指向這個" options={targetOptions} onPick={(option) => repairShortcut(repairing.id, option)} onClose={() => setDialog(null)} /> : null}
      {moving ? <MoveDialog itemName={movingName} kindLabel={moving.kind === "folder" ? "資料夾" : "捷徑"} options={moveOptions(content, moving)} onPick={(parentId) => move(moving, parentId)} onClose={() => setDialog(null)} /> : null}
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
            setStatus(`已刪除資料夾「${target.name}」。原本的內容沒有被刪除，可以用「復原」找回。`);
          }}
        />
      ) : null}
    </div>
  );
}

export function ExplorerView(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing={false} />; }
export function ExplorerInlineEditor(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing />; }
