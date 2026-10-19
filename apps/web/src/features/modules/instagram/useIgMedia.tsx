import { useTranslation } from "react-i18next";
import { UploadTaskList, useMediaQueue } from "../../media/editorMedia";
import { canonicalMediaScope, enqueueCanonicalMedia, type CanonicalMediaTarget } from "../../media/canonicalMedia";
import type { ModuleProps } from "../types";

export function useIgMedia({ window, ctx }: ModuleProps<"instagram">) {
  const { t } = useTranslation("instagram");
  const { queue, tasks } = useMediaQueue();
  const target = (kind: CanonicalMediaTarget["kind"], entityId: string): CanonicalMediaTarget => ({
    siteId: ctx.siteId ?? "", profileId: ctx.profileId ?? "", windowId: window.id, kind, entityId
  });
  return {
    canUpload: !!(queue && ctx.editing && ctx.upload && ctx.siteId && ctx.profileId),
    upload: (kind: CanonicalMediaTarget["kind"], entityId: string, files: File[]) => {
      if (!queue || !ctx.editing || !ctx.upload) return files.length;
      return enqueueCanonicalMedia(queue, target(kind, entityId), files, (file) => ctx.upload!(file, "image")).omitted;
    },
    isPending: (kind: CanonicalMediaTarget["kind"], entityId: string) => tasks.some((task) => task.scope === canonicalMediaScope(target(kind, entityId)) && (task.status === "queued" || task.status === "uploading")),
    taskList: (kind: CanonicalMediaTarget["kind"], entityId: string) => {
      const scope = canonicalMediaScope(target(kind, entityId));
      return <UploadTaskList tasks={tasks.filter((task) => task.scope === scope)} onRetry={(id) => queue?.retry(id)} onDismiss={(id) => queue?.dismiss(id)}
        onCancel={(id) => queue?.invalidate(t("batchMedia.cancelled"), (entry) => entry.view.id === id && entry.options.scope === scope)} />;
    }
  };
}
