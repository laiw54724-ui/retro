import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import type { ModuleProps } from "../types";
import { CanonicalCollectionEditor } from "./CanonicalCollectionEditor";
import { CanonicalHighlightEditor } from "./CanonicalHighlightEditor";
import { CanonicalPostEditor } from "./CanonicalPostEditor";
import { CanonicalSocialEditor } from "./CanonicalSocialEditor";
import { IgEditForm } from "./IgEditForm";
import { ProfileAppearanceEditor, ProfileEditor } from "./ProfileEditor";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { useLocaleFormatting } from "../../../i18n/format";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";
import { IgDraftProvider } from "./IgDraftInput";
import styles from "./ocEditor.module.css";

const SECTION_KEYS = ["profile", "posts", "collections", "social", "appearance"] as const;
type Section = typeof SECTION_KEYS[number];
const sectionLabels = (): Record<Section, string> => ({ profile: i18n.t("instagram:igEditorWorkspace.characterInfo"), posts: i18n.t("instagram:igEditorWorkspace.post"), collections: i18n.t("instagram:igEditorWorkspace.highlightsCollections"), social: i18n.t("instagram:igEditorWorkspace.interactions"), appearance: i18n.t("instagram:igEditorWorkspace.appearance") });

export function IgSkinPicker(props: ModuleProps<"instagram">) {
  const { t: tr } = useTranslation("instagram");
  return <div role="group" aria-label={tr("igEditorWorkspace.instagramInterfaceStyle")} className="ig-skin-picker">
    <span>{tr("igEditorWorkspace.interfaceStyle")}</span>
    {([["win98", "Win98"], ["modern", tr("igEditorWorkspace.modern")]] as const).map(([skin, label]) => (
      <button key={skin} type="button" className={`mini-btn${props.window.content.skin === skin ? " on" : ""}`} aria-pressed={props.window.content.skin === skin}
        onClick={() => props.update((window) => ({ ...window, content: { ...window.content, skin } }))}>{label}</button>
    ))}
  </div>;
}

/** A local workspace around the existing canonical operations; it never stores UI state in v2. */
export function IgEditorWorkspace(props: ModuleProps<"instagram">) {
  return <IgDraftProvider><IgEditorWorkspaceContent {...props} /></IgDraftProvider>;
}

function IgEditorWorkspaceContent(props: ModuleProps<"instagram">) {
  const { t: tr } = useTranslation("instagram");
  const { formatList } = useLocaleFormatting();
  const { ctx } = props;
  const scope = igEditorScope(props);
  const [section, setSection] = useIgEditorState<Section>(scope, "profile");
  const [collectionKind, setCollectionKind] = useIgEditorState<"highlights" | "collections">(scope, "highlights");
  const [retargetId, setRetargetId] = useIgEditorState(scope, "");
  const id = useId();
  const sectionTabs = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const positionKey = `${scope}:${section}:${section === "collections" ? collectionKind : ""}`;
  const current = ctx.profiles?.find((profile) => profile.id === ctx.profileId);

  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = positions.current.get(positionKey) ?? 0;
  }, [positionKey]);

  if (!current || !ctx.profiles || !ctx.onProfileChange) return null;
  const changeProfile = (patch: Record<string, unknown>, key?: string) => ctx.onProfileChange?.(current.id, patch, key);
  const onSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? SECTION_KEYS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % SECTION_KEYS.length
      : event.key === "ArrowLeft" ? (index + SECTION_KEYS.length - 1) % SECTION_KEYS.length : null;
    if (next === null) return;
    event.preventDefault();
    setSection(SECTION_KEYS[next]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const validRetarget = ctx.profiles.some((profile) => profile.id === retargetId && profile.id !== current.id) ? retargetId : "";

  return <div className={styles.workspace}>
    <div className={styles.switcher}>
      <ProfileSwitcher
        profiles={ctx.profiles}
        currentId={current.id}
        onSelect={(profileId) => ctx.onProfileSelect?.(profileId)}
        onAdd={() => ctx.onProfileAdd?.()}
        onDuplicate={(profileId) => ctx.onProfileDuplicate?.(profileId)}
      />
    </div>
    <div ref={sectionTabs} role="tablist" aria-label={tr("igEditorWorkspace.ocEditingSections")} className={styles.sections}>
      {SECTION_KEYS.map((key, index) => <button
        key={key} id={`${id}-${key}-tab`} type="button" role="tab" className="w98-btn small" data-help={key === "collections" ? "ig-tab-collections" : undefined}
        aria-selected={section === key} aria-controls={`${id}-${key}-panel`} tabIndex={section === key ? 0 : -1}
        onKeyDown={(event) => onSectionKeyDown(event, index)} onClick={() => setSection(key)}>{sectionLabels()[key]}</button>)}
    </div>
    <div ref={scroll} className={`ig-edit-scroll w98-scroll ${styles.content}`} tabIndex={0} aria-label={tr("igEditorWorkspace.instagramContentEditor")}
      onScroll={(event) => positions.current.set(positionKey, event.currentTarget.scrollTop)}>
      <section role="tabpanel" id={`${id}-profile-panel`} aria-labelledby={`${id}-profile-tab`} hidden={section !== "profile"} className={styles.panel}>
        <ProfileEditor siteId={ctx.siteId ?? ""} windowId={props.window.id} draftScope={scope} profiles={ctx.profiles} profile={current} onChange={changeProfile} showAppearance={false} upload={ctx.upload ? (file) => ctx.upload!(file, "image") : undefined} />
        <IgEditForm {...props} section="profile" />
        {ctx.onProfileDelete ? <details className={styles.management}>
          <summary>{tr("igEditorWorkspace.characterManagement")}</summary>
          <div className="ig-profile-delete">
            {ctx.profileDeleteGuard ? <p className="w98-hint">{tr("ig.guardSummary", { windows: formatList(ctx.profileDeleteGuard.windowTitles) || tr("igEditorWorkspace.none"), count: ctx.profileDeleteGuard.postIds.length })}</p> : null}
            {ctx.profileDeleteBlocked ? <label className="w98-field"><span>{tr("igEditorWorkspace.thisCharacterIsStillUsed")}</span>
              <select className="w98-input compact" value={validRetarget} onChange={(event) => setRetargetId(event.target.value)}>
                <option value="">{tr("igEditorWorkspace.chooseACharacter")}</option>
                {ctx.profiles.filter((profile) => profile.id !== current.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name}</option>)}
              </select>
            </label> : null}
            <button type="button" className="w98-btn small danger" disabled={ctx.profileDeleteBlocked && !validRetarget}
              onClick={() => ctx.onProfileDelete?.(current.id, validRetarget || undefined)}>{ctx.profileDeleteBlocked ? tr("igEditorWorkspace.deleteAndReassign") : tr("igEditorWorkspace.deleteCharacter")}</button>
          </div>
        </details> : null}
      </section>
      <section role="tabpanel" id={`${id}-posts-panel`} aria-labelledby={`${id}-posts-tab`} hidden={section !== "posts"} className={styles.panel}>
        <CanonicalPostEditor props={props} />
      </section>
      <section role="tabpanel" id={`${id}-collections-panel`} aria-labelledby={`${id}-collections-tab`} hidden={section !== "collections"} className={styles.panel}>
        <div className={styles.collectionSwitch} role="group" aria-label={tr("editorFlow.organizeContent")} data-help="ig-collection-switch">
          <button type="button" className="w98-btn small" aria-pressed={collectionKind === "highlights"} onClick={() => setCollectionKind("highlights")}>{tr("editorFlow.highlights")}</button>
          <button type="button" className="w98-btn small" aria-pressed={collectionKind === "collections"} onClick={() => setCollectionKind("collections")}>{tr("editorFlow.collections")}</button>
        </div>
        <div hidden={collectionKind !== "highlights"}><CanonicalHighlightEditor props={props} /></div>
        <div hidden={collectionKind !== "collections"}><CanonicalCollectionEditor props={props} /></div>
      </section>
      <section role="tabpanel" id={`${id}-social-panel`} aria-labelledby={`${id}-social-tab`} hidden={section !== "social"} className={styles.panel}>
        <CanonicalSocialEditor props={props} />
        <IgEditForm {...props} section="interaction" />
        <p className="w98-hint">{tr("igEditorWorkspace.likersAndCommentsForA")}</p>
        <button type="button" className="w98-btn small" onClick={() => {
          setSection("posts");
          sectionTabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.focus();
        }}>{tr("igEditorWorkspace.goToPostInteractions")}</button>
      </section>
      <section role="tabpanel" id={`${id}-appearance-panel`} aria-labelledby={`${id}-appearance-tab`} hidden={section !== "appearance"} className={styles.panel}>
        <IgSkinPicker {...props} />
        <fieldset className="w98-fieldset"><legend>{tr("igEditorWorkspace.characterContentColors")}</legend><ProfileAppearanceEditor profile={current} onChange={changeProfile} /></fieldset>
        <IgEditForm {...props} section="appearance" />
      </section>
    </div>
  </div>;
}
