import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeImageUrl } from "@retrodesk/shared";
import { api, type AssetRecord } from "../../../lib/api";
import { BUILTIN_ICON_KEYS } from "../../../lib/icons";
import { Icon } from "../../../components/Icon";
import { CURATED_WINDOWS_ICON_KEYS, WINDOWS_ICON_RECORDS, WINDOWS_ICON_SOURCE } from "../../../lib/windowsIconManifest";
import { hasWindowsIconPack, WINDOWS_ICON_PACK_INSTALL_COMMAND } from "../../../lib/optionalIconPack";
import { FilePick, MiniBtn } from "../ui";

type Props = {
  siteId?: string;
  value: string;
  onChange: (value: string) => void;
  upload?: (file: File, kind?: "image" | "icon" | "audio") => Promise<string | null>;
  onDone?: () => void;
  size?: number;
};

/** Built-in icons, the user's uploaded icon library, upload (single or pack) and paste-a-URL. */
export function IconPicker({ siteId, value, onChange, upload, onDone, size = 24 }: Props) {
  const [mine, setMine] = useState<AssetRecord[]>([]);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [packState, setPackState] = useState<"checking" | "available" | "missing">("checking");
  const windows = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pool = terms.length ? WINDOWS_ICON_RECORDS : WINDOWS_ICON_RECORDS.filter((record) => CURATED_WINDOWS_ICON_KEYS.includes(record.key)).slice(0, 48);
    return pool.filter((record) => terms.every((term) => `${record.key} ${record.label} ${record.upstreamPath}`.toLowerCase().includes(term))).slice(0, 100);
  }, [search]);

  const refresh = useCallback(async () => {
    if (!siteId) return;
    try {
      setMine((await api.listAssets(siteId, "icon")).assets);
    } catch {
      setStatus("無法讀取我的圖示。");
    }
  }, [siteId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    void hasWindowsIconPack().then((available) => { if (active) setPackState(available ? "available" : "missing"); });
    return () => { active = false; };
  }, []);

  async function addFiles(files: File[], applyFirst: boolean) {
    if (!upload) return;
    setBusy(true);
    setStatus("");
    let added = 0;
    const queue = [...files];
    const firstUrl: { value: string | null } = { value: null };
    // Upload with a concurrency cap of 3.
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const stored = await upload(file, "icon");
        if (stored) {
          added += 1;
          if (firstUrl.value === null) firstUrl.value = stored;
        }
      }
    }));
    setBusy(false);
    if (applyFirst && firstUrl.value) onChange(firstUrl.value);
    if (added > 0) setStatus(`已加入 ${added} 個圖示`);
    await refresh();
  }

  async function remove(asset: AssetRecord) {
    if (!siteId) return;
    try {
      await api.deleteAsset(siteId, asset.id);
      setMine((list) => list.filter((item) => item.id !== asset.id));
      if (value === asset.url) onChange("link");
    } catch {
      setStatus("刪除失敗，請再試一次。");
    }
  }

  function useUrl() {
    const result = normalizeImageUrl(url);
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    onChange(result.url);
    setUrl("");
    setStatus("");
  }

  const cell = (key: string, src: string, label: string, remover?: () => void) => (
    <span key={key} className="icon-cell">
      <button type="button" aria-label={label} aria-pressed={value === src} className={value === src ? "on" : ""} onClick={() => onChange(src)}>
        <Icon name={src} size={size} />
      </button>
      {remover ? <button type="button" className="icon-del" aria-label={`刪除圖示 ${label}`} onClick={remover}>×</button> : null}
    </span>
  );

  return (
    <div className="icon-picker">
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
        {upload ? <FilePick onFiles={(files) => void addFiles(files.slice(0, 1), true)}>上傳單張…</FilePick> : null}
        {upload ? <FilePick multiple onFiles={(files) => void addFiles(files, false)}>上傳圖示包…</FilePick> : null}
        {onDone ? <MiniBtn label="完成" className="mini-btn wide" onClick={onDone}>完成</MiniBtn> : null}
      </div>
      <div className="ie-row">
        <input className="ie small" value={url} placeholder="或貼上圖示網址 https://" aria-label="圖示網址" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); useUrl(); } }} />
        <MiniBtn label="使用網址" className="mini-btn wide" onClick={useUrl}>使用</MiniBtn>
      </div>
      <span role="status" className="w98-hint">{busy ? "上傳中…" : status}</span>
    </div>
  );
}
