import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument, type MusicTrack } from "@retrodesk/shared";
import { useEditorStore } from "../../editor/store";
import { enqueueWindowUpload, observeEditorMedia } from "../../media/windowMediaSession";
import { UploadTaskQueue } from "../../media/uploadTasks";
import { musicUploadOptions, musicUploadScope, type MusicUploadField } from "./musicUploads";

const asset = "retro-asset:11111111-1111-4111-8111-111111111111";
const track = (id: string): MusicTrack => ({ id, title: id, artist: "Artist", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://example.com/song.mp3" }, lyrics: "lyrics", rightsNote: "Original" });
let queue: UploadTaskQueue;
let stop: () => void;
function music(id = "a") {
  const window = useEditorStore.getState().document!.windows.find((item) => item.id === id);
  if (window?.type !== "music") throw new Error("missing music");
  return window;
}
function edit(recipe: (tracks: MusicTrack[]) => MusicTrack[]) {
  useEditorStore.getState().updateWindow("a", (current) => current.type === "music" ? { ...current, content: { ...current.content, tracks: recipe(current.content.tracks) } } : current);
}
function enqueue(upload: (file: File, kind: string) => Promise<string | null>, id = "one", field: MusicUploadField = "audio") {
  const original = music().content.tracks.find((item) => item.id === id)!;
  return enqueueWindowUpload(queue, useEditorStore, { siteId: "site", windowId: "a", windowType: "music", scope: musicUploadScope("a", id) }, new File(["bytes"], `${id}.${field}`), upload, musicUploadOptions(original, field));
}
function deferred() {
  let resolve!: (value: string | null) => void;
  const upload = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
  return { upload, finish: (value: string | null) => resolve(value) };
}
beforeEach(() => {
  const document = createStarterDocument("Music", "classic98", "card");
  document.windows = ["a", "b"].map((id) => {
    const window = makeWindow("music");
    if (window.type !== "music") throw new Error("fixture");
    return { ...window, id, content: { tracks: [track("one"), track("two")], playlist: { id: `playlist-${id}`, title: id, trackIds: ["one", "two"] } } };
  });
  const migrated = migrateSiteDocumentV2(document, { siteId: "site" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration");
  useEditorStore.getState().setSite("site", "demo", document, 1, null, null, "owner");
  useEditorStore.getState().setVersionedDocument(migrated.document);
  queue = new UploadTaskQueue();
  stop = observeEditorMedia(queue, useEditorStore, "site");
});
afterEach(() => { stop(); queue.invalidate("end"); });

it("keeps cover/audio successes and newer edits; retries only the failure", async () => {
  const upload = vi.fn().mockResolvedValueOnce(asset).mockResolvedValueOnce(null).mockResolvedValueOnce(asset);
  enqueue(upload, "one", "cover");
  const failed = enqueue(upload, "two");
  await queue.whenIdle();
  expect(queue.getSnapshot().map((task) => task.status)).toEqual(["completed", "failed"]);
  edit((tracks) => tracks.map((item) => ({ ...item, title: `Edited ${item.id}` })).reverse());
  queue.retry(failed);
  await queue.whenIdle();
  expect(upload.mock.calls.map(([file, kind]) => [file.name, kind])).toEqual([["one.cover", "image"], ["two.audio", "audio"], ["two.audio", "audio"]]);
  expect(music().content.tracks[1]).toMatchObject({ title: "Edited one", cover: asset });
  expect(music().content.tracks[0]).toMatchObject({ title: "Edited two", source: { kind: "uploadedAudio", asset } });
});

it.each(["audio", "cover"] as const)("merges %s into its original track/window while other fields change", async (field) => {
  const pending = deferred(); enqueue(pending.upload, "one", field);
  await vi.waitFor(() => expect(pending.upload).toHaveBeenCalledOnce());
  useEditorStore.getState().select("b");
  const other = structuredClone(music("b"));
  edit((tracks) => tracks.map((item) => ({ ...item, title: "New title", lyrics: "New lyrics" })).reverse());
  pending.finish(asset); await queue.whenIdle();
  expect(music("b")).toEqual(other);
  expect(music().content.tracks[1]).toMatchObject({ id: "one", title: "New title", lyrics: "New lyrics", ...(field === "audio" ? { source: { kind: "uploadedAudio", asset } } : { cover: asset }) });
});

it.each(["source", "cover", "track deletion", "window deletion", "undo", "reload"])("discards a delayed upload after %s", async (change) => {
  useEditorStore.getState().setSiteName("Before upload");
  const pending = deferred(); enqueue(pending.upload, "one", change === "cover" ? "cover" : "audio");
  await vi.waitFor(() => expect(pending.upload).toHaveBeenCalledOnce());
  if (change === "source") edit((tracks) => tracks.map((item) => ({ ...item, source: { kind: "externalLink", url: "https://example.com/new" } })));
  if (change === "cover") edit((tracks) => tracks.map((item) => ({ ...item, coverUrl: "https://example.com/new.png", cover: "https://example.com/new.png" })));
  if (change === "track deletion") edit((tracks) => tracks.filter((item) => item.id !== "one"));
  if (change === "window deletion") useEditorStore.getState().deleteWindow("a");
  if (change === "undo") useEditorStore.getState().undo();
  if (change === "reload") {
    const state = useEditorStore.getState();
    state.setSite("site", "demo", structuredClone(state.document!), 1, null, null, "owner");
  }
  const before = JSON.stringify(useEditorStore.getState().document);
  pending.finish(asset); await queue.whenIdle();
  expect(queue.getSnapshot()[0]).toMatchObject({ status: "failed", retryable: false });
  expect(JSON.stringify(useEditorStore.getState().document)).toBe(before);
});

it("a newer upload supersedes the same track slot without blocking a sibling", async () => {
  const pending = deferred(); enqueue(pending.upload);
  await vi.waitFor(() => expect(pending.upload).toHaveBeenCalledOnce());
  enqueue(async () => asset);
  enqueue(async () => asset, "two", "cover");
  await queue.whenIdle();
  pending.finish("https://example.com/stale.mp3");
  await Promise.resolve();
  expect(music().content.tracks[0].source).toEqual({ kind: "uploadedAudio", asset });
  expect(music().content.tracks[1].cover).toBe(asset);
  expect(queue.getSnapshot().map((task) => task.status)).toEqual(["failed", "completed", "completed"]);
});

it("successful audio survives canonical undo/redo, reload and public projection without task metadata", async () => {
  enqueue(async () => asset); await queue.whenIdle();
  const state = useEditorStore.getState();
  state.undo(); expect(music().content.tracks[0].source.kind).toBe("audioUrl");
  state.redo(); expect(music().content.tracks[0].source).toEqual({ kind: "uploadedAudio", asset });
  const saved = structuredClone(useEditorStore.getState().versionedDocument!);
  const projected = projectPublicSiteDocument(saved, "site");
  expect(projected.ok).toBe(true);
  expect(JSON.stringify(projected)).toContain(asset);
  expect(JSON.stringify(saved)).not.toMatch(/one.audio|attempts|uploading/);
  state.setSite("site", "demo", structuredClone(useEditorStore.getState().document!), 2, null, null, "owner");
  state.setVersionedDocument(saved);
  expect(music().content.tracks[0].source).toEqual({ kind: "uploadedAudio", asset });
});
