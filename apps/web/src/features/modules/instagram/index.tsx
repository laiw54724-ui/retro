import { useEffect, useState } from "react";
import type { ModuleProps } from "../types";
import { CanonicalHighlightEditor } from "./CanonicalHighlightEditor";
import { CanonicalPostEditor } from "./CanonicalPostEditor";
import { CanonicalCollectionEditor } from "./CanonicalCollectionEditor";
import { CanonicalSocialEditor } from "./CanonicalSocialEditor";
import { IgEditForm } from "./IgEditForm";
import { IgPreview } from "./IgPreview";
import { ProfileEditor } from "./ProfileEditor";
import { ProfileSwitcher } from "./ProfileSwitcher";

export function IgView({ window, ctx }: ModuleProps<"instagram">) {
  const background = ctx.profileThemeOverride?.background ?? ctx.tv.face;

  return (
    <div className="ig-frame" style={{ background }}>
      <div className="ig-frame-inner">
        <IgPreview window={window} ctx={ctx} />
      </div>
    </div>
  );
}

export function IgInlineEditor(props: ModuleProps<"instagram">) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [retargetId, setRetargetId] = useState("");
  const currentProfile = props.ctx.profiles?.find(
    (profile) => profile.id === props.ctx.profileId,
  );

  useEffect(() => setRetargetId(""), [currentProfile?.id]);

  const tabs: Array<["edit" | "preview", string]> = [
    ["edit", "✎ 編輯內容"],
    ["preview", "▶ 預覽互動"],
  ];

  return (
    <div
      className="ig-frame"
      style={{
        background:
          props.ctx.profileThemeOverride?.background ?? props.ctx.tv.face,
      }}
    >
      <div role="tablist" className="w98-tabs ig-modes">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            className="w98-tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <span className="ig-mode-hint">
          {tab === "edit"
            ? "改完切到「預覽互動」試玩"
            : "訪客看到的樣子，可以直接點"}
        </span>
      </div>

      <div
        role="group"
        aria-label="Instagram 介面樣式"
        className="ig-skin-picker"
      >
        <span>介面樣式</span>
        {(
          [
            ["win98", "Win98"],
            ["modern", "現代"],
          ] as const
        ).map(([skin, label]) => (
          <button
            key={skin}
            type="button"
            className={`mini-btn${props.window.content.skin === skin ? " on" : ""}`}
            aria-pressed={props.window.content.skin === skin}
            onClick={() =>
              props.update((window) => ({
                ...window,
                content: { ...window.content, skin },
              }))
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "edit" ? (
        <div className="ig-edit-scroll w98-scroll" tabIndex={0} aria-label="Instagram 編輯內容">
        {currentProfile && props.ctx.profiles && props.ctx.onProfileChange ? <div className="ig-profile-tools">
          <ProfileSwitcher
            profiles={props.ctx.profiles}
            currentId={currentProfile.id}
            onSelect={(id) => props.ctx.onProfileSelect?.(id)}
            onAdd={() => props.ctx.onProfileAdd?.()}
            onDuplicate={(id) => props.ctx.onProfileDuplicate?.(id)}
          />
          <ProfileEditor
            profile={currentProfile}
            onChange={(patch, key) =>
              props.ctx.onProfileChange?.(currentProfile.id, patch, key)
            }
            upload={async (file) =>
              (await props.ctx.upload?.(file, "image")) ?? null
            }
          />
          <CanonicalSocialEditor props={props} />
          {props.ctx.onProfileDelete ? (
            <div className="ig-profile-delete">
              {props.ctx.profileDeleteGuard ? (
                <div className="w98-hint">
                  使用中的視窗：
                  {props.ctx.profileDeleteGuard.windowTitles.join("、") || "無"}
                  ；貼文：
                  {props.ctx.profileDeleteGuard.postIds.join("、") || "無"}
                </div>
              ) : null}
              {props.ctx.profileDeleteBlocked ? (
                <label className="w98-field">
                  <span>此角色仍被視窗／貼文使用，改指派給</span>
                  <select
                    className="w98-input compact"
                    value={retargetId}
                    onChange={(event) => setRetargetId(event.target.value)}
                  >
                    <option value="">請選擇角色</option>
                    {props.ctx.profiles
                      .filter((profile) => profile.id !== currentProfile.id)
                      .map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.displayName ?? profile.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="w98-btn small danger"
                disabled={props.ctx.profileDeleteBlocked && !retargetId}
                onClick={() =>
                  props.ctx.onProfileDelete?.(
                    currentProfile.id,
                    retargetId || undefined,
                  )
                }
              >
                {props.ctx.profileDeleteBlocked ? "刪除並轉接" : "刪除角色"}
              </button>
            </div>
          ) : null}
        </div> : null}
        <div className="ig-frame-inner ig-frame-inner-edit">
          <IgEditForm {...props}>
            <CanonicalHighlightEditor props={props} />
            <CanonicalPostEditor props={props} />
            <CanonicalCollectionEditor props={props} />
          </IgEditForm>
        </div>
        </div>
      ) : (
        <div className="ig-frame-inner">
          <IgPreview window={props.window} ctx={props.ctx} />
        </div>
      )}
    </div>
  );
}
