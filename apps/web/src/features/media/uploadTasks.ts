import { i18n } from "../../i18n";
export type UploadKind = "image" | "icon" | "audio";
export type UploadStatus = "queued" | "uploading" | "completed" | "failed";

/** An ephemeral view of a task. File bytes and callbacks never enter a site document. */
export type UploadTask = {
  id: string;
  scope: string;
  name: string;
  status: UploadStatus;
  attempts: number;
  retryable: boolean;
  error: string;
};

export type UploadRequest = {
  file: File;
  scope: string;
  /** A replacement of the same field supersedes its previous unfinished task. */
  slot?: string;
  kind?: UploadKind;
  upload: (file: File, kind: UploadKind) => Promise<string | null>;
  isCurrent: () => boolean;
  /** Commit against the latest target. false means that the target is no longer valid. */
  apply: (stored: string) => boolean;
};

type Entry = {
  view: UploadTask;
  file?: File;
  options: Omit<UploadRequest, "file">;
  applying: boolean;
  cancelAttempt?: () => void;
};

const targetChanged = () => i18n.t("editor:uploadTasks.theTargetChangedOrWas");
const uploadTimeout = () => i18n.t("editor:uploadTasks.theUploadResponseTimedOut");
type UploadOutcome =
  | { kind: "stored"; stored: string | null }
  | { kind: "invalidated" }
  | { kind: "timeout" };

/**
 * One bounded, sequential worker per editor session. A failed item does not stop
 * its siblings. Retrying never resubmits successful files or replays their edits.
 * The transport exposes no byte progress, so neither does this contract.
 */
export class UploadTaskQueue {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: readonly UploadTask[] = [];
  private running: Promise<void> | null = null;
  private timeoutMs: number;

  constructor({ timeoutMs = 120_000 }: { timeoutMs?: number } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error("Upload timeout must be a finite positive timer duration.");
    this.timeoutMs = timeoutMs;
  }

  getSnapshot = (): readonly UploadTask[] => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  enqueue(request: UploadRequest): string {
    const { file, ...options } = request;
    if (options.slot) {
      this.invalidate(i18n.t("editor:uploadTasks.anotherFileChosen"), (entry) =>
        entry.options.scope === options.scope && entry.options.slot === options.slot);
    }
    const id = crypto.randomUUID();
    this.entries.set(id, {
      view: { id, scope: options.scope, name: file.name, status: "queued", attempts: 0, retryable: false, error: "" },
      file, options, applying: false
    });
    this.emit();
    this.schedule();
    return id;
  }

  retry = (id: string) => {
    const entry = this.entries.get(id);
    if (!entry || entry.view.status !== "failed" || !entry.view.retryable || !entry.file) return;
    if (!this.current(entry)) { this.fail(entry, targetChanged(), false); return; }
    entry.view = { ...entry.view, status: "queued", retryable: false, error: "" };
    this.emit();
    this.schedule();
  };

  dismiss = (id: string) => {
    const entry = this.entries.get(id);
    if (!entry || entry.view.status === "queued" || entry.view.status === "uploading") return;
    this.entries.delete(id);
    this.emit();
  };

  invalidate(reason: string, matches: (entry: Entry) => boolean = () => true) {
    let changed = false;
    for (const entry of this.entries.values()) {
      if (entry.applying || !matches(entry) || entry.view.status === "completed" || (entry.view.status === "failed" && !entry.view.retryable)) continue;
      entry.view = { ...entry.view, status: "failed", retryable: false, error: reason };
      entry.file = undefined;
      entry.cancelAttempt?.();
      changed = true;
    }
    if (changed) this.emit();
  }

  /** Observe deletion/source edits immediately, even if an undo later restores the same id. */
  invalidateStale() {
    this.invalidate(targetChanged(), (entry) => !this.current(entry));
  }

  /** Wait for logical tasks; abandoned HTTP requests may still finish remotely. */
  async whenIdle(): Promise<void> {
    for (;;) {
      this.schedule();
      const running = this.running;
      if (!running) return;
      await running;
    }
  }

  private current(entry: Entry) {
    try { return entry.options.isCurrent(); } catch { return false; }
  }

  private emit() {
    this.snapshot = [...this.entries.values()].map((entry) => entry.view);
    this.listeners.forEach((listener) => listener());
  }

  private fail(entry: Entry, error: string, retryable: boolean) {
    entry.view = { ...entry.view, status: "failed", error, retryable };
    if (!retryable) entry.file = undefined;
    this.emit();
  }

  private schedule() {
    if (this.running || !this.hasQueued()) return;
    this.running = Promise.resolve().then(() => this.run()).finally(() => {
      this.running = null;
      // A completion observer can enqueue between run() returning and this
      // cleanup. Do not leave that item waiting for an unrelated future upload.
      this.schedule();
    });
  }

  private hasQueued() {
    return [...this.entries.values()].some((entry) => entry.view.status === "queued");
  }

  private attempt(entry: Entry, file: File): Promise<UploadOutcome> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (outcome: UploadOutcome) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        if (entry.cancelAttempt === cancel) entry.cancelAttempt = undefined;
        resolve(outcome);
      };
      const cancel = () => finish({ kind: "invalidated" });
      entry.cancelAttempt = cancel;
      timer = setTimeout(() => finish({ kind: "timeout" }), this.timeoutMs);
      // The existing transport has no abort API. Stop waiting on invalidation
      // or timeout, but always observe its eventual rejection. A late success
      // may create an unused server asset; it cannot settle a newer attempt.
      try {
        Promise.resolve(entry.options.upload(file, entry.options.kind ?? "image")).then(
          (stored) => finish({ kind: "stored", stored }),
          () => finish({ kind: "stored", stored: null })
        );
      } catch {
        finish({ kind: "stored", stored: null });
      }
    });
  }

  private async run() {
    for (;;) {
      const entry = [...this.entries.values()].find((candidate) => candidate.view.status === "queued");
      if (!entry) return;
      if (!entry.file || !this.current(entry)) { this.fail(entry, targetChanged(), false); continue; }
      entry.view = { ...entry.view, status: "uploading", attempts: entry.view.attempts + 1 };
      this.emit();
      if (entry.view.status !== "uploading" || !entry.file) continue;
      const outcome = await this.attempt(entry, entry.file);
      // An in-flight HTTP request may finish after undo/unmount/replacement. Its
      // asset remains in the owner's library, but its stale write is discarded.
      if (entry.view.status !== "uploading" || outcome.kind === "invalidated") continue;
      if (!this.current(entry)) { this.fail(entry, targetChanged(), false); continue; }
      if (outcome.kind === "timeout") { this.fail(entry, uploadTimeout(), true); continue; }
      const { stored } = outcome;
      if (!stored) { this.fail(entry, i18n.t("editor:uploadTasks.uploadFailedKept"), true); continue; }
      let applied = false;
      entry.applying = true;
      try { applied = entry.options.apply(stored); } catch { /* report a failed application below */ }
      finally { entry.applying = false; }
      if (!applied) { this.fail(entry, targetChanged(), false); continue; }
      entry.view = { ...entry.view, status: "completed", error: "", retryable: false };
      entry.file = undefined;
      this.emit();
    }
  }
}

/** Insert a retried item beside its surviving batch siblings without replacing
 * their current data, rearranging them, or resurrecting removed successes. */
export function insertInSelectionOrder<T extends { id: string }>(list: T[], item: T, selectionIds: readonly string[]): T[] {
  if (list.some((entry) => entry.id === item.id)) return list;
  const order = selectionIds.indexOf(item.id);
  const following = selectionIds.slice(order + 1).map((id) => list.findIndex((entry) => entry.id === id)).find((index) => index >= 0);
  if (following !== undefined) return [...list.slice(0, following), item, ...list.slice(following)];
  const preceding = selectionIds.slice(0, Math.max(0, order)).reverse().map((id) => list.findIndex((entry) => entry.id === id)).find((index) => index >= 0);
  if (preceding !== undefined) return [...list.slice(0, preceding + 1), item, ...list.slice(preceding + 1)];
  return [...list, item];
}
