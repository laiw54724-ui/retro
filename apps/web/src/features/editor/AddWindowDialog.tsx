import type { DesktopWindow } from "@retrodesk/shared";
import { useTranslation } from "react-i18next";
import { Icon } from "../../components/Icon";
import { ModalDialog } from "../../components/ModalDialog";
import { creatableModuleDefinitions } from "../modules/registry";
import { useImageWriter } from "./ImageWriteContext";
import { groupModules } from "./moduleGroups";
import styles from "./AuthoringShell.module.css";

type Props = { onAdd: (type: DesktopWindow["type"]) => void };

export function AddWindowCatalog({ onAdd }: Props) {
  const { t } = useTranslation("editor");
  const imageWriter = useImageWriter();
  return <div className={styles.catalog}>
    <p className="w98-hint">{t("authoring.addHint")}</p>
    {groupModules(creatableModuleDefinitions, imageWriter).map(group => <section key={group.id}>
      <h3>{t(`authoring.groups.${group.id}`)}</h3>
      <div className={styles.cards}>{group.modules.map(module => <button key={module.type} type="button" className="w98-btn add-card m-add" onClick={() => onAdd(module.type)}>
        <Icon name={module.icon} size={32} />
        <span className="add-card-text"><strong>{t(`modules.${module.type}.label`, { defaultValue: module.label })}</strong><span>{t(`modules.${module.type}.description`, { defaultValue: module.description })}</span></span>
      </button>)}</div>
    </section>)}
  </div>;
}

export function AddWindowDialog({ onAdd, onClose }: Props & { onClose: () => void }) {
  const { t } = useTranslation("editor");
  return <ModalDialog title={t("authoring.add")} className={`m-sheet ${styles.addDialog}`} width={640} onClose={onClose} actions={<button type="button" className="w98-btn" onClick={onClose}>{t("editor.cancel")}</button>}>
    <AddWindowCatalog onAdd={onAdd} />
  </ModalDialog>;
}
