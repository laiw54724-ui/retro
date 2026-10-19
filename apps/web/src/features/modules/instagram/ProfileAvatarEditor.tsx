import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileEntityV2 } from "@retrodesk/shared";
import { UploadTaskList, useMediaQueue } from "../../media/editorMedia";
import { enqueueProfileAvatar, profileAvatarScope } from "../../media/profileAvatarMedia";
import { FilePick, ImageUrlField, SafeImg } from "../ui";
import styles from "./ProfileAvatarEditor.module.css";

export function ProfileAvatarEditor({ profile, siteId, windowId, upload, onChange }: {
  profile: ProfileEntityV2;
  siteId: string;
  windowId: string;
  upload?: (file: File) => Promise<string | null>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation("instagram");
  const { queue, tasks } = useMediaQueue();
  const [sourceReset, setSourceReset] = useState(0);
  const scope = profileAvatarScope(siteId, profile.id);
  const ownTasks = tasks.filter((task) => task.scope === scope);
  const pending = ownTasks.some((task) => task.status === "queued" || task.status === "uploading");
  const cancel = () => queue?.invalidate(t("imageControls.sourceChanged"), (entry) => entry.options.scope === scope);
  return <div className="ig-col">
    <div className={styles.controls}>
      <span className="ig-thumb round ph">{profile.avatar ? <SafeImg src={profile.avatar} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
      <FilePick disabled={!queue || !upload} onFiles={(files) => {
        if (queue && upload && files[0]) {
          setSourceReset((value) => value + 1);
          enqueueProfileAvatar(queue, { siteId, windowId, profileId: profile.id }, files[0], upload);
        }
      }}>{t("igEditForm.uploadAvatar")}</FilePick>
      {pending ? <button type="button" className="w98-btn small" onClick={cancel}>{t("imageControls.cancelUpload")}</button> : null}
      {profile.avatar || profile.avatarUrl ? <button type="button" className="w98-btn small" onClick={() => {
        cancel(); setSourceReset((value) => value + 1); onChange({ avatar: null, avatarUrl: "", avatarCrop: undefined });
      }}>{t("imageControls.removeAvatar")}</button> : null}
    </div>
    <ImageUrlField key={`${profile.id}:${sourceReset}`} visibleLabel raw={profile.avatarUrl} label={t("igEditForm.avatarUrl")} placeholder={t("canonicalHighlightEditor.orPasteAnImageUrl")} className="w98-input compact" onEdit={cancel} onCommit={(raw, src) => onChange({ avatarUrl: raw, avatar: src, avatarCrop: undefined })} />
    <UploadTaskList tasks={ownTasks} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)} />
  </div>;
}
