import { ModalDialog } from "../../components/ModalDialog";
import { useEditorStore } from "./store";

/** Lists the Explorer shortcuts an edit would orphan and lets the author confirm or back out. */
export function IntegrityDialog() {
  const pending = useEditorStore((state) => state.pendingIntegrity);
  const confirm = useEditorStore((state) => state.confirmIntegrity);
  const cancel = useEditorStore((state) => state.cancelIntegrity);
  if (!pending) return null;
  const count = pending.impacts.length;
  return (
    <ModalDialog
      title={`這項刪除會影響 ${count} 個捷徑`}
      width={520}
      dismissOnBackdrop={false}
      onClose={cancel}
      actions={(
        <>
          <button type="button" className="w98-btn" data-autofocus onClick={cancel}>取消</button>
          <button type="button" className="w98-btn danger" onClick={confirm}>刪除並移除 {count} 個捷徑</button>
        </>
      )}
    >
      <p>下列 Explorer 捷徑指向即將刪除的內容。確認後<strong>只會移除這些捷徑</strong>，它們所在的資料夾和其他內容都不會被刪除。可以用「復原」一次還原。</p>
      <ul className="integrity-list" aria-label="受影響的捷徑">
        {pending.impacts.map((item) => (
          <li key={`${item.explorerId}:${item.shortcutId}`}>
            <strong>{item.label}</strong>
            <small>{item.explorerTitle} / {item.folderPath} · 指向 {item.targetText}</small>
          </li>
        ))}
      </ul>
    </ModalDialog>
  );
}
