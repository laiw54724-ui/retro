import { ModalDialog } from "../../components/ModalDialog";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "./store";

/** Lists the Explorer shortcuts an edit would orphan and lets the author confirm or back out. */
export function IntegrityDialog() {
  const { t: tr } = useTranslation("editor");
  const pending = useEditorStore((state) => state.pendingIntegrity);
  const confirm = useEditorStore((state) => state.confirmIntegrity);
  const cancel = useEditorStore((state) => state.cancelIntegrity);
  if (!pending) return null;
  const count = pending.impacts.length;
  const targetText = (target: { kind: "window" | "profile" | "post"; name: string | null }) => target.kind === "window"
    ? (target.name ? tr("integrity.targetWindow", { name: target.name }) : tr("integrity.targetWindowGone"))
    : target.kind === "profile"
      ? (target.name ? tr("integrity.targetProfile", { name: target.name }) : tr("integrity.targetProfileGone"))
      : (target.name ? tr("integrity.targetPost", { name: target.name }) : tr("integrity.targetPostGone"));
  return (
    <ModalDialog
      title={tr("integrity.title", { count })}
      width={520}
      dismissOnBackdrop={false}
      onClose={cancel}
      actions={(
        <>
          <button type="button" className="w98-btn" data-autofocus onClick={cancel}>{tr("integrity.cancel")}</button>
          <button type="button" className="w98-btn danger" onClick={confirm}>{tr("integrity.confirm", { count })}</button>
        </>
      )}
    >
      <p>{tr("integrity.intro")}</p>
      <p><strong>{tr("integrity.onlyThese")}</strong> {tr("integrity.note")}</p>
      <ul className="integrity-list" aria-label={tr("integrity.listLabel")}>
        {pending.impacts.map((item) => (
          <li key={`${item.explorerId}:${item.shortcutId}`}>
            <strong>{item.label}</strong>
            <small>{tr("integrity.location", { explorer: item.explorerTitle, path: [tr("integrity.root"), ...item.folderNames].join(" / "), target: targetText(item.target) })}</small>
          </li>
        ))}
      </ul>
    </ModalDialog>
  );
}
