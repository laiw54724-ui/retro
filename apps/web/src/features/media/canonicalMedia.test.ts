import { afterEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, createPost, createHighlight, duplicateProfile, migrateSiteDocumentV2, projectV2ToLegacyDocument, updatePost, updateHighlight, type SiteDocumentV2Input } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import { UploadTaskQueue } from "./uploadTasks";
import { observeEditorMedia } from "./windowMediaSession";
import { availableCanonicalMediaSlots, enqueueCanonicalMedia, type CanonicalMediaTarget } from "./canonicalMedia";

const siteId = "batch-site";
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
const file = (name: string) => new File(["bytes"], name, { type: "image/png" });
function replace(document: SiteDocumentV2Input) {
  const projected = projectV2ToLegacyDocument(document);
  if (!projected.ok) throw new Error("projection");
  useEditorStore.getState().replaceDocument(projected.document, undefined, document);
}
function setup(kind: "post" | "highlight") {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Batch", "classic98", "instagram"), { siteId });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const profileId = migrated.document.entities.profiles[0].id;
  const duplicate = duplicateProfile(migrated.document, profileId, { siteId, id: "other-profile", handle: "other-profile" });
  if (!duplicate.ok) throw new Error("duplicate fixture");
  const created = kind === "post" ? createPost(duplicate.document, { id: "target", authorProfileId: profileId, caption: "original" }, { siteId })
    : createHighlight(duplicate.document, { id: "target", ownerProfileId: profileId, title: "Original" }, { siteId });
  if (!created.ok) throw new Error("target fixture");
  const projected = projectV2ToLegacyDocument(created.document);
  if (!projected.ok) throw new Error("projection");
  useEditorStore.getState().setSite(siteId, "batch", projected.document, 1, null, null, "owner");
  useEditorStore.getState().setVersionedDocument(created.document);
  const target: CanonicalMediaTarget = { siteId, profileId, kind, entityId: "target", windowId: created.document.windows.find((window) => window.type === "instagram")!.id };
  const queue = new UploadTaskQueue(); const stop = observeEditorMedia(queue, useEditorStore, siteId);
  cleanups.push(() => { stop(); queue.invalidate("end"); });
  const document = () => useEditorStore.getState().versionedDocument!;
  const entity = () => kind === "post" ? document().entities.posts.find((post) => post.id === "target")! : document().entities.highlights!.find((highlight) => highlight.id === "target")!;
  const items = () => { const e = entity(); return e.kind === "post" ? e.media ?? [] : e.frames ?? []; };
  const edit = (patch: Record<string, unknown>) => {
    const result = kind === "post" ? updatePost(document(), "target", patch, { siteId }) : updateHighlight(document(), "target", patch, { siteId });
    if (!result.ok) throw new Error("test patch"); replace(result.document);
  };
  const enqueue = (names: string[], upload: (file: File) => Promise<string | null>) => enqueueCanonicalMedia(queue, target, names.map(file), upload);
  return { queue, target, document, entity, items, edit, enqueue };
}
function held() {
  let finish!: (value: string | null) => void; let begin!: () => void;
  const started = new Promise<void>((resolve) => { begin = resolve; });
  const result = new Promise<string | null>((resolve) => { finish = resolve; });
  return { started, finish, upload: vi.fn(() => { begin(); return result; }) };
}

for (const kind of ["post", "highlight"] as const) describe(`${kind} canonical uploads`, () => {
  it("keeps successes, retries only the failed file in order, and preserves newer source/alt/text edits", async () => {
    const s = setup(kind); const calls: string[] = [];
    const upload = vi.fn(async (picked: File) => { calls.push(picked.name); return picked.name === "b.png" && calls.filter((name) => name === "b.png").length === 1 ? null : `https://example.com/${picked.name}`; });
    const { taskIds } = s.enqueue(["a.png", "b.png", "c.png"], upload); await s.queue.whenIdle();
    expect(s.items().map((item) => item.src)).toEqual(["https://example.com/a.png", "https://example.com/c.png"]);
    const originalIds = s.items().map((item) => item.id);
    s.edit({ [kind === "post" ? "caption" : "title"]: "new metadata", [kind === "post" ? "media" : "frames"]: s.items().map((item) => ({ ...item, src: item.src?.replace("example.com", "new.example.com"), alt: "edited alt", ...(kind === "highlight" ? { text: "edited text" } : {}) })) });
    s.queue.retry(taskIds[1]); s.queue.retry(taskIds[1]); await s.queue.whenIdle();
    expect(calls).toEqual(["a.png", "b.png", "c.png", "b.png"]);
    expect(s.items().map((item) => item.src)).toEqual(["https://new.example.com/a.png", "https://example.com/b.png", "https://new.example.com/c.png"]);
    expect(s.items()[0]).toMatchObject({ id: originalIds[0], alt: "edited alt" });
    expect(s.items()[2]).toMatchObject({ id: originalIds[1], alt: "edited alt" });
    expect(s.entity()).toMatchObject(kind === "post" ? { caption: "new metadata" } : { title: "new metadata" });
  });
  it("cancels a hung file, continues queued siblings and discards its late success", async () => {
    const s = setup(kind); const pending = held(); const calls: string[] = [];
    const result = s.enqueue(["hung.png", "next.png"], async (picked) => { calls.push(picked.name); return picked.name === "hung.png" ? pending.upload() : "https://example.com/next.png"; });
    await pending.started;
    s.queue.invalidate("cancelled", (entry) => entry.view.id === result.taskIds[0]);
    await s.queue.whenIdle(); pending.finish("https://example.com/late.png"); await Promise.resolve();
    expect(s.items()).toHaveLength(1); expect(s.items()[0].src).toBe("https://example.com/next.png");
    expect(calls).toEqual(["hung.png", "next.png"]);
    s.queue.retry(result.taskIds[0]); await s.queue.whenIdle(); expect(calls).toHaveLength(2);
  });
  it("a retry never restores a removed successful sibling or replaces a later batch", async () => {
    const s = setup(kind); let retry = false;
    const result = s.enqueue(["a.png", "b.png", "c.png"], async (picked) => picked.name === "b.png" && !retry ? null : `https://example.com/${picked.name}`);
    await s.queue.whenIdle();
    s.edit({ [kind === "post" ? "media" : "frames"]: s.items().slice(1) });
    s.enqueue(["later.png"], async () => "https://example.com/later.png"); await s.queue.whenIdle();
    retry = true; s.queue.retry(result.taskIds[1]); await s.queue.whenIdle();
    expect(s.items().map((item) => item.src)).toEqual(["https://example.com/b.png", "https://example.com/c.png", "https://example.com/later.png"]);
  });
  it("allows repeated selection with distinct IDs and reserves bounded slots across pending batches", async () => {
    const s = setup(kind); const pending = held(); const max = kind === "post" ? 10 : 50;
    const first = s.enqueue(Array.from({ length: max - 1 }, () => "same.png"), pending.upload);
    await pending.started;
    const second = s.enqueue(["same.png", "overflow.png"], async () => "https://example.com/same.png");
    expect(first.taskIds).toHaveLength(max - 1); expect(second.taskIds).toHaveLength(1); expect(second.omitted).toBe(1);
    expect(availableCanonicalMediaSlots(s.queue, s.target)).toBe(0);
    pending.finish("https://example.com/same.png"); await s.queue.whenIdle();
    expect(s.items()).toHaveLength(max); expect(new Set(s.items().map((item) => item.id)).size).toBe(max);
  });
  it("switching the selected OC preserves the originating target", async () => {
    const s = setup(kind); const pending = held(); s.enqueue(["a.png"], pending.upload); await pending.started;
    const document = structuredClone(s.document()); const window = document.windows.find((w) => w.id === s.target.windowId)!;
    if (window.type !== "instagram") throw new Error("fixture"); window.content.profileRef.id = "other-profile"; replace(document);
    pending.finish("https://example.com/a.png"); await s.queue.whenIdle(); expect(s.items()).toHaveLength(1);
    expect(s.entity()).toMatchObject(kind === "post" ? { authorProfileId: s.target.profileId } : { ownerProfileId: s.target.profileId });
  });
  it.each(["deleted", "reassigned", "viewer", "site", "undo-redo", "window-deleted", "reload"])("rejects a late write after %s, even if the original target is restored", async (action) => {
    const s = setup(kind); s.edit(kind === "post" ? { caption: "history" } : { title: "history" });
    const pending = held(); const { taskIds } = s.enqueue(["a.png"], pending.upload); await pending.started;
    const before = structuredClone(s.document());
    if (action === "deleted") useEditorStore.setState({ versionedDocument: { ...before, entities: { ...before.entities, ...(kind === "post" ? { posts: before.entities.posts.filter((post) => post.id !== "target") } : { highlights: before.entities.highlights!.filter((highlight) => highlight.id !== "target") }) } } });
    if (action === "reassigned") s.edit(kind === "post" ? { authorProfileId: "other-profile" } : { ownerProfileId: "other-profile" });
    if (action === "viewer") useEditorStore.setState({ accessRole: "viewer" });
    if (action === "site") useEditorStore.setState({ siteId: "elsewhere" });
    if (action === "undo-redo") { useEditorStore.getState().undo(); useEditorStore.getState().redo(); }
    if (action === "window-deleted") useEditorStore.getState().deleteWindow(s.target.windowId);
    if (action === "reload") { const state = useEditorStore.getState(); state.setSite(siteId, "batch", state.document!, 1, null, null, "owner"); }
    useEditorStore.setState({ siteId, accessRole: "owner", versionedDocument: before });
    s.queue.retry(taskIds[0]); pending.finish("https://example.com/late.png"); await s.queue.whenIdle();
    expect(s.items()).toHaveLength(0); expect(s.queue.getSnapshot()[0]).toMatchObject({ status: "failed", retryable: false });
    expect(pending.upload).toHaveBeenCalledTimes(1);
  });
});
