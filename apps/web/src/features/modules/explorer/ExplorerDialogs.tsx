import { LinkTargetPicker } from "../../navigation/LinkTargetPicker";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "../../../components/ModalDialog";
import { pathLabel, rootLabel, type DeleteImpact, type Folder, type MoveOption, type TargetOption } from "./explorerModel";

export function TargetPickerDialog({ title, hint, confirmLabel, options, initialTarget, onPick, onClose }: { title: string; hint?: string; confirmLabel: string; options: TargetOption[]; initialTarget?: Pick<TargetOption, "kind" | "id">; onPick: (option: TargetOption) => void; onClose: () => void }) {
  return <LinkTargetPicker title={title} hint={hint} confirmLabel={confirmLabel} options={options} initial={initialTarget ? { kind: "target", targetKind: initialTarget.kind, id: initialTarget.id } : undefined} onClose={onClose} onApply={(value) => { if (value.kind === "target") onPick(value.option); }} />;
}

export function MoveDialog({ itemName, kindLabel, options, onPick, onClose }: {
  itemName: string; kindLabel: string; options: MoveOption[]; onPick: (parentId: string | null) => void; onClose: () => void;
}) {
  const { t: tr } = useTranslation("modules");
  return (
    <ModalDialog title={tr("explorerDialogs.moveTo", { itemName })} onClose={onClose} width={520} actions={<button type="button" className="w98-btn" onClick={onClose}>{tr("iconPicker.cancel")}</button>}>
      <p className="w98-hint">{tr("explorerDialogs.chooseWhichFolderToPut")}</p>
      <ul className="move-list w98-sunken" aria-label={tr("explorerDialogs.destinationForMovingThe", { kindLabel })}>
        {options.map((option) => (
          <li key={option.id ?? "root"}>
            <button type="button" className={"move-option" + (option.current ? " current" : "")} disabled={option.disabled || option.current} data-autofocus={option.current ? undefined : option.id === null ? "" : undefined} onClick={() => onPick(option.id)}>
              <span>{option.path}</span>
              {option.current ? <small>{tr("explorerDialogs.currentLocation")}</small> : option.disabled ? <small>{option.reason}</small> : null}
            </button>
          </li>
        ))}
      </ul>
    </ModalDialog>
  );
}

export function DeleteFolderDialog({ folder, folders, impact, onConfirm, onClose }: {
  folder: Folder; folders: Folder[]; impact: DeleteImpact; onConfirm: () => void; onClose: () => void;
}) {
  const { t: tr } = useTranslation("modules");
  const shownFolders = impact.folders.slice(0, 6);
  const shownShortcuts = impact.shortcuts.slice(0, 6);
  const rest = impact.total - shownFolders.length - shownShortcuts.length;
  return (
    <ModalDialog
      title={tr("explorerDialogs.deleteFolder", { name: folder.name })}
      onClose={onClose}
      actions={<><button type="button" className="w98-btn" data-autofocus onClick={onClose}>{tr("iconPicker.cancel")}</button><button type="button" className="w98-btn danger" onClick={onConfirm}>{tr("links.delete")}</button></>}
    >
      {impact.total === 0 ? <p>{tr("explorerDialogs.thisFolderIsEmpty")}</p> : (
        <>
          <p>{tr("explorerDialogs.alsoRemoved", { count: impact.total })}</p>
          <ul className="impact-list">
            {shownFolders.map((item) => <li key={item.id}>📁 {pathLabel(folders, item.id).replace(`${rootLabel()} / `, "")}</li>)}
            {shownShortcuts.map((item) => <li key={item.id}>↗ {item.label}</li>)}
            {rest > 0 ? <li>{tr("explorerDialogs.moreItems", { count: rest })}</li> : null}
          </ul>
        </>
      )}
      <p className="w98-hint">{tr("explorerDialogs.aShortcutIsOnlyA")}</p>
    </ModalDialog>
  );
}
