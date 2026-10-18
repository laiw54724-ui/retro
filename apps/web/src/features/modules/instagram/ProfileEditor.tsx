import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t: tr } = useTranslation("instagram");
  const [advanced, setAdvanced] = useState(false);
  // Custom fields have no persisted ID. Keep row identity local to this editor
  // so changing a field name does not remount its input during typing/IME.
  const fieldRows = useRef<{ profileId: string; ids: string[] }>({ profileId: profile.id, ids: [] });
  if (fieldRows.current.profileId !== profile.id) fieldRows.current = { profileId: profile.id, ids: [] };
  while (fieldRows.current.ids.length < profile.customFields.length) fieldRows.current.ids.push(crypto.randomUUID());
  fieldRows.current.ids.length = profile.customFields.length;
  const set = (key: string, value: unknown, historyKey?: string) => onChange({ [key]: value }, historyKey);
  return (
    <div className="ig-profile-editor">
      <fieldset className="w98-fieldset"><legend>{tr("profileDetails.characterInfo")}</legend>
        <div className="ig-edit-avatar">
          <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <FilePick onFiles={async (files) => { const url = await upload?.(files[0]); if (url) onChange({ avatar: url, avatarUrl: "", avatarCrop: undefined }); }}>{tr("igEditForm.uploadAvatar")}</FilePick>
        </div>
        <label className="w98-field"><span className="w98-hint">Handle</span><input className="w98-input compact" value={profile.handle ?? ""} onChange={(event) => set("handle", event.target.value, "profile-handle")} /></label>
        <label className="w98-field"><span className="w98-hint">{tr("profileEditor.displayName")}</span><input className="w98-input compact" value={profile.displayName ?? profile.name} onChange={(event) => set("displayName", event.target.value, "profile-name")} /></label>
        <label className="w98-field"><span className="w98-hint">Pronouns</span><input className="w98-input compact" value={profile.pronouns ?? ""} onChange={(event) => set("pronouns", event.target.value)} /></label>
        <label className="w98-field"><span className="w98-hint">{tr("igEditForm.bio")}</span><textarea className="w98-textarea" rows={3} value={profile.bio} onChange={(event) => set("bio", event.target.value, "profile-bio")} /></label>
        <ImageUrlField key={profile.id} raw={profile.avatarUrl} label={tr("igEditForm.avatarUrl")} placeholder={tr("canonicalHighlightEditor.orPasteAnImageUrl")} className="w98-input compact" onCommit={(raw, src) => onChange({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
      </fieldset>
      <button type="button" className="w98-btn block" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? tr("profileEditor.collapseCharacterSettings") : tr("profileEditor.expandCharacterSettings")}</button>
      {advanced ? <fieldset className="w98-fieldset"><legend>{tr("profileEditor.characterSettings")}</legend>
        <label className="w98-field"><span className="w98-hint">{tr("profileEditor.worldTagsCommaSeparated")}</span><input className="w98-input compact" value={profile.worldTags.join(", ")} onChange={(event) => set("worldTags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
        <div className="w98-field"><span className="w98-hint">{tr("profileEditor.customFields")}</span>
          {profile.customFields.map((field, index) => <div className="ie-row" key={fieldRows.current.ids[index]}>
            <input className="w98-input compact" placeholder={tr("profileEditor.fieldName")} value={field.key} onChange={(event) => set("customFields", profile.customFields.map((item, i) => i === index ? { ...item, key: event.target.value } : item))} />
            <input className="w98-input compact grow" placeholder={tr("profileEditor.content")} value={field.value} onChange={(event) => set("customFields", profile.customFields.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} />
            <button type="button" className="w98-btn small" aria-label={tr("profileEditor.deleteCustomField", { key: field.key })} onClick={() => { fieldRows.current.ids.splice(index, 1); set("customFields", profile.customFields.filter((_, i) => i !== index)); }}>×</button>
          </div>)}
          <button type="button" className="w98-btn small" onClick={() => { fieldRows.current.ids.push(crypto.randomUUID()); set("customFields", [...profile.customFields, { key: tr("profileEditor.newField"), value: "" }]); }}>{tr("profileEditor.addField")}</button>
        </div>
        <label className="w98-field"><span className="w98-hint">{tr("profileEditor.status")}</span><select className="w98-input compact" value={profile.visibility} onChange={(event) => set("visibility", event.target.value)}><option value="draft">{tr("canonicalCollectionEditor.draft")}</option><option value="published">{tr("profileEditor.publishable")}</option></select></label>
        {showAppearance ? <ProfileAppearanceEditor profile={profile} onChange={onChange} /> : null}
      </fieldset> : null}
    </div>
  );
}

/** Reuses the existing profile theme fields in the grouped editor's appearance panel. */
export function ProfileAppearanceEditor({ profile, onChange }: Pick<Props, "profile" | "onChange">) {
  const { t: tr } = useTranslation("instagram");
  const set = (key: string, value: unknown) => onChange({ [key]: value });
  return <>
        <label className="check-row"><input type="checkbox" checked={!!profile.themeOverride} onChange={(event) => set("themeOverride", event.target.checked ? { accent: "#000080", background: "#ffffff" } : undefined)} />{tr("profileEditor.customContentThemeAffectsIg")}</label>
        {profile.themeOverride ? <div className="color-fields">
          <label className="w98-field"><span>{tr("profileEditor.contentAccentColor")}</span><input aria-label={tr("profileEditor.igContentAccentColor")} type="color" value={profile.themeOverride.accent} onChange={(event) => set("themeOverride", { ...profile.themeOverride, accent: event.target.value })} /></label>
          <label className="w98-field"><span>{tr("profileEditor.igContentBackground")}</span><input aria-label={tr("profileEditor.igContentBackgroundColor")} type="color" value={profile.themeOverride.background} onChange={(event) => set("themeOverride", { ...profile.themeOverride, background: event.target.value })} /></label>
        </div> : null}
  </>;
}
