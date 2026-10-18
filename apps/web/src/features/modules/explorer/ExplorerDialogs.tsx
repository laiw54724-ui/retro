import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "../../../components/ModalDialog";
import { pathLabel, rootLabel, type DeleteImpact, type Folder, type MoveOption, type TargetOption } from "./explorerModel";

export function TargetPickerDialog({ title, hint, confirmLabel, options, onPick, onClose }: {
  title: string; hint?: string; confirmLabel: string; options: TargetOption[]; onPick: (option: TargetOption) => void; onClose: () => void;
}) {
  const { t: tr } = useTranslation("modules");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TargetOption | null>(null);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => option.label.toLowerCase().includes(needle) || option.group.toLowerCase().includes(needle)) : options;
  }, [options, query]);
  const groups = useMemo(() => [...new Set(shown.map((option) => option.group))], [shown]);
  const isSelected = (option: TargetOption) => selected?.kind === option.kind && selected.id === option.id;
  return (
    <ModalDialog
      title={title}
      onClose={onClose}
      width={520}
      actions={<><button type="button" className="w98-btn" onClick={onClose}>{tr("iconPicker.cancel")}</button><button type="button" className="w98-btn primary" disabled={!selected} onClick={() => selected && onPick(selected)}>{confirmLabel}</button></>}
    >
      {hint ? <p className="w98-hint">{hint}</p> : null}
      <label className="w98-field"><span>{tr("explorerDialogs.search")}</span><input data-autofocus className="w98-input" type="search" value={query} placeholder={tr("explorerDialogs.enterAWindowOcOr")} onChange={(event) => setQuery(event.target.value)} /></label>
      {options.length === 0 ? <p className="explorer-empty">{tr("explorerDialogs.thisDesktopHasNoWindows")}</p> : null}
      {options.length > 0 && shown.length === 0 ? <p className="explorer-empty" role="status">{tr("explorerDialogs.notFound", { query })}</p> : null}
      <div className="target-list w98-sunken" role="listbox" aria-label={tr("explorerDialogs.shortcutTarget")}>
        {groups.map((group) => (
          <div key={group} role="group" aria-label={group}>
            <strong className="target-group">{group}</strong>
            {shown.filter((option) => option.group === group).map((option) => (
              <button
                key={`${option.kind}:${option.id}`}
                type="button"
                role="option"
                aria-selected={isSelected(option)}
                className={"target-option" + (isSelected(option) ? " selected" : "")}
                onClick={() => setSelected(option)}
                onDoubleClick={() => onPick(option)}
              >{option.label}</button>
            ))}
          </div>
        ))}
      </div>
    </ModalDialog>
  );
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
