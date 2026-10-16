import { useRef, useState } from "react";
import { MAX_IMPORT_BYTES, RetroExportPackageSchema, type ImportPreview, type RetroExportPackage } from "@retrodesk/shared";
import { api } from "../../lib/api";
import { RetroButton } from "../../components/RetroButton";

type Props = { siteId: string; username: string; published: boolean; onClose: () => void; onImported: (siteId: string) => void };

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function TransferDialog({ siteId, username, published, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<RetroExportPackage | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [digest, setDigest] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [siteName, setSiteName] = useState("");
  const [allowMissing, setAllowMissing] = useState(false);

  const runExport = async (scope: "draft" | "published") => {
    setBusy(true); setError("");
    try { const result = await api.exportSite(siteId, scope); saveBlob(result.blob, result.filename); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "匯出失敗"); }
    finally { setBusy(false); }
  };

  const chooseFile = async (file?: File) => {
    setSource(null); setPreview(null); setDigest(""); setAllowMissing(false); setError("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setError("檔案超過 2 MB；JSON v1 不接受大型或壓縮封裝。"); return; }
    const prefix = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (prefix[0] === 0x50 && prefix[1] === 0x4b) { setError("目前只接受 Retro JSON；ZIP／可執行檔不會解壓或執行。"); return; }
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text());
      const parsed = RetroExportPackageSchema.safeParse(raw);
      if (!parsed.success) throw new Error("這不是支援的 Retro JSON v1 匯出檔。");
      const result = await api.previewImport(parsed.data);
      setSource(parsed.data as RetroExportPackage);
      setPreview(result.preview);
      setDigest(result.digest);
      setSiteName(result.preview.siteName + " 複本");
      setNewUsername(`${result.preview.sourceUsername}-copy`.slice(0, 20).replace(/-+$/, ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "無法讀取匯入檔"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!source || !preview) return;
    setBusy(true); setError("");
    try {
      const result = await api.confirmImport(source, { digest, username: newUsername, siteName, allowMissingMedia: allowMissing });
      onImported(result.site.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "建立副本失敗"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="retro-panel editor-dialog transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
        <header className="landing-titlebar" id="transfer-title">匯出／匯入桌面</header>
        <div className="dialog-body">
          <section aria-labelledby="export-heading">
            <h2 id="export-heading">匯出 JSON v1</h2>
            <p>從 <strong>@{username}</strong> 匯出結構與媒體清單；不含圖片／音樂位元，也不授予轉載權。</p>
            <div className="button-row">
              <RetroButton disabled={busy || !published} onClick={() => void runExport("published")}>匯出公開版本</RetroButton>
              <RetroButton disabled={busy} onClick={() => void runExport("draft")}>匯出私人草稿備份</RetroButton>
            </div>
            {!published ? <p className="w98-hint">尚未發布，因此目前只能匯出標示為私人內容的草稿備份。</p> : null}
          </section>
          <div className="w98-sep" />
          <section aria-labelledby="import-heading">
            <h2 id="import-heading">匯入為新桌面</h2>
            <p>先預覽，再建立副本；不會覆蓋目前桌面。上限 2 MB，只接受 JSON。</p>
            <input ref={inputRef} aria-label="選擇 Retro JSON" type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            {preview ? (
              <div className="transfer-preview" role="status">
                <strong>{preview.siteName}</strong>
                <span>{preview.windowCount} 個視窗 · {preview.profileCount} 個 OC · {preview.postCount} 篇貼文 · {preview.mediaCount} 個媒體引用</span>
                <span>來源類型：{preview.scope === "owner-backup" ? "私人草稿備份" : "公開版本"}</span>
                {preview.missingMedia.length ? <div className="transfer-warning"><strong>{preview.missingMedia.length} 個私有媒體未附檔</strong><p>JSON v1 不含素材位元；建立後需要重新上傳。</p><label className="check-row"><input type="checkbox" checked={allowMissing} onChange={(event) => setAllowMissing(event.target.checked)} />我了解並仍要建立副本</label></div> : null}
                <label className="w98-field"><span>新桌面網址</span><input className="w98-input" value={newUsername} onChange={(event) => setNewUsername(event.target.value.toLowerCase())} /></label>
                <label className="w98-field"><span>新桌面名稱</span><input className="w98-input" value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
              </div>
            ) : null}
          </section>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <div className="button-row end">
            <RetroButton disabled={busy} onClick={onClose}>關閉</RetroButton>
            <RetroButton className="primary" disabled={busy || !source || !preview || !newUsername || !siteName || (!!preview?.missingMedia.length && !allowMissing)} onClick={() => void confirm()}>{busy ? "處理中…" : "建立新桌面副本"}</RetroButton>
          </div>
        </div>
      </section>
    </div>
  );
}
