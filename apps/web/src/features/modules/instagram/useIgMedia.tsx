import { patchPostMedia, projectV2ToLegacyDocument } from "@retrodesk/shared";
import { useEditorStore } from "../../editor/store";
import type { UploadTaskQueue } from "../../media/uploadTasks";
import { useTranslation } from "react-i18next";
import { UploadProgressList, useMediaQueue } from "../../media/editorMedia";
import { canonicalMediaScope, enqueueCanonicalMedia, type CanonicalMediaTarget } from "../../media/canonicalMedia";
import type { ModuleProps } from "../types";

const replacementScope = (target: CanonicalMediaTarget) => `${canonicalMediaScope(target)}:replace`;

/** Replace one canonical image only after storage succeeds, against the latest document. */
export function enqueueIgPostReplacement(queue: UploadTaskQueue, target: CanonicalMediaTarget, mediaId: string, file: File, upload: (file: File) => Promise<string | null>) {
  const read = () => {
    const state = useEditorStore.getState();
    const document = state.versionedDocument;
    if (state.siteId !== target.siteId || state.accessRole === "viewer" || !document) return null;
    if (!document.windows.some(window => window.id === target.windowId && window.type === "instagram") ||
        !document.entities.profiles.some(profile => profile.id === target.profileId && profile.siteId === target.siteId)) return null;
    const post = document.entities.posts.find(post => post.id === target.entityId && post.siteId === target.siteId && post.authorProfileId === target.profileId);
    const item = post?.media?.find(item => item.id === mediaId);
    return item ? { document, item } : null;
  };
  const original = read();
  if (!original) return;
  const source = (item: typeof original.item) => JSON.stringify([item.src, item.srcUrl, item.crop]);
  const fingerprint = source(original.item);
  const isCurrent = () => { const found = read(); return !!found && source(found.item) === fingerprint; };
  return queue.enqueue({
    file, scope: replacementScope(target), slot: mediaId, upload, isCurrent,
    apply: (stored) => {
      const found = read();
      if (!found || !isCurrent()) return false;
      const result = patchPostMedia(found.document, target.entityId, mediaId, { src: stored, srcUrl: "", crop: undefined }, { siteId: target.siteId });
      if (!result.ok) return false;
      const projected = projectV2ToLegacyDocument(result.document);
      if (!projected.ok) return false;
      useEditorStore.getState().replaceDocument(projected.document, undefined, result.document);
      return read()?.item.src === stored;
    }
  });
}

export function useIgMedia({ window, ctx }: ModuleProps<"instagram">) {
  const { t } = useTranslation("instagram");
  const { queue, tasks } = useMediaQueue();
  const target = (kind: CanonicalMediaTarget["kind"], entityId: string): CanonicalMediaTarget => ({
    siteId: ctx.siteId ?? "", profileId: ctx.profileId ?? "", windowId: window.id, kind, entityId
  });
  const scopes = (kind: CanonicalMediaTarget["kind"], entityId: string) => {
    const value = target(kind, entityId);
    return [canonicalMediaScope(value), replacementScope(value)];
  };
  return {
    replacePostImage: (entityId: string, mediaId: string, file: File) => {
      if (!queue || !ctx.editing || !ctx.upload) return;
      enqueueIgPostReplacement(queue, target("post", entityId), mediaId, file, file => ctx.upload!(file, "image"));
    },
    cancelPostReplacement: (entityId: string, mediaId: string) => queue?.invalidate(t("batchMedia.cancelled"), entry =>
      entry.options.scope === replacementScope(target("post", entityId)) && entry.options.slot === mediaId),
    canUpload: !!(queue && ctx.editing && ctx.upload && ctx.siteId && ctx.profileId),
    upload: (kind: CanonicalMediaTarget["kind"], entityId: string, files: File[]) => {
      if (!queue || !ctx.editing || !ctx.upload) return files.length;
      return enqueueCanonicalMedia(queue, target(kind, entityId), files, (file) => ctx.upload!(file, "image")).omitted;
    },
    isPending: (kind: CanonicalMediaTarget["kind"], entityId: string) => tasks.some((task) => scopes(kind, entityId).includes(task.scope) && (task.status === "queued" || task.status === "uploading")),
    taskList: (kind: CanonicalMediaTarget["kind"], entityId: string) => {
      const entityScopes = scopes(kind, entityId);
      return <UploadProgressList tasks={tasks.filter((task) => entityScopes.includes(task.scope))} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)}
        onCancel={(id) => queue?.invalidate(t("batchMedia.cancelled"), (entry) => entry.view.id === id && entityScopes.includes(entry.options.scope))} />;
    }
  };
}
