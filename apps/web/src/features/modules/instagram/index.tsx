import { useState } from "react";
import { IgEditForm } from "./IgEditForm";
import { IgPreview } from "./IgPreview";
import type { ModuleProps } from "../types";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { ProfileEditor } from "./ProfileEditor";

export function IgView({ window, ctx }: ModuleProps<"instagram">) {
  const background = ctx.profileThemeOverride?.background ?? ctx.tv.face;
  return <div className="ig-frame" style={{ background }}><div className="ig-frame-inner"><IgPreview window={window} ctx={ctx} /></div></div>;
}

/** In the editor the window has two tabs: the edit form and the interactive preview. */
export function IgInlineEditor(props: ModuleProps<"instagram">) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [retargetId, setRetargetId] = useState("");
  const currentProfile = props.ctx.profiles?.find((profile) => profile.id === props.ctx.profileId);
  const tabs: Array<["edit" | "preview", string]> = [["edit", "✎ 編輯內容"], ["preview", "▶ 預覽互動"]];
  return (
    <div className="ig-frame" style={{ background: props.ctx.profileThemeOverride?.background ?? props.ctx.tv.face }}>
      <div role="tablist" className="w98-tabs ig-modes">
        {tabs.map(([id, label]) => <button key={id} role="tab" type="button" className="w98-tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        <span className="ig-mode-hint">{tab === "edit" ? "改完切到「預覽互動」試玩" : "訪客看到的樣子，可以直接點"}</span>
      </div>
      <div role="group" aria-label="Instagram 介面樣式" className="ig-skin-picker">
        <span>介面樣式</span>
        {([['win98', 'Win98'], ['modern', '現代']] as const).map(([skin, label]) => (
          <button key={skin} type="button" className={`mini-btn${props.window.content.skin === skin ? " on" : ""}`} aria-pressed={props.window.content.skin === skin} onClick={() => props.update((window) => ({ ...window, content: { ...window.content, skin } }))}>{label}</button>
        ))}
      </div>
      {currentProfile && props.ctx.profiles && props.ctx.onProfileChange ? <div className="ig-profile-tools">
        <ProfileSwitcher profiles={props.ctx.profiles} currentId={currentProfile.id} onSelect={(id) => props.ctx.onProfileSelect?.(id)} onAdd={() => props.ctx.onProfileAdd?.()} onDuplicate={(id) => props.ctx.onProfileDuplicate?.(id)} />
        <ProfileEditor profile={currentProfile} onChange={(patch, key) => props.ctx.onProfileChange?.(currentProfile.id, patch, key)} upload={async (file) => (await props.ctx.upload?.(file, "image")) ?? null} />
        {props.ctx.onProfileDelete ? <div className="ig-profile-delete">
          <button type="button" className="w98-btn small danger" onClick={() => props.ctx.onProfileDelete?.(currentProfile.id, retargetId || undefined)}>刪除角色</button>
          {props.ctx.profileDeleteBlocked ? <label className="w98-field"><span>此角色仍被視窗／貼文使用，改指派給</span><select className="w98-input compact" value={retargetId} onChange={(event) => setRetargetId(event.target.value)}><option value="">請選擇角色</option>{props.ctx.profiles.filter((profile) => profile.id !== currentProfile.id).map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName ?? profile.name}</option>)}</select></label> : null}
        </div> : null}
      </div> : null}
      <div className="ig-frame-inner">{tab === "edit" ? <IgEditForm {...props} /> : <IgPreview window={props.window} ctx={props.ctx} />}</div>
    </div>
  );
}
