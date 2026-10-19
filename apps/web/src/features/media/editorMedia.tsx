import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { i18n } from "../../i18n";
import { useTranslation } from "react-i18next";
import type { DesktopWindow } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import type { ModuleCtx, WindowOf } from "../modules/types";
import { UploadTaskQueue, type UploadTask } from "./uploadTasks";
import { enqueueWindowUpload, observeEditorMedia, type WindowUploadOptions } from "./windowMediaSession";
import "./media.css";

const MediaContext = createContext<UploadTaskQueue | null>(null);

/** Mount once for an editor site, so selecting another window never loses its queue. */
export function EditorMediaProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const { t: tr } = useTranslation("editor");
  const [queue] = useState(() => new UploadTaskQueue());
  useEffect(() => {
    const unsubscribe = observeEditorMedia(queue, useEditorStore, siteId);
    return () => {
      unsubscribe();
      queue.invalidate(tr("editorMedia.youLeftTheEditorThe"));
    };
  }, [queue, siteId]);
  return <MediaContext.Provider value={queue}>{children}</MediaContext.Provider>;
}

export function useMediaQueue() {
  const queue = useContext(MediaContext);
  const empty = useMemo<readonly UploadTask[]>(() => [], []);
  const tasks = useSyncExternalStore(queue?.subscribe ?? (() => () => {}), queue?.getSnapshot ?? (() => empty));
  return { queue, tasks };
}

export function useWindowMedia<T extends DesktopWindow["type"]>(window: WindowOf<T>, ctx: ModuleCtx) {
  const { queue, tasks } = useMediaQueue();
  const scope = `window:${window.id}:content`;
  return {
    tasks: tasks.filter((task) => task.scope === scope),
    upload: (file: File, options: WindowUploadOptions<T>) => {
      if (!queue || !ctx.siteId || !ctx.upload || !ctx.editing) return;
      enqueueWindowUpload(queue, useEditorStore, { siteId: ctx.siteId, windowId: window.id, windowType: window.type, scope }, file, ctx.upload, options);
    },
    cancel: (slot: string) => queue?.invalidate(i18n.t("modules:image.sourceChanged"), (entry) => entry.options.scope === scope && entry.options.slot === slot),
    retry: (id: string) => queue?.retry(id),
    dismiss: (id: string) => queue?.dismiss(id)
  };
}

const statusLabels = () => ({ queued: i18n.t("editor:editorMedia.queued"), uploading: i18n.t("editor:editorMedia.uploading"), completed: i18n.t("editor:editor.done"), failed: i18n.t("editor:editorMedia.failed") } as const);

export function UploadTaskList({ tasks, onRetry, onDismiss }: { tasks: readonly UploadTask[]; onRetry: (id: string) => void; onDismiss: (id: string) => void }) {
  const { t: tr } = useTranslation("editor");
  if (!tasks.length) return null;
  const count = (status: UploadTask["status"]) => tasks.filter((task) => task.status === status).length;
  return (
    <section className="media-upload-tasks" aria-label={tr("editorMedia.uploadTasks")}>
      <p className="media-upload-summary" role="status" aria-live="polite" aria-atomic="true">
        {tr("media.summary", { completed: count("completed"), failed: count("failed"), uploading: count("uploading"), queued: count("queued") })}
      </p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} data-upload-state={task.status}>
            <div className="media-upload-item">
              <span className="media-upload-name">{task.name}</span>
              <strong>{statusLabels()[task.status]}</strong>
              {task.status === "failed" && task.retryable ? <button type="button" className="mini-btn wide" aria-label={tr("editorMedia.retry", { name: task.name })} onClick={() => onRetry(task.id)}>{tr("editorMedia.retry2")}</button> : null}
              {task.status === "completed" || task.status === "failed" ? <button type="button" className="mini-btn" aria-label={tr("editorMedia.clearTheRecordFor", { name: task.name })} title={tr("editorMedia.clearTheRecordUploadedFiles")} onClick={() => onDismiss(task.id)}>×</button> : null}
            </div>
            {task.error ? <p className="media-upload-error">{task.error}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
