import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalDialog } from "../../components/ModalDialog";
import { safeHref } from "../modules/types";
import type { TargetOption } from "./targetCatalog";
import styles from "./LinkTargetPicker.module.css";
export type PickerValue = { kind: "url"; url: string } | { kind: "target"; option: TargetOption };
export function LinkTargetPicker({ title, hint, confirmLabel, options, initial, allowUrl = false, onApply, onClose, onRemove }: { title: string; hint?: string; confirmLabel?: string; options: TargetOption[]; initial?: { kind: "url"; url: string } | { kind: "target"; targetKind: TargetOption["kind"]; id: string; url?: string }; allowUrl?: boolean; onApply: (value: PickerValue) => void; onClose: () => void; onRemove?: () => void }) {
  const { t } = useTranslation("modules");
  const [query, setQuery] = useState("");
  const [urlMode, setUrlMode] = useState(allowUrl && initial?.kind === "url");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [key, setKey] = useState(initial?.kind === "target" ? `${initial.targetKind}:${initial.id}` : "");
  const selected = options.find((option) => `${option.kind}:${option.id}` === key);
  const shown = options.filter((option) => `${option.label} ${option.group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const validUrl = url.trim() !== "" && !/^(?:https?:\/\/|mailto:)$/i.test(url.trim()) && safeHref(url.trim()) !== "#";
  const help = useId();
  return <ModalDialog title={title} onClose={onClose} width={520} actions={<>
    {onRemove ? <button type="button" className="w98-btn" onClick={onRemove}>{t("navigationTargets.removeTarget")}</button> : null}
    <button type="button" className="w98-btn" onClick={onClose}>{t("iconPicker.cancel")}</button>
    <button type="button" className="w98-btn primary" disabled={urlMode ? !validUrl : !selected} onClick={() => { if (urlMode && validUrl) onApply({ kind: "url", url: url.trim() }); else if (!urlMode && selected) onApply({ kind: "target", option: selected }); }}>{confirmLabel ?? t("navigationTargets.apply")}</button>
  </>}>
    {hint ? <p className="w98-hint">{hint}</p> : null}
    {allowUrl ? <div className={styles.types}><button type="button" className="w98-btn" aria-pressed={urlMode} onClick={() => setUrlMode(true)}>{t("links.url")}</button><button type="button" className="w98-btn" aria-pressed={!urlMode} onClick={() => setUrlMode(false)}>{t("links.inSiteWindow")}</button></div> : null}
    {urlMode ? <><label className="w98-field"><span>{t("document.linkUrl")}</span><input data-autofocus className="w98-input" value={url} maxLength={2048} aria-invalid={!validUrl} aria-describedby={help} onChange={(event) => setUrl(event.currentTarget.value)} placeholder="https://" /></label><p id={help} className="w98-hint">{t("navigationTargets.urlHelp")}</p></> : <>
      <label className="w98-field"><span>{t("explorerDialogs.search")}</span><input data-autofocus className="w98-input" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      {key && !selected ? <p role="status">{t("navigationTargets.unavailable")}</p> : null}
      {!shown.length ? <p role="status">{t("explorerDialogs.notFound", { query })}</p> : null}
      <div className={`${styles.list} w98-sunken`} role="listbox" aria-label={t("explorerDialogs.shortcutTarget")} onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
        event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click();
      }}>
        {shown.map((option) => <button key={`${option.kind}:${option.id}`} type="button" role="option" aria-selected={selected === option} className={`w98-btn ${styles.option}`} onClick={() => setKey(`${option.kind}:${option.id}`)} onDoubleClick={allowUrl ? undefined : () => onApply({ kind: "target", option })}>{option.group}: {option.label}</button>)}
      </div>
    </>}
  </ModalDialog>;
}
