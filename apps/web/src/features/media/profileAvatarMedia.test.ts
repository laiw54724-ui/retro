import { afterEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, duplicateProfile, migrateSiteDocumentV2, projectV2ToLegacyDocument, updateProfile, type SiteDocumentV2Input } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import { UploadTaskQueue } from "./uploadTasks";
import { observeEditorMedia } from "./windowMediaSession";
import { enqueueProfileAvatar, profileAvatarScope } from "./profileAvatarMedia";

const siteId = "avatar-site";
const asset = "retro-asset:11111111-1111-4111-8111-111111111111";
const original = "https://example.com/old.png";
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function setup() {
  const legacy = createStarterDocument("Avatars", "classic98", "instagram");
  const migrated = migrateSiteDocumentV2(legacy, { siteId });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const profileId = migrated.document.entities.profiles[0].id;
  const changed = updateProfile(migrated.document, profileId, { avatar: original, avatarUrl: original }, { siteId });
  if (!changed.ok) throw new Error("fixture profile");
  const duplicated = duplicateProfile(changed.document, profileId, { siteId, id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("fixture duplicate");
  const projected = projectV2ToLegacyDocument(duplicated.document);
  if (!projected.ok) throw new Error("fixture projection");
  useEditorStore.getState().setSite(siteId, "avatar", projected.document, 1, null, null, "owner");
  useEditorStore.getState().setVersionedDocument(duplicated.document);
  const queue = new UploadTaskQueue();
  const stop = observeEditorMedia(queue, useEditorStore, siteId);
  cleanups.push(() => { stop(); queue.invalidate("end"); });
  const target = { siteId, profileId, windowId: duplicated.document.windows.find((w) => w.type === "instagram")!.id };
  const profile = (id = profileId) => useEditorStore.getState().versionedDocument!.entities.profiles.find((p) => p.id === id)!;
  const edit = (patch: Record<string, unknown>) => {
    const result = updateProfile(useEditorStore.getState().versionedDocument!, profileId, patch, { siteId });
    if (!result.ok) throw new Error("invalid test patch");
    replace(result.document);
  };
  const enqueue = (upload: (file: File) => Promise<string | null>, name = "avatar.png") => enqueueProfileAvatar(queue, target, new File(["bytes"], name, { type: "image/png" }), upload)!;
  return { queue, target, profile, edit, enqueue };
}
function replace(document: SiteDocumentV2Input) {
  const projected = projectV2ToLegacyDocument(document);
  if (!projected.ok) throw new Error("test projection");
  useEditorStore.getState().replaceDocument(projected.document, undefined, document);
}
function held() {
  let finish!: (value: string | null) => void;
  let start!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  const result = new Promise<string | null>((resolve) => { finish = resolve; });
  return { started, finish, upload: vi.fn(() => { start(); return result; }) };
}

describe("canonical profile avatar uploads", () => {
  it("applies to the originating profile after switching and preserves newer metadata", async () => {
    const s = setup(); const request = held(); s.enqueue(request.upload); await request.started;
    s.edit({ bio: "typed while uploading" });
    const document = structuredClone(useEditorStore.getState().versionedDocument!);
    const window = document.windows.find((w) => w.id === s.target.windowId)!;
    if (window.type !== "instagram") throw new Error("fixture");
    window.content.profileRef.id = "other";
    replace(document);
    request.finish(asset); await s.queue.whenIdle();
    expect(s.profile().avatar).toBe(asset);
    expect(s.profile().bio).toBe("typed while uploading");
    expect(s.profile("other").avatar).toBe(original);
    expect(s.profile().avatarUrl).toBe("");
  });
  it("a newer choice of the same file wins even if the old HTTP response arrives last", async () => {
    const s = setup(); const old = held(); s.enqueue(old.upload); await old.started;
    s.enqueue(async () => asset); await s.queue.whenIdle();
    old.finish("https://example.com/stale.png"); await Promise.resolve();
    expect(s.profile().avatar).toBe(asset);
    expect(s.queue.getSnapshot().map((task) => [task.status, task.retryable])).toEqual([["failed", false], ["completed", false]]);
  });
  it("typing an unfinished URL or cancelling invalidates before any persisted source change", async () => {
    const s = setup(); const request = held(); const id = s.enqueue(request.upload); await request.started;
    s.queue.invalidate("source edit", (entry) => entry.options.scope === profileAvatarScope(siteId, s.target.profileId));
    s.queue.retry(id); request.finish(asset); await s.queue.whenIdle();
    expect(s.profile().avatar).toBe(original);
    expect(s.queue.getSnapshot()[0].retryable).toBe(false);
    expect(request.upload).toHaveBeenCalledTimes(1);
  });
  it("keeps failure retryable and retries only that attempt", async () => {
    const s = setup(); const upload = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(asset);
    const id = s.enqueue(upload); await s.queue.whenIdle();
    expect(s.profile().avatar).toBe(original);
    expect(s.queue.getSnapshot()[0].retryable).toBe(true);
    s.queue.retry(id); s.queue.retry(id); await s.queue.whenIdle();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(s.profile().avatar).toBe(asset);
  });
  it.each(["source", "remove", "undo", "delete-window", "delete-profile", "viewer", "site", "reload"])("discards delayed completion after %s", async (action) => {
    const s = setup(); s.edit({ bio: "history step" });
    const request = held(); s.enqueue(request.upload); await request.started;
    if (action === "source") s.edit({ avatar: "https://example.com/new.png", avatarUrl: "https://example.com/new.png" });
    if (action === "remove") s.edit({ avatar: null, avatarUrl: "" });
    if (action === "undo") { useEditorStore.getState().undo(); useEditorStore.getState().redo(); }
    if (action === "delete-window") useEditorStore.getState().deleteWindow(s.target.windowId);
    if (action === "delete-profile") useEditorStore.setState((state) => ({ versionedDocument: { ...state.versionedDocument!, entities: { ...state.versionedDocument!.entities, profiles: state.versionedDocument!.entities.profiles.filter((p) => p.id !== s.target.profileId) } } }));
    if (action === "viewer") useEditorStore.setState({ accessRole: "viewer" });
    if (action === "site") useEditorStore.setState({ siteId: "other-site" });
    if (action === "reload") { const state = useEditorStore.getState(); state.setSite(siteId, "avatar", state.document!, 1, null, null, "owner"); }
    request.finish(asset); await s.queue.whenIdle();
    expect(s.queue.getSnapshot()[0]).toMatchObject({ status: "failed", retryable: false });
    expect(useEditorStore.getState().versionedDocument?.entities.profiles.find((p) => p.id === s.target.profileId)?.avatar).not.toBe(asset);
  });
});
