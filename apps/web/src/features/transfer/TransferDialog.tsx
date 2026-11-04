import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t: tr } = useTranslation("collab");
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
    catch (reason) { setError(reason instanceof Error ? reason.message : tr("transferDialog.exportFailed")); }
    finally { setBusy(false); }
  };

  const chooseFile = async (file?: File) => {
    setSource(null); setPreview(null); setDigest(""); setAllowMissing(false); setError("");
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { setError(tr("transferDialog.theFileIsLargerThan")); return; }
    const prefix = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (prefix[0] === 0x50 && prefix[1] === 0x4b) { setError(tr("transferDialog.onlyRetroJsonIsAccepted")); return; }
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text());
      const parsed = RetroExportPackageSchema.safeParse(raw);
      if (!parsed.success) throw new Error(tr("transferDialog.thisIsntASupportedRetro"));
      const result = await api.previewImport(parsed.data);
      setSource(parsed.data as RetroExportPackage);
      setPreview(result.preview);
      setDigest(result.digest);
      setSiteName(result.preview.siteName + tr("transferDialog.copy"));
      setNewUsername(`${result.preview.sourceUsername}-copy`.slice(0, 20).replace(/-+$/, ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("transferDialog.couldntReadTheImportFile")); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!source || !preview) return;
    setBusy(true); setError("");
    try {
      const result = await api.confirmImport(source, { digest, username: newUsername, siteName, allowMissingMedia: allowMissing });
      onImported(result.site.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : tr("transferDialog.couldntCreateTheCopy")); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="retro-panel editor-dialog transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
        <header className="landing-titlebar" id="transfer-title">{tr("transferDialog.exportImportDesktop")}</header>
        <div className="dialog-body">
          <section aria-labelledby="export-heading">
            <h2 id="export-heading">{tr("transferDialog.exportJsonV1")}</h2>
            <p>{tr("transferDialog.from")} <strong>@{username}</strong> {tr("transferDialog.exportsTheStructureAndA")}</p>
            <div className="button-row">
              <RetroButton disabled={busy || !published} onClick={() => void runExport("published")}>{tr("transferDialog.exportPublicVersion")}</RetroButton>
              <RetroButton disabled={busy} onClick={() => void runExport("draft")}>{tr("transferDialog.exportPrivateDraftBackup")}</RetroButton>
            </div>
            {!published ? <p className="w98-hint">{tr("transferDialog.notPublishedYetSoOnly")}</p> : null}
          </section>
          <div className="w98-sep" />
          <section aria-labelledby="import-heading">
            <h2 id="import-heading">{tr("transferDialog.importAsANewDesktop")}</h2>
            <p>{tr("transferDialog.previewFirstThenCreateA")}</p>
            <input ref={inputRef} aria-label={tr("transferDialog.chooseRetroJson")} type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            {preview ? (
              <div className="transfer-preview" role="status">
                <strong>{preview.siteName}</strong>
                <span>{tr("transfer.previewCounts", { windows: preview.windowCount, profiles: preview.profileCount, posts: preview.postCount, media: preview.mediaCount })}</span>
                <span>{tr("transfer.sourceType", { type: preview.scope === "owner-backup" ? tr("transferDialog.privateDraftBackup") : tr("transferDialog.publicVersion") })}</span>
                {preview.missingMedia.length ? <div className="transfer-warning"><strong>{tr("transfer.privateMediaMissing", { count: preview.missingMedia.length })}</strong><p>{tr("transferDialog.jsonV1DoesntIncludeAsset")}</p><label className="check-row"><input type="checkbox" checked={allowMissing} onChange={(event) => setAllowMissing(event.target.checked)} />{tr("transferDialog.iUnderstandAndStillWant")}</label></div> : null}
                <label className="w98-field"><span>{tr("transferDialog.newDesktopUrl")}</span><input className="w98-input" value={newUsername} onChange={(event) => setNewUsername(event.target.value.toLowerCase())} /></label>
                <label className="w98-field"><span>{tr("transferDialog.newDesktopName")}</span><input className="w98-input" value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
              </div>
            ) : null}
          </section>
          {error ? <p role="alert" className="form-error">{error}</p> : null}
          <div className="button-row end">
            <RetroButton disabled={busy} onClick={onClose}>{tr("transferDialog.close")}</RetroButton>
            <RetroButton className="primary" disabled={busy || !source || !preview || !newUsername || !siteName || (!!preview?.missingMedia.length && !allowMissing)} onClick={() => void confirm()}>{busy ? tr("transferDialog.working") : tr("transferDialog.createANewDesktopCopy")}</RetroButton>
          </div>
        </div>
      </section>
    </div>
  );
}
