import { useEffect, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { PaintEditorDialogProps } from "./PaintEditorDialog";

/** Paint implementation loads only on explicit author activation. Debug hosts stay separate. */
export function PaintEditorEntry({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  const { t } = useTranslation("modules");
  const [Dialog, setDialog] = useState<ComponentType<PaintEditorDialogProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const show = async () => {
    if (disabled || loading) return;
    if (Dialog) { setOpen(true); return; }
    const attempt = ++generation.current;
    setLoading(true); setFailed(false);
    try {
      const module = await import("./PaintEditorDialog");
      if (attempt !== generation.current) return;
      setDialog(() => module.PaintEditorDialog); setOpen(true);
    } catch { if (attempt === generation.current) setFailed(true); }
    finally { if (attempt === generation.current) setLoading(false); }
  };
  return <>
    <button type="button" className="w98-btn" onClick={() => void show()} disabled={disabled || loading}>{t(loading ? "paint.opening" : "paint.open")}</button>
    {failed ? <span role="alert">{t("paint.openFailed")}</span> : null}
    {open && Dialog ? <Dialog siteId={siteId} disabled={disabled} onClose={() => setOpen(false)} /> : null}
  </>;
}
