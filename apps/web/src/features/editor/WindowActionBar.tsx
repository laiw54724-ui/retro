import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useImageWriter } from "./ImageWriteContext";
import styles from "./AuthoringShell.module.css";

type Props = { title: string; imageWindow?: boolean; editing: boolean; onEdit: () => void; onDone: () => void; onIcon: () => void; onSettings: () => void; onDuplicate: () => void; onDelete: () => void };

export function WindowActionBar({ title, imageWindow, editing, onEdit, onDone, onIcon, onSettings, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation("editor");
  const imageWriter = useImageWriter();
  editing = editing && (!imageWindow || imageWriter);
  const editButton = useRef<HTMLButtonElement | null>(null);
  return <div className={styles.selection} role="toolbar" aria-label={t("authoring.selection")} onKeyDown={event => {
    if (!(event.target instanceof HTMLButtonElement) || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
  }}>
    <strong className={styles.selectedTitle} title={title}>{title}</strong>
    <button ref={editButton} type="button" className="w98-btn" aria-pressed={editing} disabled={imageWindow && !imageWriter} onClick={onEdit}>{t("mobile.editWindow")}</button>
    <button type="button" className="w98-btn" onClick={onIcon}>{t("rightPanel.icon")}</button>
    <button type="button" className="w98-btn" onClick={onSettings}>{t("mobile.edit")}</button>
    <button type="button" className="w98-btn" disabled={imageWindow && !imageWriter} onClick={onDuplicate}>{t("rightPanel.duplicateWindow")}</button>
    <button type="button" className="w98-btn danger" onClick={onDelete}>{t("mobileEditor.deleteWindow")}</button>
    {editing ? <button type="button" className="w98-btn primary" onClick={() => { onDone(); requestAnimationFrame(() => editButton.current?.focus()); }}>{t("mobile.finishEditing")}</button> : null}
  </div>;
}
