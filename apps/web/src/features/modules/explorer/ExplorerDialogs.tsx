import { useMemo, useState } from "react";
import { ModalDialog } from "../../../components/ModalDialog";
import { pathLabel, type DeleteImpact, type Folder, type MoveOption, type TargetOption } from "./explorerModel";

export function TargetPickerDialog({ title, hint, confirmLabel, options, onPick, onClose }: {
  title: string; hint?: string; confirmLabel: string; options: TargetOption[]; onPick: (option: TargetOption) => void; onClose: () => void;
}) {
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
      actions={<><button type="button" className="w98-btn" onClick={onClose}>取消</button><button type="button" className="w98-btn primary" disabled={!selected} onClick={() => selected && onPick(selected)}>{confirmLabel}</button></>}
    >
      {hint ? <p className="w98-hint">{hint}</p> : null}
      <label className="w98-field"><span>搜尋</span><input data-autofocus className="w98-input" type="search" value={query} placeholder="輸入視窗、OC 或貼文名稱…" onChange={(event) => setQuery(event.target.value)} /></label>
      {options.length === 0 ? <p className="explorer-empty">這個桌面還沒有可以建立捷徑的視窗、OC 或貼文。</p> : null}
      {options.length > 0 && shown.length === 0 ? <p className="explorer-empty" role="status">找不到「{query}」。</p> : null}
      <div className="target-list w98-sunken" role="listbox" aria-label="捷徑目標">
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
  return (
    <ModalDialog title={`移動「${itemName}」到…`} onClose={onClose} width={520} actions={<button type="button" className="w98-btn" onClick={onClose}>取消</button>}>
      <p className="w98-hint">選擇要放進哪個資料夾。完整路徑可以分辨同名的資料夾；灰色項目說明為什麼不能移到那裡。</p>
      <ul className="move-list w98-sunken" aria-label={`移動${kindLabel}的目的地`}>
        {options.map((option) => (
          <li key={option.id ?? "root"}>
            <button type="button" className={"move-option" + (option.current ? " current" : "")} disabled={option.disabled || option.current} data-autofocus={option.current ? undefined : option.id === null ? "" : undefined} onClick={() => onPick(option.id)}>
              <span>{option.path}</span>
              {option.current ? <small>目前位置</small> : option.disabled ? <small>{option.reason}</small> : null}
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
  const shownFolders = impact.folders.slice(0, 6);
  const shownShortcuts = impact.shortcuts.slice(0, 6);
  const rest = impact.total - shownFolders.length - shownShortcuts.length;
  return (
    <ModalDialog
      title={`刪除資料夾「${folder.name}」`}
      onClose={onClose}
      actions={<><button type="button" className="w98-btn" data-autofocus onClick={onClose}>取消</button><button type="button" className="w98-btn danger" onClick={onConfirm}>刪除</button></>}
    >
      {impact.total === 0 ? <p>這個資料夾是空的。</p> : (
        <>
          <p>刪除後，下列 {impact.total} 個項目也會一起移除：</p>
          <ul className="impact-list">
            {shownFolders.map((item) => <li key={item.id}>📁 {pathLabel(folders, item.id).replace(/^桌面 \/ /, "")}</li>)}
            {shownShortcuts.map((item) => <li key={item.id}>↗ {item.label}</li>)}
            {rest > 0 ? <li>…還有 {rest} 個項目</li> : null}
          </ul>
        </>
      )}
      <p className="w98-hint">捷徑只是參照：原本的視窗、OC 與貼文不會被刪除。刪除後可以用「復原」找回。</p>
    </ModalDialog>
  );
}
