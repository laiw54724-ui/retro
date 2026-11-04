import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadVersionedSiteDocument, type VersionedSiteDocumentInput } from "@retrodesk/shared";
import { api, API_URL } from "../../lib/api";
import { compatibleDocumentRecovery } from "../../lib/imageCompatibility";
import { ModalDialog } from "../../components/ModalDialog";
import { downloadLocalDocument } from "./downloadLocalDocument";
import { RetroButton } from "../../components/RetroButton";

type Props = { siteId: string; localDocument: VersionedSiteDocumentInput; onClose: () => void };

/** Never replaces the current draft. Recovery opens a fresh editor in another tab. */
export function DocumentUpgradeRecovery({ siteId, localDocument, onClose }: Props) {
  const { t } = useTranslation("editor");
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const download = () => downloadLocalDocument(siteId, localDocument);
  const check = async () => {
    setChecking(true); setReady(false); setError("");
    try {
      const { site } = await api.getSite(siteId);
      if (!compatibleDocumentRecovery(siteId, API_URL, { siteId: site.id, apiOrigin: site.clientApiOrigin ?? "", writeCompatibility: site.writeCompatibility }, localDocument, site.draft_document)
        || !loadVersionedSiteDocument(site.draft_document, { siteId, migrateV1: true }).ok) {
        setError(t("documentCompatibility.notReady")); return;
      }
      setReady(true);
    } catch { setError(t("documentCompatibility.checkFailed")); }
    finally { setChecking(false); }
  };
  return <ModalDialog role="alertdialog" title={t("documentCompatibility.title")} className="publish-preflight" width={520} dismissOnBackdrop={false} onClose={onClose} actions={
    <>
      <RetroButton data-autofocus onClick={download}>{t("documentCompatibility.download")}</RetroButton>
      <RetroButton disabled={checking} onClick={() => void check()}>{t("documentCompatibility.check")}</RetroButton>
      {ready ? <a className="retro-link" href={`/editor/${encodeURIComponent(siteId)}`} target="_blank" rel="noopener noreferrer">{t("documentCompatibility.openFresh")}</a> : null}
      <RetroButton onClick={onClose}>{t("documentCompatibility.keepLocal")}</RetroButton>
    </>
  }>
    <p>{t("documentCompatibility.paused")}</p>
    <p>{t("documentCompatibility.recoveryHelp")}</p>
    {error ? <p role="status">{error}</p> : null}
    {ready ? <p role="status">{t("documentCompatibility.ready")}</p> : null}
  </ModalDialog>;
}
