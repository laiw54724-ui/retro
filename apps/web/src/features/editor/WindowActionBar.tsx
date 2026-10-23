import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useImageWriter } from "./ImageWriteContext";
import styles from "./AuthoringShell.module.css";

type Props = { title: string; imageWindow?: boolean; editing: boolean; onEdit: () => void; onDone: () => void; onIcon: () => void; onSettings: () => void };

export function WindowActionBar({ title, imageWindow, editing, onEdit, onDone, onIcon, onSettings }: Props) {
  const { t } = useTranslation("editor");
  const imageWriter = useImageWriter();
  const editButton = useRef<HTMLButtonElement | null>(null);
  return <div className={styles.selection} role="group" aria-label={t("authoring.selection")}>
    <strong className={styles.selectedTitle} title={title}>{title}</strong>
    <button ref={editButton} type="button" className="w98-btn" aria-pressed={editing} disabled={imageWindow && !imageWriter} onClick={onEdit}>{t("mobile.editWindow")}</button>
    <button type="button" className="w98-btn" onClick={onIcon}>{t("rightPanel.icon")}</button>
    <button type="button" className="w98-btn" onClick={onSettings}>{t("mobile.edit")}</button>
    {editing ? <button type="button" className="w98-btn primary" onClick={() => { onDone(); requestAnimationFrame(() => editButton.current?.focus()); }}>{t("mobile.finishEditing")}</button> : null}
  </div>;
}
