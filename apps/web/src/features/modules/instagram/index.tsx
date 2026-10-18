import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleProps } from "../types";
import { IgEditorWorkspace, IgSkinPicker } from "./IgEditorWorkspace";
import { IgEditForm } from "./IgEditForm";
import { IgPreview } from "./IgPreview";
import styles from "./ocEditor.module.css";

export function IgView({ window, ctx }: ModuleProps<"instagram">) {
  const background = ctx.profileThemeOverride?.background ?? ctx.tv.face;
  return <div className="ig-frame" style={{ background }}><div className="ig-frame-inner"><IgPreview window={window} ctx={ctx} /></div></div>;
}

export function IgInlineEditor(props: ModuleProps<"instagram">) {
  const { t: tr } = useTranslation("instagram");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const id = useId();
  const canonical = !!(props.ctx.updateContent && props.ctx.onProfileChange && props.ctx.profiles?.some((profile) => profile.id === props.ctx.profileId));
  const tabs = [["edit", tr("instagram.editContent")], ["preview", tr("instagram.previewInteractions")]] as const;
  const onModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <div className={`ig-frame ${styles.editor}`} style={{ background: props.ctx.profileThemeOverride?.background ?? props.ctx.tv.face }}>
    <div role="tablist" aria-label={tr("instagram.instagramEditMode")} className="w98-tabs ig-modes">
      {tabs.map(([key, label], index) => <button key={key} id={`${id}-${key}-tab`} type="button" role="tab" className="w98-tab"
        aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1}
        onKeyDown={(event) => onModeKeyDown(event, index)} onClick={() => setTab(key)}>{label}</button>)}
      <span className="ig-mode-hint">{tab === "edit" ? tr("instagram.whenYoureDoneSwitchTo") : tr("instagram.draftPreviewIncludingUnpublishedContent")}</span>
    </div>
    <div role="tabpanel" id={`${id}-edit-panel`} aria-labelledby={`${id}-edit-tab`} hidden={tab !== "edit"} className={styles.modePanel}>
      {canonical ? <IgEditorWorkspace {...props} /> : <>
        <IgSkinPicker {...props} />
        <div className="ig-edit-scroll w98-scroll" tabIndex={0} aria-label={tr("igEditorWorkspace.instagramContentEditor")}><IgEditForm {...props} /></div>
      </>}
    </div>
    <div role="tabpanel" id={`${id}-preview-panel`} aria-labelledby={`${id}-preview-tab`} hidden={tab !== "preview"} className={`ig-frame-inner ${styles.modePanel}`}>
      {tab === "preview" ? <IgPreview window={props.window} ctx={props.ctx} /> : null}
    </div>
  </div>;
}
