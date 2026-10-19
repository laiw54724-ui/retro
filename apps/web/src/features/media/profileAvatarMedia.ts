import { projectV2ToLegacyDocument, updateProfile } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import type { UploadTaskQueue } from "./uploadTasks";

export const profileAvatarScope = (siteId: string, profileId: string) => JSON.stringify(["profile-avatar", siteId, profileId]);

/** One source slot per canonical profile, shared by every window displaying it. */
export function enqueueProfileAvatar(queue: UploadTaskQueue, target: { siteId: string; windowId: string; profileId: string }, file: File, upload: (file: File) => Promise<string | null>) {
  const findTarget = () => {
    const state = useEditorStore.getState();
    if (state.siteId !== target.siteId || state.accessRole === "viewer") return null;
    const document = state.versionedDocument;
    if (!document?.windows.some((window) => window.id === target.windowId && window.type === "instagram")) return null;
    return document.entities.profiles.find((profile) => profile.id === target.profileId && profile.siteId === target.siteId) ?? null;
  };
  const original = findTarget();
  if (!original) return;
  const source = JSON.stringify([original.avatar, original.avatarUrl, original.avatarCrop]);
  const current = () => {
    const profile = findTarget();
    return !!profile && JSON.stringify([profile.avatar, profile.avatarUrl, profile.avatarCrop]) === source;
  };
  return queue.enqueue({
    file, scope: profileAvatarScope(target.siteId, target.profileId), slot: "avatar", upload,
    isCurrent: current,
    apply: (stored) => {
      if (!current()) return false;
      const state = useEditorStore.getState();
      if (!state.versionedDocument) return false;
      const result = updateProfile(state.versionedDocument, target.profileId, { avatar: stored, avatarUrl: "", avatarCrop: undefined }, { siteId: target.siteId });
      if (!result.ok) return false;
      const projected = projectV2ToLegacyDocument(result.document);
      if (!projected.ok) return false;
      state.replaceDocument(projected.document, undefined, result.document);
      return useEditorStore.getState().versionedDocument?.entities.profiles.find((profile) => profile.id === target.profileId)?.avatar === stored;
    }
  });
}
