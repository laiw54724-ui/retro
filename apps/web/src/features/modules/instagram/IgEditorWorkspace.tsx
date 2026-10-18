import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import type { ModuleProps } from "../types";
import { CanonicalCollectionEditor } from "./CanonicalCollectionEditor";
import { CanonicalHighlightEditor } from "./CanonicalHighlightEditor";
import { CanonicalPostEditor } from "./CanonicalPostEditor";
import { CanonicalSocialEditor } from "./CanonicalSocialEditor";
import { IgEditForm } from "./IgEditForm";
import { ProfileAppearanceEditor, ProfileEditor } from "./ProfileEditor";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";
import styles from "./ocEditor.module.css";

const sections = [
  ["profile", "角色資料"],
  ["posts", "貼文"],
  ["collections", "精選／合集"],
  ["social", "互動"],
  ["appearance", "外觀"],
] as const;
type Section = typeof sections[number][0];

export function IgSkinPicker(props: ModuleProps<"instagram">) {
  return <div role="group" aria-label="Instagram 介面樣式" className="ig-skin-picker">
    <span>介面樣式</span>
    {([["win98", "Win98"], ["modern", "現代"]] as const).map(([skin, label]) => (
      <button key={skin} type="button" className={`mini-btn${props.window.content.skin === skin ? " on" : ""}`} aria-pressed={props.window.content.skin === skin}
        onClick={() => props.update((window) => ({ ...window, content: { ...window.content, skin } }))}>{label}</button>
    ))}
  </div>;
}

/** A local workspace around the existing canonical operations; it never stores UI state in v2. */
export function IgEditorWorkspace(props: ModuleProps<"instagram">) {
  const { ctx } = props;
  const scope = igEditorScope(props);
  const [section, setSection] = useIgEditorState<Section>(scope, "profile");
  const [retargetId, setRetargetId] = useIgEditorState(scope, "");
  const id = useId();
  const sectionTabs = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const positionKey = `${scope}:${section}`;
  const current = ctx.profiles?.find((profile) => profile.id === ctx.profileId);

  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = positions.current.get(positionKey) ?? 0;
  }, [positionKey]);

  if (!current || !ctx.profiles || !ctx.onProfileChange) return null;
  const changeProfile = (patch: Record<string, unknown>, key?: string) => ctx.onProfileChange?.(current.id, patch, key);
  const onSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1
      : event.key === "ArrowRight" ? (index + 1) % sections.length
      : event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length : null;
    if (next === null) return;
    event.preventDefault();
    setSection(sections[next][0]);
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
    <div ref={sectionTabs} role="tablist" aria-label="OC 編輯分組" className={styles.sections}>
      {sections.map(([key, label], index) => <button
        key={key} id={`${id}-${key}-tab`} type="button" role="tab" className="w98-btn small"
        aria-selected={section === key} aria-controls={`${id}-${key}-panel`} tabIndex={section === key ? 0 : -1}
        onKeyDown={(event) => onSectionKeyDown(event, index)} onClick={() => setSection(key)}>{label}</button>)}
    </div>
    <div ref={scroll} className={`ig-edit-scroll w98-scroll ${styles.content}`} tabIndex={0} aria-label="Instagram 編輯內容"
      onScroll={(event) => positions.current.set(positionKey, event.currentTarget.scrollTop)}>
      <section role="tabpanel" id={`${id}-profile-panel`} aria-labelledby={`${id}-profile-tab`} hidden={section !== "profile"} className={styles.panel}>
        <ProfileEditor profile={current} onChange={changeProfile} showAppearance={false} upload={async (file) => (await ctx.upload?.(file, "image")) ?? null} />
        <IgEditForm {...props} section="profile" />
        {ctx.onProfileDelete ? <details className={styles.management}>
          <summary>角色管理</summary>
          <div className="ig-profile-delete">
            {ctx.profileDeleteGuard ? <p className="w98-hint">使用中的視窗：{ctx.profileDeleteGuard.windowTitles.join("、") || "無"}；貼文：{ctx.profileDeleteGuard.postIds.length} 篇</p> : null}
            {ctx.profileDeleteBlocked ? <label className="w98-field"><span>此角色仍被視窗／貼文使用，改指派給</span>
              <select className="w98-input compact" value={validRetarget} onChange={(event) => setRetargetId(event.target.value)}>
                <option value="">請選擇角色</option>
                {ctx.profiles.filter((profile) => profile.id !== current.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name}</option>)}
              </select>
            </label> : null}
            <button type="button" className="w98-btn small danger" disabled={ctx.profileDeleteBlocked && !validRetarget}
              onClick={() => ctx.onProfileDelete?.(current.id, validRetarget || undefined)}>{ctx.profileDeleteBlocked ? "刪除並轉接" : "刪除角色"}</button>
          </div>
        </details> : null}
      </section>
      <section role="tabpanel" id={`${id}-posts-panel`} aria-labelledby={`${id}-posts-tab`} hidden={section !== "posts"} className={styles.panel}>
        <CanonicalPostEditor props={props} />
      </section>
      <section role="tabpanel" id={`${id}-collections-panel`} aria-labelledby={`${id}-collections-tab`} hidden={section !== "collections"} className={styles.panel}>
        <p className="w98-hint">精選用多頁圖片說故事；合集整理已建立的貼文。</p>
        <CanonicalHighlightEditor props={props} />
        <CanonicalCollectionEditor props={props} />
      </section>
      <section role="tabpanel" id={`${id}-social-panel`} aria-labelledby={`${id}-social-tab`} hidden={section !== "social"} className={styles.panel}>
        <CanonicalSocialEditor props={props} />
        <IgEditForm {...props} section="interaction" />
        <p className="w98-hint">單篇作品的喜歡者與留言在「貼文」內編輯。</p>
        <button type="button" className="w98-btn small" onClick={() => {
          setSection("posts");
          sectionTabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.focus();
        }}>前往貼文互動</button>
      </section>
      <section role="tabpanel" id={`${id}-appearance-panel`} aria-labelledby={`${id}-appearance-tab`} hidden={section !== "appearance"} className={styles.panel}>
        <IgSkinPicker {...props} />
        <fieldset className="w98-fieldset"><legend>角色內容配色</legend><ProfileAppearanceEditor profile={current} onChange={changeProfile} /></fieldset>
        <IgEditForm {...props} section="appearance" />
      </section>
    </div>
  </div>;
}
