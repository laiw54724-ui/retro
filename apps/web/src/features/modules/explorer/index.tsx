import { useMemo, useState } from "react";
import type { ModuleProps, WindowOf } from "../types";
import { buildPublicEntityUrl } from "../../../lib/publicShare";

type Content = WindowOf<"explorer">["content"];
type Folder = Content["folders"][number];
type Shortcut = Content["shortcuts"][number];
const newId = () => globalThis.crypto?.randomUUID?.() ?? `explorer-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function descendants(folders: Folder[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) { result.add(folder.id); changed = true; }
  }
  return result;
}

function ExplorerBrowser({ window, ctx, update, editing }: ModuleProps<"explorer"> & { editing: boolean }) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const content = window.content;
  const foldersById = new Map(content.folders.map((folder) => [folder.id, folder]));
  const active = folderId ? foldersById.get(folderId) ?? null : null;
  const breadcrumbs = useMemo(() => {
    const result: Folder[] = []; let cursor = active; const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) { result.unshift(cursor); seen.add(cursor.id); cursor = cursor.parentId ? foldersById.get(cursor.parentId) ?? null : null; }
    return result;
  }, [active, content.folders]);
  const setContent = (next: Content) => update((current) => ({ ...current, content: next }));
  const folders = content.folders.filter((folder) => folder.parentId === folderId).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const shortcuts = content.shortcuts.filter((shortcut) => shortcut.parentId === folderId).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  const search = query.trim().toLowerCase();
  const searchResults = search ? content.shortcuts.filter((shortcut) => shortcut.label.toLowerCase().includes(search)) : [];
  const availableWindows = ctx.windows.filter((candidate) => candidate.id !== window.id);
  const availableTargets = [
    ...availableWindows.map((candidate) => ({ kind: "window" as const, id: candidate.id, label: candidate.title })),
    ...(ctx.profileDirectory ?? []).flatMap((entry) => [
      { kind: "profile" as const, id: entry.id, label: `OC：${entry.profile.name || entry.profile.username}` },
      ...entry.posts.map((post) => ({ kind: "post" as const, id: post.id, label: `貼文：${post.title || post.caption || post.id}` }))
    ])
  ];

  function addFolder() {
    const folder: Folder = { id: newId(), parentId: folderId, name: "新資料夾", order: folders.length, visibility: "published" };
    setContent({ ...content, folders: [...content.folders, folder] });
  }
  function addShortcut(value: string) {
    const [kind, ...idParts] = value.split("|");
    const targetId = idParts.join("|");
    const target = availableTargets.find((candidate) => candidate.kind === kind && candidate.id === targetId);
    if (!target || !ctx.siteId) return;
    setContent({ ...content, shortcuts: [...content.shortcuts, { id: newId(), parentId: folderId, label: target.label, order: shortcuts.length, visibility: "published", target: { siteId: ctx.siteId, id: target.id, kind: target.kind } }] });
  }
  function openShortcut(shortcut: Shortcut) {
    if (shortcut.target.kind === "window") { ctx.onLink({ target: "window", windowId: shortcut.target.id, label: shortcut.label }); return; }
    if (ctx.publicShareBaseUrl) {
      const base = new URL(ctx.publicShareBaseUrl, globalThis.location.origin);
      const handle = decodeURIComponent(base.pathname.replace(/^\/@/, "").split("/")[0] ?? "");
      globalThis.location.assign(buildPublicEntityUrl(base.origin, handle, shortcut.target.kind === "profile" ? "oc" : "post", shortcut.target.id));
      return;
    }
    if (shortcut.target.kind === "profile") ctx.onProfileSelect?.(shortcut.target.id);
  }
  function removeFolder(folder: Folder) {
    const removed = descendants(content.folders, folder.id);
    const shortcutCount = content.shortcuts.filter((shortcut) => shortcut.parentId && removed.has(shortcut.parentId)).length;
    if (!globalThis.confirm(`刪除「${folder.name}」和 ${removed.size - 1} 個子資料夾、${shortcutCount} 個捷徑？原視窗與圖片不會被刪除。`)) return;
    setContent({ folders: content.folders.filter((item) => !removed.has(item.id)), shortcuts: content.shortcuts.filter((item) => !item.parentId || !removed.has(item.parentId)) });
  }
  function folderPath(parentId: string | null) {
    if (!parentId) return "桌面";
    const names: string[] = []; let cursor = foldersById.get(parentId); const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) { names.unshift(cursor.name); seen.add(cursor.id); cursor = cursor.parentId ? foldersById.get(cursor.parentId) : undefined; }
    return `桌面 / ${names.join(" / ")}`;
  }

  return (
    <div className={`explorer-shell${editing ? " editing" : ""}`}>
      <div className="explorer-address">
        <button type="button" className="w98-btn" disabled={!active} onClick={() => setFolderId(active?.parentId ?? null)}>← 返回</button>
        <nav aria-label="資料夾路徑"><button type="button" onClick={() => setFolderId(null)}>桌面</button>{breadcrumbs.map((folder) => <span key={folder.id}> / <button type="button" onClick={() => setFolderId(folder.id)}>{folder.name}</button></span>)}</nav>
      </div>
      <label className="explorer-search">搜尋捷徑<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入名稱…" /></label>
      {editing ? <div className="explorer-authoring"><button type="button" className="w98-btn" onClick={addFolder}>＋資料夾</button><label>＋捷徑<select aria-label="新增內容捷徑" defaultValue="" onChange={(event) => { addShortcut(event.target.value); event.target.value = ""; }}><option value="">選擇視窗、OC 或貼文…</option>{availableTargets.map((candidate) => <option key={`${candidate.kind}:${candidate.id}`} value={`${candidate.kind}|${candidate.id}`}>{candidate.label}</option>)}</select></label></div> : null}
      {search ? <ul className="explorer-results" aria-label="搜尋結果">{searchResults.map((shortcut) => <li key={shortcut.id}><button type="button" onClick={() => openShortcut(shortcut)}>▣ {shortcut.label}</button><small>{folderPath(shortcut.parentId)}</small></li>)}</ul> : <div className="explorer-grid" role="list" aria-label={active?.name ?? "桌面"}>
        {folders.map((folder) => <div key={folder.id} role="listitem" className="explorer-item"><button type="button" className="explorer-open" onClick={() => setFolderId(folder.id)}><span aria-hidden="true">📁</span><strong>{folder.name}</strong>{editing && folder.visibility === "draft" ? <small>草稿</small> : null}</button>{editing ? <div className="explorer-edit"><input aria-label={`${folder.name} 名稱`} value={folder.name} onChange={(event) => setContent({ ...content, folders: content.folders.map((item) => item.id === folder.id ? { ...item, name: event.target.value } : item) })} /><select aria-label={`${folder.name} 發布狀態`} value={folder.visibility} onChange={(event) => setContent({ ...content, folders: content.folders.map((item) => item.id === folder.id ? { ...item, visibility: event.target.value as "published" | "draft" } : item) })}><option value="published">公開</option><option value="draft">草稿</option></select><select aria-label={`移動 ${folder.name} 到`} value={folder.parentId ?? ""} onChange={(event) => setContent({ ...content, folders: content.folders.map((item) => item.id === folder.id ? { ...item, parentId: event.target.value || null } : item) })}><option value="">桌面</option>{content.folders.filter((candidate) => candidate.id !== folder.id && !descendants(content.folders, folder.id).has(candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button type="button" className="w98-btn danger" onClick={() => removeFolder(folder)}>刪除</button></div> : null}</div>)}
        {shortcuts.map((shortcut) => <div key={shortcut.id} role="listitem" className="explorer-item"><button type="button" className="explorer-open" onClick={() => openShortcut(shortcut)}><span aria-hidden="true">{shortcut.target.kind === "window" ? "↗" : shortcut.target.kind === "profile" ? "☺" : "▧"}</span><strong>{shortcut.label}</strong>{editing ? <small>{shortcut.visibility === "draft" ? "草稿 · " : ""}{shortcut.target.kind === "window" ? "視窗" : shortcut.target.kind === "profile" ? "OC" : "貼文"}</small> : null}</button>{editing ? <div className="explorer-edit"><input aria-label={`${shortcut.label} 名稱`} value={shortcut.label} onChange={(event) => setContent({ ...content, shortcuts: content.shortcuts.map((item) => item.id === shortcut.id ? { ...item, label: event.target.value } : item) })} /><select aria-label={`${shortcut.label} 發布狀態`} value={shortcut.visibility} onChange={(event) => setContent({ ...content, shortcuts: content.shortcuts.map((item) => item.id === shortcut.id ? { ...item, visibility: event.target.value as "published" | "draft" } : item) })}><option value="published">公開</option><option value="draft">草稿</option></select><select aria-label={`移動 ${shortcut.label} 到`} value={shortcut.parentId ?? ""} onChange={(event) => setContent({ ...content, shortcuts: content.shortcuts.map((item) => item.id === shortcut.id ? { ...item, parentId: event.target.value || null } : item) })}><option value="">桌面</option>{content.folders.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button type="button" className="w98-btn danger" onClick={() => setContent({ ...content, shortcuts: content.shortcuts.filter((item) => item.id !== shortcut.id) })}>刪除捷徑</button></div> : null}</div>)}
        {!folders.length && !shortcuts.length ? <p className="explorer-empty">這個資料夾是空的。</p> : null}
      </div>}
    </div>
  );
}

export function ExplorerView(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing={false} />; }
export function ExplorerInlineEditor(props: ModuleProps<"explorer">) { return <ExplorerBrowser {...props} editing />; }
