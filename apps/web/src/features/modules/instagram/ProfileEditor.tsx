import { useState } from "react";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import { FilePick, ImageUrlField, SafeImg } from "../ui";

type Props = {
  profile: ProfileEntityV2;
  onChange: (patch: Record<string, unknown>, historyKey?: string) => void;
  upload?: (file: File) => Promise<string | null>;
  showAppearance?: boolean;
};

/** Compact-by-default OC authoring form. Advanced legacy presentation fields stay collapsed. */
export function ProfileEditor({ profile, onChange, upload, showAppearance = true }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const set = (key: string, value: unknown, historyKey?: string) => onChange({ [key]: value }, historyKey);
  return (
    <div className="ig-profile-editor">
      <fieldset className="w98-fieldset"><legend>角色資料</legend>
        <div className="ig-edit-avatar">
          <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <FilePick onFiles={async (files) => { const url = await upload?.(files[0]); if (url) onChange({ avatar: url, avatarUrl: "", avatarCrop: undefined }); }}>上傳頭像…</FilePick>
        </div>
        <label className="w98-field"><span className="w98-hint">Handle</span><input className="w98-input compact" value={profile.handle ?? ""} onChange={(event) => set("handle", event.target.value, "profile-handle")} /></label>
        <label className="w98-field"><span className="w98-hint">顯示名稱</span><input className="w98-input compact" value={profile.displayName ?? profile.name} onChange={(event) => set("displayName", event.target.value, "profile-name")} /></label>
        <label className="w98-field"><span className="w98-hint">Pronouns</span><input className="w98-input compact" value={profile.pronouns ?? ""} onChange={(event) => set("pronouns", event.target.value)} /></label>
        <label className="w98-field"><span className="w98-hint">簡介</span><textarea className="w98-textarea" rows={3} value={profile.bio} onChange={(event) => set("bio", event.target.value, "profile-bio")} /></label>
        <ImageUrlField key={profile.id} raw={profile.avatarUrl} label="頭像網址" placeholder="或貼上圖片網址" className="w98-input compact" onCommit={(raw, src) => onChange({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
      </fieldset>
      <button type="button" className="w98-btn block" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "收合角色設定" : "展開角色設定"}</button>
      {advanced ? <fieldset className="w98-fieldset"><legend>角色設定</legend>
        <label className="w98-field"><span className="w98-hint">世界標籤（以逗號分隔）</span><input className="w98-input compact" value={profile.worldTags.join(", ")} onChange={(event) => set("worldTags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
        <div className="w98-field"><span className="w98-hint">自訂欄位</span>
          {profile.customFields.map((field, index) => <div className="ie-row" key={`${field.key}-${index}`}>
            <input className="w98-input compact" placeholder="欄位名稱" value={field.key} onChange={(event) => set("customFields", profile.customFields.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} />
            <input className="w98-input compact grow" placeholder="內容" value={field.value} onChange={(event) => set("customFields", profile.customFields.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
            <button type="button" className="w98-btn small" aria-label={`刪除自訂欄位 ${field.key}`} onClick={() => set("customFields", profile.customFields.filter((_, i) => i !== index))}>×</button>
          </div>)}
          <button type="button" className="w98-btn small" onClick={() => set("customFields", [...profile.customFields, { key: "新欄位", value: "" }])}>＋ 新增欄位</button>
        </div>
        <label className="w98-field"><span className="w98-hint">狀態</span><select className="w98-input compact" value={profile.visibility} onChange={(event) => set("visibility", event.target.value)}><option value="draft">草稿</option><option value="published">可發布</option></select></label>
        {showAppearance ? <ProfileAppearanceEditor profile={profile} onChange={onChange} /> : null}
      </fieldset> : null}
    </div>
  );
}

/** Reuses the existing profile theme fields in the grouped editor's appearance panel. */
export function ProfileAppearanceEditor({ profile, onChange }: Pick<Props, "profile" | "onChange">) {
  const set = (key: string, value: unknown) => onChange({ [key]: value });
  return <>
        <label className="check-row"><input type="checkbox" checked={!!profile.themeOverride} onChange={(event) => set("themeOverride", event.target.checked ? { accent: "#000080", background: "#ffffff" } : undefined)} />自訂內容主題（只影響 IG 內容）</label>
        {profile.themeOverride ? <div className="color-fields">
          <label className="w98-field"><span>內容強調色</span><input aria-label="IG 內容強調色" type="color" value={profile.themeOverride.accent} onChange={(event) => set("themeOverride", { ...profile.themeOverride, accent: event.target.value })} /></label>
          <label className="w98-field"><span>IG 內容背景</span><input aria-label="IG 內容背景色" type="color" value={profile.themeOverride.background} onChange={(event) => set("themeOverride", { ...profile.themeOverride, background: event.target.value })} /></label>
        </div> : null}
  </>;
}
