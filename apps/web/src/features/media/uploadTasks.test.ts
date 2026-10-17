import { describe, expect, it, vi } from "vitest";
import { insertInSelectionOrder, UploadTaskQueue, type UploadRequest } from "./uploadTasks";

const file = (name: string) => new File(["image"], name, { type: "image/png" });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const request = (name: string, override: Partial<UploadRequest> = {}): UploadRequest => ({
  file: file(name), scope: "gallery-a", upload: async () => `asset:${name}`, isCurrent: () => true, apply: () => true, ...override
});

describe("shared upload tasks", () => {
  it("shows real queued/uploading/failed/completed states, retains four successes and retries just one of five files", async () => {
    const queue = new UploadTaskQueue();
    const first = deferred<string>();
    const calls: string[] = [];
    const names = ["1.png", "2.png", "3.png", "4.png", "5.png"];
    let images: { id: string; src: string; caption: string }[] = [];
    const taskIds = names.map((name) => queue.enqueue(request(name, {
      upload: async (selected) => {
        calls.push(selected.name);
        if (selected.name === "1.png") return first.promise;
        if (selected.name === "2.png" && calls.filter((call) => call === "2.png").length === 1) return null;
        return `asset:${selected.name}`;
      },
      apply: (src) => { images = insertInSelectionOrder(images, { id: name, src, caption: "" }, names); return true; }
    })));
    expect(queue.getSnapshot().map((task) => task.status)).toEqual(Array(5).fill("queued"));
    await Promise.resolve();
    expect(queue.getSnapshot().map((task) => task.status)).toEqual(["uploading", "queued", "queued", "queued", "queued"]);
    first.resolve("asset:1.png");
    await queue.whenIdle();
    expect(images.map((image) => image.id)).toEqual(["1.png", "3.png", "4.png", "5.png"]);
    expect(queue.getSnapshot().map((task) => task.status)).toEqual(["completed", "failed", "completed", "completed", "completed"]);
    images[1] = { ...images[1], caption: "Edited while retry was pending" };
    const successes = [...images];
    queue.retry(taskIds[1]);
    queue.retry(taskIds[1]); // A double click must not duplicate the request.
    queue.retry(taskIds[0]); // A completed item is never uploaded again.
    await queue.whenIdle();
    expect(calls).toEqual([...names, "2.png"]);
    expect(images.map((image) => image.id)).toEqual(names);
    expect(images.filter((image) => image.id !== "2.png")).toEqual(successes);
    expect(queue.getSnapshot().every((task) => task.status === "completed")).toBe(true);
    expect(queue.getSnapshot()[1].attempts).toBe(2);
    expect(queue.getSnapshot().some((task) => "progress" in task || "file" in task)).toBe(false);
  });

  it("continues after a rejected request, with stable task order across overlapping batches", async () => {
    const queue = new UploadTaskQueue();
    const gate = deferred<string>();
    const calls: string[] = [];
    queue.enqueue(request("a", { upload: async () => { calls.push("a"); return gate.promise; } }));
    queue.enqueue(request("b", { upload: async () => { calls.push("b"); throw new Error("offline"); } }));
    await Promise.resolve();
    queue.enqueue(request("c", { upload: async () => { calls.push("c"); return "c"; } }));
    gate.resolve("a");
    await queue.whenIdle();
    expect(calls).toEqual(["a", "b", "c"]);
    expect(queue.getSnapshot().map((task) => [task.name, task.status])).toEqual([["a", "completed"], ["b", "failed"], ["c", "completed"]]);
  });

  it("runs work queued in a completion microtask before reporting idle", async () => {
    const queue = new UploadTaskQueue();
    const applied: string[] = [];
    let appended = false;
    queue.subscribe(() => {
      if (!appended && queue.getSnapshot().some((task) => task.status === "completed")) {
        appended = true;
        queueMicrotask(() => queue.enqueue(request("second", { apply: (value) => { applied.push(value); return true; } })));
      }
    });
    queue.enqueue(request("first", { apply: (value) => { applied.push(value); return true; } }));
    await queue.whenIdle();
    expect(applied).toEqual(["asset:first", "asset:second"]);
    expect(queue.getSnapshot().map((task) => [task.name, task.status])).toEqual([["first", "completed"], ["second", "completed"]]);
  });

  it.each(["invalidated", "superseded"] as const)("releases a %s upload's worker before its HTTP request settles", async (action) => {
    const queue = new UploadTaskQueue();
    const gate = deferred<string>();
    const upload = vi.fn(() => gate.promise);
    const obsoleteApply = vi.fn(() => true);
    const nextApply = vi.fn(() => true);
    const old = queue.enqueue(request("stalled", { slot: "avatar", upload, apply: obsoleteApply }));
    await Promise.resolve();
    expect(upload).toHaveBeenCalledTimes(1);
    if (action === "invalidated") queue.invalidate("Undo discarded the pending task.");
    queue.enqueue(request("next", { slot: "avatar", apply: nextApply }));
    // The old HTTP request is deliberately unresolved here. New work must not
    // require its response or the timeout before it can complete.
    await queue.whenIdle();
    expect(nextApply).toHaveBeenCalledExactlyOnceWith("asset:next");
    expect(queue.getSnapshot().find((task) => task.id === old)).toMatchObject({ status: "failed", retryable: false });
    expect(queue.getSnapshot().find((task) => task.name === "next")).toMatchObject({ status: "completed" });
    gate.resolve("obsolete-server-asset");
    await gate.promise;
    expect(obsoleteApply).not.toHaveBeenCalled();
    expect(nextApply).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "failure"] as const)("times out without blocking siblings and ignores a late %s during an explicit retry", async (lateResult) => {
    vi.useFakeTimers();
    const queue = new UploadTaskQueue({ timeoutMs: 40 });
    try {
      const first = deferred<string>();
      const retry = deferred<string>();
      const upload = vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => retry.promise);
      const apply = vi.fn(() => true);
      const siblingApply = vi.fn(() => true);
      const id = queue.enqueue(request("slow", { upload, apply }));
      queue.enqueue(request("sibling", { apply: siblingApply }));
      await vi.advanceTimersByTimeAsync(40);
      await queue.whenIdle();
      expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "failed", retryable: true, attempts: 1, error: expect.stringContaining("逾時") });
      expect(siblingApply).toHaveBeenCalledExactlyOnceWith("asset:sibling");
      expect(apply).not.toHaveBeenCalled();
      expect(upload).toHaveBeenCalledTimes(1);

      queue.retry(id);
      await Promise.resolve();
      expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "uploading", attempts: 2 });
      if (lateResult === "success") first.resolve("obsolete-server-asset");
      else first.reject(new Error("Old request failed after timeout"));
      await first.promise.catch(() => undefined);
      expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "uploading", attempts: 2 });
      expect(apply).not.toHaveBeenCalled();

      retry.resolve("new-server-asset");
      await queue.whenIdle();
      expect(apply).toHaveBeenCalledExactlyOnceWith("new-server-asset");
      expect(upload).toHaveBeenCalledTimes(2);
      expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "completed", retryable: false, attempts: 2, error: "" });
      expect(siblingApply).toHaveBeenCalledTimes(1);
    } finally {
      queue.invalidate("Test finished.");
      vi.useRealTimers();
    }
  });

  it("does not apply stale results or retry a removed target, and skips stale queued uploads", async () => {
    const queue = new UploadTaskQueue();
    const gate = deferred<string>();
    let valid = true;
    const apply = vi.fn(() => true);
    const upload = vi.fn(async () => gate.promise);
    const first = queue.enqueue(request("a", { upload, isCurrent: () => valid, apply }));
    queue.enqueue(request("b", { upload, isCurrent: () => valid, apply }));
    await Promise.resolve();
    valid = false;
    queue.invalidateStale();
    valid = true; // Restoring the same id must not revive cancelled tasks.
    queue.retry(first);
    gate.resolve("stored");
    await queue.whenIdle();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(queue.getSnapshot().every((task) => task.status === "failed" && !task.retryable)).toBe(true);
  });

  it("a newer choice wins the replacement slot and cannot invalidate a different scope", async () => {
    const queue = new UploadTaskQueue();
    const gate = deferred<string>();
    const values: string[] = [];
    const old = queue.enqueue(request("old", { slot: "avatar", upload: async () => gate.promise, apply: (value) => { values.push(value); return true; } }));
    await Promise.resolve();
    queue.enqueue(request("other", { scope: "other-window", slot: "avatar", apply: (value) => { values.push(value); return true; } }));
    queue.enqueue(request("new", { slot: "avatar", apply: (value) => { values.push(value); return true; } }));
    gate.resolve("obsolete");
    await queue.whenIdle();
    expect(values).toEqual(["asset:other", "asset:new"]);
    expect(queue.getSnapshot().find((task) => task.id === old)).toMatchObject({ status: "failed", retryable: false });
  });

  it("clearing task records releases retry state without undoing successful content", async () => {
    const queue = new UploadTaskQueue();
    const apply = vi.fn(() => true);
    const success = queue.enqueue(request("ok", { apply }));
    const failure = queue.enqueue(request("failed", { upload: async () => null }));
    queue.dismiss(success); // In-flight/queued records cannot disappear.
    expect(queue.getSnapshot()).toHaveLength(2);
    await queue.whenIdle();
    queue.dismiss(success);
    queue.dismiss(failure);
    queue.retry(failure);
    await queue.whenIdle();
    expect(queue.getSnapshot()).toEqual([]);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("an application failure does not re-upload the already stored asset", async () => {
    const queue = new UploadTaskQueue();
    const upload = vi.fn(async () => "stored");
    const id = queue.enqueue(request("saved-but-target-gone", { upload, apply: () => false }));
    await queue.whenIdle();
    queue.retry(id);
    await queue.whenIdle();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", retryable: false });
  });
});

describe("retry insertion", () => {
  it("inserts beside surviving siblings without resurrecting deleted items or replacing objects", () => {
    const third = { id: "3", caption: "edited" };
    const fifth = { id: "5", caption: "kept" };
    const outside = { id: "outside", caption: "new content" };
    const second = { id: "2", caption: "retry" };
    const actual = insertInSelectionOrder([third, fifth, outside], second, ["1", "2", "3", "4", "5"]);
    expect(actual).toEqual([second, third, fifth, outside]);
    expect(actual[1]).toBe(third);
    expect(actual[2]).toBe(fifth);
    expect(insertInSelectionOrder(actual, second, ["1", "2", "3", "4", "5"])).toBe(actual);
    expect(insertInSelectionOrder([third, outside], fifth, ["1", "2", "3", "4", "5"])).toEqual([third, fifth, outside]);
  });
});
