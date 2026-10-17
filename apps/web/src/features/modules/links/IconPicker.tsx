import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeImageUrl, type DesktopWindow } from "@retrodesk/shared";
import { api, type AssetRecord } from "../../../lib/api";
import { BUILTIN_ICON_KEYS } from "../../../lib/icons";
import { Icon } from "../../../components/Icon";
import { CURATED_WINDOWS_ICON_KEYS, WINDOWS_ICON_RECORDS, WINDOWS_ICON_SOURCE } from "../../../lib/windowsIconManifest";
import { hasWindowsIconPack, WINDOWS_ICON_PACK_INSTALL_COMMAND } from "../../../lib/optionalIconPack";
import { FilePick, MiniBtn } from "../ui";
import { UploadTaskList, useMediaQueue } from "../../media/editorMedia";
import { enqueueWindowUpload } from "../../media/windowMediaSession";
import { useEditorStore } from "../../editor/store";
import "./icon-picker.css";

type IconMediaTarget = { windowId: string; windowType: DesktopWindow["type"]; itemId?: string };

type Props = {
  siteId?: string;
  value: string;
  onChange: (value: string) => void;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  /** Stable target for async icon writes. Synchronous choices still use onChange. */
  mediaTarget?: IconMediaTarget;
  onDone?: () => void;
  size?: number;
};

/** Built-in icons, the user's uploaded icon library, upload (single or pack) and paste-a-URL. */
export function IconPicker({ siteId, value, onChange, upload, mediaTarget, onDone, size = 24 }: Props) {
  const [mine, setMine] = useState<AssetRecord[]>([]);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const { queue, tasks } = useMediaQueue();
  const scope = `window:${mediaTarget?.windowId ?? "library"}:icons:${mediaTarget?.itemId ?? "window"}`;
  const ownTasks = tasks.filter((task) => task.scope === scope);
  const completed = ownTasks.filter((task) => task.status === "completed").length;
  const requestGeneration = useRef(0);
  const [search, setSearch] = useState("");
  const [packState, setPackState] = useState<"checking" | "available" | "missing">("checking");
  const windows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pool = terms.length ? WINDOWS_ICON_RECORDS : WINDOWS_ICON_RECORDS.filter((record) => CURATED_WINDOWS_ICON_KEYS.includes(record.key)).slice(0, 48);
    return pool.filter((record) => terms.every((term) => `${record.key} ${record.label} ${record.upstreamPath}`.toLowerCase().includes(term))).slice(0, 100);
  }, [search]);

  const refresh = useCallback(async () => {
    if (!siteId) return;
    const generation = ++requestGeneration.current;
    try {
      const result = await api.listAssets(siteId, "icon");
      if (requestGeneration.current === generation) setMine(result.assets);
    } catch {
      if (requestGeneration.current === generation) setStatus("無法讀取我的圖示。");
    }
  }, [siteId]);
  useEffect(() => { void refresh(); return () => { requestGeneration.current++; }; }, [refresh, completed]);
  useEffect(() => {
    let active = true;
    void hasWindowsIconPack().then((available) => { if (active) setPackState(available ? "available" : "missing"); });
    return () => { active = false; };
  }, []);

  function addFiles(files: File[], applyFirst: boolean) {
    if (!upload || !queue || !siteId) return;
    setStatus("");
    for (const file of files) {
      if (applyFirst && mediaTarget) {
        const target = { ...mediaTarget, siteId, scope };
        const currentIcon = (current: DesktopWindow) => target.itemId
          ? current.type === "links" ? current.content.links.find((link) => link.id === target.itemId)?.icon : undefined
          : current.icon;
        enqueueWindowUpload(queue, useEditorStore, target, file, upload, {
          kind: "icon", slot: "icon",
          isCurrent: (current) => currentIcon(current) === value,
          apply: (current, icon) => {
            if (!target.itemId) return { ...current, icon };
            return current.type === "links" ? {
              ...current,
              content: { ...current.content, links: current.content.links.map((link) => link.id === target.itemId ? { ...link, icon, iconUrl: "" } : link) }
            } : current;
          }
        });
      } else {
        // Packs populate the site's icon library; they never change a window's icon.
        queue.enqueue({ file, scope, kind: "icon", upload,
          isCurrent: () => useEditorStore.getState().siteId === siteId && useEditorStore.getState().accessRole !== "viewer",
          apply: () => true
        });
      }
    }
  }

  async function remove(asset: AssetRecord) {
    if (!siteId) return;
    const generation = requestGeneration.current;
    try {
      await api.deleteAsset(siteId, asset.id);
      if (requestGeneration.current !== generation) return;
      setMine((list) => list.filter((item) => item.id !== asset.id));
      // The API rejects assets referenced by a saved draft or published site.
      // Library deletion must never write through a captured inspector callback.
    } catch {
      if (requestGeneration.current === generation) setStatus("刪除失敗。使用中的圖示需先從草稿及公開網站移除。");
    }
  }

  function chooseIcon(next: string) {
    // Even re-selecting the current icon is a newer explicit choice. A no-op
    // store update alone cannot invalidate an upload that captured that value.
    queue?.invalidate("已選擇其他圖示，未套用這次上傳。", (entry) => entry.options.scope === scope && entry.options.slot === "icon");
    onChange(next);
  }

  function useUrl() {
    const result = normalizeImageUrl(url);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    chooseIcon(result.url);
    setUrl("");
    setStatus("");
  }

  const cell = (key: string, src: string, label: string, remover?: () => void) => (
    <span key={key} className="icon-cell">
      <button type="button" aria-label={label} aria-pressed={value === src} className={value === src ? "on" : ""} onClick={() => chooseIcon(src)}>
        <Icon name={src} size={size} />
      </button>
      {remover ? <button type="button" className="icon-del" aria-label={`刪除圖示 ${label}`} onClick={remover}>×</button> : null}
    </span>
  );

  return (
    <div className="icon-picker media-icon-picker">
      <strong className="icon-picker-h">內建圖示</strong>
      <div className="icon-grid">{BUILTIN_ICON_KEYS.map((key) => cell(key, key, `圖示 ${key}`))}</div>
      <strong className="icon-picker-h">{search.trim() ? "Windows 搜尋結果" : "Windows 精選"}</strong>
      {packState === "checking" ? <span role="status" className="w98-hint">正在檢查可選圖示包…</span> : null}
      {packState === "missing" ? (
        <span role="status" className="w98-hint">未安裝 Windows 可選圖示包。自架者確認上游權利狀態後可執行 <code>{WINDOWS_ICON_PACK_INSTALL_COMMAND}</code>；目前仍可使用內建或自行上傳的圖示。</span>
      ) : null}
      {packState === "available" ? (
        <>
          <label className="icon-search"><span className="visually-hidden">搜尋 Windows 圖示</span><input className="w98-input" type="search" value={search} placeholder={`搜尋 ${WINDOWS_ICON_RECORDS.length.toLocaleString()} 個 Windows 圖示`} aria-label="搜尋 Windows 圖示" onChange={(event) => setSearch(event.target.value)} /></label>
          {windows.length ? <div className="icon-grid win98-icon-grid">{windows.map((record) => cell(record.key, record.path, `Windows 圖示 ${record.label}`))}</div> : <span className="w98-hint">找不到相符的 Windows 圖示。</span>}
          {search.trim() && windows.length === 100 ? <span className="w98-hint">顯示前 100 筆結果，請輸入更多關鍵字縮小範圍。</span> : null}
        </>
      ) : null}
      <span className="w98-hint">來源：<a href={WINDOWS_ICON_SOURCE}>{WINDOWS_ICON_SOURCE.replace("https://github.com/", "")}</a>；上游未宣告授權，圖示權利屬各原權利人，不隨 Retro 發行。</span>
      {siteId ? (
        <>
          <strong className="icon-picker-h">我的圖示</strong>
          {mine.length ? <div className="icon-grid">{mine.map((asset) => cell(asset.id, asset.url, asset.name || "圖示", () => void remove(asset)))}</div> : <span className="w98-hint">還沒有上傳過圖示。</span>}
        </>
      ) : null}
      <div className="ie-row">
        {upload && queue && mediaTarget ? <FilePick onFiles={(files) => addFiles(files.slice(0, 1), true)}>上傳單張…</FilePick> : null}
        {upload && queue ? <FilePick multiple onFiles={(files) => addFiles(files, false)}>上傳圖示包…</FilePick> : null}
        {onDone ? <MiniBtn label="完成" className="mini-btn wide" onClick={onDone}>完成</MiniBtn> : null}
      </div>
      <div className="ie-row">
        <input className="ie small" value={url} maxLength={2048} placeholder="或貼上圖示網址 https://" aria-label="圖示網址" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); useUrl(); } }} />
        <MiniBtn label="使用網址" className="mini-btn wide" onClick={useUrl}>使用</MiniBtn>
      </div>
      <UploadTaskList tasks={ownTasks} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)} />
      <span role="status" className="w98-hint">{status}</span>
    </div>
  );
}
