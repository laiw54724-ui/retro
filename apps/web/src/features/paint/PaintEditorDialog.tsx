import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "../../components/ModalDialog";
import { registerEditorLocalWork } from "../editor/editorLocalWork";
import { useEditorSaveSession } from "../editor/editorSession";
import { PaintWorkspace } from "./PaintWorkspace";
import type { PaintEngine } from "./engine";
import { createPaintSaveSession } from "./saveDrawing";
import { usePaintLabels } from "./paintLabels";
import styles from "./PaintEditorDialog.module.css";

export type PaintEditorDialogProps = { siteId: string; disabled: boolean; onClose: () => void };
export function PaintEditorDialog({ siteId, disabled, onClose }: PaintEditorDialogProps) {
  const { t } = useTranslation("modules");
  const labels = usePaintLabels();
  const [name, setName] = useState("");
  const engine = useRef<PaintEngine | null>(null);
  const blocked = useRef(disabled); blocked.current = disabled;
  const captureSession = useEditorSaveSession(siteId);
  const save = useMemo(() => createPaintSaveSession({ siteId, captureSession, blocked: () => blocked.current }), [siteId, captureSession]);
  useEffect(() => registerEditorLocalWork(siteId, () => !!engine.current && (engine.current.dirty || engine.current.active)), [siteId]);
  const close = () => {
    const current = engine.current;
    if (current?.active) { current.cancel(); current.display.blur(); return; }
    if (current?.dirty && !window.confirm(t("paint.closeConfirm"))) return;
    onClose();
  };
  return <ModalDialog title={t("paint.open")} width={1080} onClose={close} containShortcuts dismissOnBackdrop={false}>
    <div className={styles.body} data-paint-editor>
      <p>{t("paint.intro")}</p>
      <label className={styles.name}>{t("paint.name")}<input className="w98-input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
      {disabled ? <p role="alert">{t("paint.saveUnavailable")}</p> : null}
      <PaintWorkspace labels={labels} saveDisabled={disabled} onEngineReady={(value) => { engine.current = value; }}
        saveLabels={{ save: t("paint.save"), saving: t("paint.saving"), saved: t("paint.saved"), failed: t("paint.saveFailed") }}
        onSave={async (request) => { if (blocked.current) throw new Error("Paint save unavailable"); await save(request, name); }} />
    </div>
  </ModalDialog>;
}
