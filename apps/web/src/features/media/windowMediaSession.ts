import type { DesktopWindow, SiteDocument, SiteDocumentV2Input } from "@retrodesk/shared";
import type { WindowOf } from "../modules/types";
import { UploadTaskQueue, type UploadKind } from "./uploadTasks";

export type EditorSnapshot = {
  siteId: string | null;
  accessRole: "owner" | "editor" | "viewer";
  document: SiteDocument | null;
  lastSavedDocument: SiteDocument | null;
  versionedDocument: SiteDocumentV2Input | null;
  past: SiteDocument[];
  future: SiteDocument[];
  versionedFuture: SiteDocumentV2Input[];
  saveStatus: string;
  updateWindow: (id: string, recipe: (window: DesktopWindow) => DesktopWindow, historyKey?: string) => void;
};

export type MediaEditorStore = {
  getState: () => EditorSnapshot;
  subscribe: (listener: (state: EditorSnapshot, previous: EditorSnapshot) => void) => () => void;
};

export type WindowUploadOptions<T extends DesktopWindow["type"]> = {
  kind?: UploadKind;
  slot: string;
  isCurrent?: (current: WindowOf<T>) => boolean;
  apply: (current: WindowOf<T>, stored: string) => WindowOf<T>;
};

export type WindowUploadTarget<T extends DesktopWindow["type"] = DesktopWindow["type"]> = {
  siteId: string;
  windowId: string;
  windowType: T;
  scope: string;
};

/** Uses the existing store API; selection is deliberately never read. */
export function enqueueWindowUpload<T extends DesktopWindow["type"]>(queue: UploadTaskQueue, store: MediaEditorStore, target: WindowUploadTarget<T>, file: File, upload: (file: File, kind: UploadKind) => Promise<string | null>, options: WindowUploadOptions<T>) {
  const getTarget = () => {
    const state = store.getState();
    if (state.siteId !== target.siteId || state.accessRole === "viewer") return null;
    const current = state.document?.windows.find((window) => window.id === target.windowId && window.type === target.windowType) as WindowOf<T> | undefined;
    return current && (!options.isCurrent || options.isCurrent(current)) ? current : null;
  };
  return queue.enqueue({
    file, scope: target.scope, slot: options.slot, kind: options.kind, upload,
    isCurrent: () => !!getTarget(),
    apply: (stored) => {
      if (!getTarget()) return false;
      let applied = false;
      store.getState().updateWindow(target.windowId, (current) => {
        if (current.type !== target.windowType || current.id !== target.windowId) return current;
        const typed = current as WindowOf<T>;
        if (options.isCurrent && !options.isCurrent(typed)) return current;
        applied = true;
        return options.apply(typed, stored);
      });
      return applied;
    }
  });
}

/** History travel and reload end a media-editing epoch, even if values happen to match. */
export function didMediaHistoryChange(state: EditorSnapshot, previous: EditorSnapshot): boolean {
  const undo = state.past.length < previous.past.length;
  const redo = state.future.length < previous.future.length && previous.future.length > 0 &&
    (state.document === previous.future[0] || (!!state.versionedDocument && state.versionedDocument === previous.versionedFuture[0]));
  const reload = state.document === state.lastSavedDocument && state.versionedDocument === null &&
    state.saveStatus === "saved" && state.past.length === 0 && state.past !== previous.past;
  return undo || redo || reload;
}

/** Invalidate pending work on history travel/reload, without changing history or
 * storing queue metadata. Ordinary typing, focus changes and autosaves continue. */
export function observeEditorMedia(queue: UploadTaskQueue, store: MediaEditorStore, siteId: string) {
  return store.subscribe((state, previous) => {
    if (state.siteId !== siteId || state.accessRole === "viewer") {
      queue.invalidate("已離開原網站或失去編輯權限，未套用這次上傳。");
      return;
    }
    if (didMediaHistoryChange(state, previous)) {
      queue.invalidate("已復原、重做或重新載入內容，未套用尚未完成的上傳。請重新選擇檔案。");
    } else {
      queue.invalidateStale();
    }
  });
}
