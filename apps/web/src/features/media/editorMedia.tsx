import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DesktopWindow } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import type { ModuleCtx, WindowOf } from "../modules/types";
import { UploadTaskQueue, type UploadTask } from "./uploadTasks";
import { enqueueWindowUpload, observeEditorMedia, type WindowUploadOptions } from "./windowMediaSession";
import "./media.css";

const MediaContext = createContext<UploadTaskQueue | null>(null);

/** Mount once for an editor site, so selecting another window never loses its queue. */
export function EditorMediaProvider({ siteId, children }: { siteId: string; children: ReactNode }) {
  const [queue] = useState(() => new UploadTaskQueue());
  useEffect(() => {
    const unsubscribe = observeEditorMedia(queue, useEditorStore, siteId);
    return () => {
      unsubscribe();
      queue.invalidate("已離開編輯器，未套用尚未完成的上傳。");
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
    retry: (id: string) => queue?.retry(id),
    dismiss: (id: string) => queue?.dismiss(id)
  };
}

const STATUS = { queued: "排隊中", uploading: "上傳中", completed: "完成", failed: "失敗" } as const;

export function UploadTaskList({ tasks, onRetry, onDismiss }: { tasks: readonly UploadTask[]; onRetry: (id: string) => void; onDismiss: (id: string) => void }) {
  if (!tasks.length) return null;
  const count = (status: UploadTask["status"]) => tasks.filter((task) => task.status === status).length;
  return (
    <section className="media-upload-tasks" aria-label="上傳任務">
      <p className="media-upload-summary" role="status" aria-live="polite" aria-atomic="true">
        完成 {count("completed")} 件 · 失敗 {count("failed")} 件 · 上傳中 {count("uploading")} 件 · 排隊 {count("queued")} 件
      </p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} data-upload-state={task.status}>
            <div className="media-upload-item">
              <span className="media-upload-name">{task.name}</span>
              <strong>{STATUS[task.status]}</strong>
              {task.status === "failed" && task.retryable ? <button type="button" className="mini-btn wide" aria-label={`重試 ${task.name}`} onClick={() => onRetry(task.id)}>重試</button> : null}
              {task.status === "completed" || task.status === "failed" ? <button type="button" className="mini-btn" aria-label={`清除 ${task.name} 的紀錄`} title="清除紀錄，不會刪除已上傳的檔案" onClick={() => onDismiss(task.id)}>×</button> : null}
            </div>
            {task.error ? <p className="media-upload-error">{task.error}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
