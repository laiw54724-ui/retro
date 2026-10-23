import { useId, useState, useRef, useEffect, useLayoutEffect, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { createHighlight, createPost } from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { IgEditorWorkspace, IgSkinPicker, type Section, type SectionRequest } from "./IgEditorWorkspace";
import { IgEditForm } from "./IgEditForm";
import { IgPreview } from "./IgPreview";
import { useIgHasPendingDrafts } from "./useIgSessionValue";
import { buildProfileDirectory } from "./profileDirectory";
import { translateSystemMessage } from "../../../i18n/systemMessages";
import styles from "./ocEditor.module.css";

export function IgView({ window, ctx }: ModuleProps<"instagram">) {
  const background = ctx.profileThemeOverride?.background ?? ctx.tv.face;
  return <div className="ig-frame" style={{ background }}><div className="ig-frame-inner"><IgPreview window={window} ctx={ctx} /></div></div>;
}

export function IgInlineEditor(props: ModuleProps<"instagram">) {
  const { t: tr } = useTranslation("instagram");
  const hasPendingDrafts = useIgHasPendingDrafts();
  const showedPending = useRef(false);
  if (hasPendingDrafts) showedPending.current = true;
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [actorChoice, setActorChoice] = useState<string | null>(null);
  useEffect(() => setActorChoice(null), [props.ctx.profileId]);
  const [asVisitor, setAsVisitor] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sectionRequest, setSectionRequest] = useState<SectionRequest>();
  const [appError, setAppError] = useState("");
  const id = useId();
  const editPanel = useRef<HTMLDivElement>(null);
  const lastInput = useRef<HTMLElement | null>(null);
  const savedScroll = useRef(0);
  const wasPreview = useRef(false);
  useLayoutEffect(() => {
    if (tab === "edit" && wasPreview.current) {
      const scroll = editPanel.current?.querySelector<HTMLElement>(".ig-edit-scroll");
      if (scroll) scroll.scrollTop = savedScroll.current;
    }
    wasPreview.current = tab === "preview";
  }, [tab]);
  const changeMode = (next: "edit" | "preview") => {
    if (next === "preview") savedScroll.current = editPanel.current?.querySelector<HTMLElement>(".ig-edit-scroll")?.scrollTop ?? 0;
    setTab(next);
  };
  const canonical = !!(props.ctx.updateContent && props.ctx.onProfileChange && props.ctx.profiles?.some((profile) => profile.id === props.ctx.profileId));
  const actorId = props.ctx.profiles?.some((profile) => profile.id === actorChoice) ? actorChoice! : props.ctx.profileId;
  const actorProps = { ...props, ctx: { ...props.ctx, profileId: actorId, navigation: undefined, navigationRequest: undefined } };
  const publicDirectory = asVisitor && props.ctx.socialDocument ? buildProfileDirectory(props.ctx.socialDocument, true) : [];
  const publicEntry = publicDirectory.find((entry) => entry.id === actorId) ?? publicDirectory[0];
  const visitorCtx = { ...props.ctx, editing: false, viewDrafts: false, profileId: publicEntry?.id, profileDirectory: publicDirectory, profiles: props.ctx.profiles?.filter((profile) => profile.visibility === "published"), posts: undefined, socialDocument: undefined, updateContent: undefined, navigation: undefined, navigationRequest: undefined };
  const openSection = (section: Section, entityId?: string) => {
    setEditorOpen(true);
    setSectionRequest((current) => ({ section, entityId, token: (current?.token ?? 0) + 1 }));
  };
  const createDraft = (kind: "post" | "highlight") => {
    if (!props.ctx.siteId || !actorId || !props.ctx.updateContent) return;
    const id = `${kind}:${crypto.randomUUID()}`;
    let created = false;
    setAppError("");
    props.ctx.updateContent((document) => {
      const result = kind === "post"
        ? createPost(document, { id, authorProfileId: actorId }, { siteId: props.ctx.siteId! })
        : createHighlight(document, { id, ownerProfileId: actorId, title: tr("canonicalHighlightEditor.newHighlight") }, { siteId: props.ctx.siteId! });
      if (!result.ok) {
        setAppError(translateSystemMessage(result.diagnostics[0]?.message ?? "") || tr("inlineApp.createFailed"));
        return document;
      }
      created = true;
      return result.document;
    });
    if (created) openSection(kind === "post" ? "posts" : "collections", id);
  };
  const tabs = [["edit", tr("instagram.editContent")], ["preview", tr("instagram.previewInteractions")]] as const;
  const onModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index : null;
    if (next === null) return;
    event.preventDefault();
    changeMode(tabs[next][0]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <div className={`ig-frame ${styles.editor}`} style={{ background: props.ctx.profileThemeOverride?.background ?? props.ctx.tv.face }}>
    <div role="tablist" aria-label={tr("instagram.instagramEditMode")} className="w98-tabs ig-modes">
      {tabs.map(([key, label], index) => <button key={key} id={`${id}-${key}-tab`} type="button" role="tab" className="w98-tab"
        aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1}
        onKeyDown={(event) => onModeKeyDown(event, index)} onClick={() => changeMode(key)}>{label}</button>)}
      {tab === "preview" ? <span className="ig-mode-hint">{tr("instagram.draftPreviewIncludingUnpublishedContent")}</span> : null}
    </div>
    {showedPending.current ? <small className="w98-hint" role={hasPendingDrafts ? "status" : undefined} style={{ visibility: hasPendingDrafts ? "visible" : "hidden" }} data-ig-pending-drafts>{tr("editorFlow.pendingStatus")}</small> : null}
    <div ref={editPanel} onFocusCapture={(event) => { lastInput.current = event.target as HTMLElement; }} role="tabpanel" id={`${id}-edit-panel`} aria-labelledby={`${id}-edit-tab`} hidden={tab !== "edit"} className={styles.modePanel}>
      {canonical ? <>
        <section className={styles.appSurface} aria-label={tr("inlineApp.authoringApp")} hidden={editorOpen}>
          <div className={styles.appStrip}>
            {asVisitor ? <strong>{tr("inlineApp.visitorView")}</strong> : <label><span>{tr("inlineApp.actingAs")}</span><select aria-label={tr("inlineApp.actingAs")} value={actorId} onChange={(event) => setActorChoice(event.target.value)}>{props.ctx.profiles?.map((profile) => <option key={profile.id} value={profile.id}>@{profile.handle ?? profile.username}{profile.visibility === "draft" ? ` · ${tr("profileSwitcher.draft")}` : ""}</option>)}</select></label>}
            <span className={styles.appHint}>{asVisitor ? tr("inlineApp.visitorHint") : tr("inlineApp.draftHint")}</span>
            {!asVisitor ? <button type="button" className="w98-btn small" onClick={() => openSection("profile")}>{tr("inlineApp.manageFields")}</button> : null}
            <button type="button" className="w98-btn small" aria-pressed={asVisitor} onClick={() => setAsVisitor((current) => !current)}>{asVisitor ? tr("inlineApp.backToCharacter") : tr("inlineApp.viewAsVisitor")}</button>
          </div>
          {appError ? <p role="alert" className={styles.appError}>{appError}</p> : null}
          {asVisitor ? publicEntry ? <div className={styles.appBody}><IgPreview key={`visitor:${publicEntry.id}`} window={props.window} ctx={visitorCtx} /></div> : <p className={styles.emptyVisitor}>{tr("inlineApp.noPublicCharacter")}</p> : <div className={styles.appBody}><IgPreview key={`actor:${actorId}`} window={props.window} ctx={actorProps.ctx} authoring={{ actorId: actorId ?? "", onEditProfile: () => openSection("profile"), onNewPost: () => createDraft("post"), onEditPost: (id) => openSection("posts", id), onNewHighlight: () => createDraft("highlight"), onEditHighlight: (id) => openSection("collections", id) }} /></div>}
        </section>
        <div className={styles.workspaceFrame} hidden={!editorOpen}>
          <div className={styles.editHeader}><button type="button" className="w98-btn small" onClick={() => setEditorOpen(false)}>{tr("inlineApp.backToApp")}</button><span>{tr("inlineApp.actingAs")} @{props.ctx.profiles?.find((profile) => profile.id === actorId)?.handle ?? ""}</span></div>
          <IgEditorWorkspace {...actorProps} sectionRequest={sectionRequest} entryProfileId={props.ctx.profileId} onEntrySelect={(profileId) => { setActorChoice(null); props.ctx.onProfileSelect?.(profileId); }} actingAsLabel={actorChoice ? `${tr("inlineApp.actingAs")} @${props.ctx.profiles?.find((profile) => profile.id === actorId)?.handle ?? ""}` : undefined} />
        </div>
      </> : <>
        <IgSkinPicker {...props} />
        <div className="ig-edit-scroll w98-scroll" tabIndex={0} aria-label={tr("igEditorWorkspace.instagramContentEditor")}><IgEditForm {...props} /></div>
      </>}
    </div>
    <div role="tabpanel" id={`${id}-preview-panel`} aria-labelledby={`${id}-preview-tab`} hidden={tab !== "preview"} className={`ig-frame-inner ${styles.modePanel}`}>
      <button type="button" className="w98-btn small" onClick={() => {
        changeMode("edit");
        requestAnimationFrame(() => {
          if (lastInput.current?.isConnected && !lastInput.current.closest("[hidden]")) lastInput.current.focus({ preventScroll: true });
        });
      }}>{tr("editorFlow.backEditing")}</button>
      {tab === "preview" ? <IgPreview window={props.window} ctx={props.ctx} /> : null}
    </div>
  </div>;
}
