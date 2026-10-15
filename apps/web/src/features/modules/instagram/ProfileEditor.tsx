import { useState } from "react";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import { FilePick, ImageUrlField, SafeImg } from "../ui";

type Props = {
  profile: ProfileEntityV2;
  onChange: (patch: Record<string, unknown>, historyKey?: string) => void;
  upload?: (file: File) => Promise<string | null>;
};

/** Compact-by-default OC authoring form. Advanced legacy presentation fields stay collapsed. */
export function ProfileEditor({ profile, onChange, upload }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const set = (key: string, value: unknown, historyKey?: string) => onChange({ [key]: value }, historyKey);
  return (
    <div className="ig-profile-editor">
      <fieldset className="w98-fieldset"><legend>角色資料</legend>
        <div className="ig-edit-avatar">
          <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <FilePick onFiles={async (files) => { const url = await upload?.(files[0]); if (url) set("avatar", url); }}>上傳頭像…</FilePick>
        </div>
        <label className="w98-field"><span className="w98-hint">Handle</span><input className="w98-input compact" value={profile.handle ?? ""} onChange={(event) => set("handle", event.target.value, "profile-handle")} /></label>
        <label className="w98-field"><span className="w98-hint">顯示名稱</span><input className="w98-input compact" value={profile.displayName ?? profile.name} onChange={(event) => set("displayName", event.target.value, "profile-name")} /></label>
        <label className="w98-field"><span className="w98-hint">Pronouns</span><input className="w98-input compact" value={profile.pronouns ?? ""} onChange={(event) => set("pronouns", event.target.value)} /></label>
        <label className="w98-field"><span className="w98-hint">簡介</span><textarea className="w98-textarea" rows={3} value={profile.bio} onChange={(event) => set("bio", event.target.value, "profile-bio")} /></label>
        <ImageUrlField raw={profile.avatarUrl} label="頭像網址" placeholder="或貼上圖片網址" className="w98-input compact" onCommit={(raw, src) => onChange({ avatarUrl: raw, avatar: src })} />
      </fieldset>
      <button type="button" className="w98-btn block" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? "收合角色設定" : "展開角色設定"}</button>
      {advanced ? <fieldset className="w98-fieldset"><legend>角色設定</legend>
        <label className="w98-field"><span className="w98-hint">世界標籤（以逗號分隔）</span><input className="w98-input compact" value={profile.worldTags.join(", ")} onChange={(event) => set("worldTags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
        <label className="w98-field"><span className="w98-hint">狀態</span><select className="w98-input compact" value={profile.visibility} onChange={(event) => set("visibility", event.target.value)}><option value="draft">草稿</option><option value="published">可發布</option></select></label>
        <label className="check-row"><input type="checkbox" checked={!!profile.themeOverride} onChange={(event) => set("themeOverride", event.target.checked ? { accent: "#000080", background: "#ffffff" } : undefined)} />自訂內容主題（只影響 IG 內容）</label>
      </fieldset> : null}
    </div>
  );
}
