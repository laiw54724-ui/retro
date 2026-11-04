import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStarterDocument,
  makeGalleryImage,
  makeIgPost,
  makeWindow,
  migrateSiteDocumentV2,
  parseSiteDocument,
  projectPublicSiteDocument,
  projectV2ToLegacyDocument,
  type SiteDocument,
  type SiteDocumentV2Input,
} from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import type { WindowOf } from "../modules/types";
import { UploadTaskQueue, type UploadKind } from "./uploadTasks";
import { enqueueWindowUpload, observeEditorMedia } from "./windowMediaSession";

const SITE_ID = "site-media-session";
const GALLERY_A = "gallery-a";
const GALLERY_B = "gallery-b";
const IMAGE_ID = "original-image";
const OLD_SOURCE = "https://example.com/original.png";
const STORED_ASSET = "retro-asset:11111111-1111-4111-8111-111111111111";
const NEWER_ASSET = "retro-asset:22222222-2222-4222-8222-222222222222";
const PRIVATE_ASSET = "retro-asset:33333333-3333-4333-8333-333333333333";

function fixture(siteId = SITE_ID) {
  const legacy = createStarterDocument("Media session", "classic98", "card");
  const galleryA = makeWindow("gallery", 0);
  const galleryB = makeWindow("gallery", 1);
  const document = makeWindow("document", 2);
  const instagram = makeWindow("instagram", 3);
  if (galleryA.type !== "gallery" || galleryB.type !== "gallery" || instagram.type !== "instagram") throw new Error("Fixture window type mismatch");
  galleryA.id = GALLERY_A;
  galleryB.id = GALLERY_B;
  galleryA.content.images = [makeGalleryImage({ id: IMAGE_ID, src: OLD_SOURCE, title: "Original title", caption: "Original caption", alt: "Original alternative text" })];
  galleryB.content.images = [makeGalleryImage({ id: IMAGE_ID, src: OLD_SOURCE, title: "Other window image" })];
  document.id = "document-a";
  instagram.id = "private-oc";
  instagram.content.profile.name = "PRIVATE_OC_NAME";
  instagram.content.profile.avatar = PRIVATE_ASSET;
  instagram.content.images = [makeIgPost({ id: "private-post", caption: "PRIVATE_POST_CAPTION", src: PRIVATE_ASSET })];
  legacy.windows = [galleryA, galleryB, document, instagram];
  const migrated = migrateSiteDocumentV2(legacy, { siteId });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Fixture migration failed");
  migrated.document.entities.profiles[0].visibility = "draft";
  const view = projectV2ToLegacyDocument(migrated.document);
  if (!view.ok) throw new Error("Fixture view projection failed");
  return { legacy: view.document, canonical: migrated.document };
}

function load(siteId = SITE_ID, data = fixture(siteId), role: "owner" | "editor" | "viewer" = "owner") {
  const store = useEditorStore.getState();
  store.setSite(siteId, "media", data.legacy, 1, null, null, role);
  store.setVersionedDocument(data.canonical);
  return data;
}

function gallery(id = GALLERY_A, document = useEditorStore.getState().document) {
  const target = document?.windows.find((window) => window.id === id);
  if (target?.type !== "gallery") throw new Error("Gallery target missing");
  return target;
}

function originalImage(id = GALLERY_A) {
  const image = gallery(id).content.images.find((item) => item.id === IMAGE_ID);
  if (!image) throw new Error("Original image missing");
  return image;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function transport() {
  const started = deferred<void>();
  const result = deferred<string | null>();
  const upload = vi.fn((_file: File, _kind: UploadKind) => {
    started.resolve();
    return result.promise;
  });
  return { upload, started: started.promise, finish: result.resolve };
}

const sessions: Array<{ queue: UploadTaskQueue; stop: () => void }> = [];

function session() {
  const queue = new UploadTaskQueue();
  const stop = observeEditorMedia(queue, useEditorStore, SITE_ID);
  sessions.push({ queue, stop });
  return queue;
}

function enqueueReplacement(queue: UploadTaskQueue, upload: (file: File, kind: UploadKind) => Promise<string | null>, overrides: { siteId?: string; windowId?: string; name?: string } = {}) {
  const windowId = overrides.windowId ?? GALLERY_A;
  const source = originalImage(windowId);
  const apply = vi.fn((current: WindowOf<"gallery">, stored: string): WindowOf<"gallery"> => ({
    ...current,
    content: {
      ...current.content,
      images: current.content.images.map((image) => image.id === IMAGE_ID ? { ...image, src: stored, srcUrl: "" } : image),
    },
  }));
  const id = enqueueWindowUpload(queue, useEditorStore, {
    siteId: overrides.siteId ?? SITE_ID, windowId, windowType: "gallery", scope: `${SITE_ID}:${windowId}`,
  }, new File(["local-image-bytes"], overrides.name ?? "LOCAL_UPLOAD.png", { type: "image/png" }), upload, {
    slot: `image:${IMAGE_ID}`,
    isCurrent: (current) => current.content.images.some((image) => image.id === IMAGE_ID && image.src === source.src && image.srcUrl === source.srcUrl),
    apply,
  });
  return { id, apply };
}

function expectDiscarded(queue: UploadTaskQueue, id: string) {
  expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "failed", retryable: false });
}

beforeEach(() => { load(); });
afterEach(() => {
  for (const { queue, stop } of sessions.splice(0)) {
    stop();
    queue.invalidate("Test session ended");
  }
});

describe("media uploads bound to editor sessions", () => {
  it("checks a temporary gallery capacity limit at commit without treating it as a stale target", async () => {
    const queue = session();
    const upload = transport();
    const pendingId = "pending-image";
    const taskId = enqueueWindowUpload(queue, useEditorStore, {
      siteId: SITE_ID, windowId: GALLERY_A, windowType: "gallery", scope: `${SITE_ID}:${GALLERY_A}`,
    }, new File(["image"], "pending.png", { type: "image/png" }), upload.upload, {
      slot: `add:${pendingId}`,
      isCurrent: (current) => !current.content.images.some((image) => image.id === pendingId),
      canApply: (current) => current.content.images.length < 2,
      apply: (current, src) => ({ ...current, content: { ...current.content, images: [...current.content.images, makeGalleryImage({ id: pendingId, src })] } }),
    });
    await upload.started;
    useEditorStore.getState().updateWindow(GALLERY_A, (current) => current.type === "gallery" ? {
      ...current, content: { ...current.content, images: [...current.content.images, makeGalleryImage({ id: "newer-image" })] },
    } : current);
    expect(queue.getSnapshot().find((task) => task.id === taskId)?.status).toBe("uploading");
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expectDiscarded(queue, taskId);
    expect(gallery().content.images.map((image) => image.id)).toEqual([IMAGE_ID, "newer-image"]);
  });

  it("writes to the original window when selection changes to another gallery with the same image id", async () => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    useEditorStore.getState().select(GALLERY_B);
    const otherBefore = structuredClone(gallery(GALLERY_B));
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(originalImage().src).toBe(STORED_ASSET);
    expect(gallery(GALLERY_B)).toEqual(otherBefore);
    expect(useEditorStore.getState().selectedId).toBe(GALLERY_B);
    expect(pending.apply).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()[0].status).toBe("completed");
  });

  it("does not start transport for a target captured from another site", async () => {
    const queue = session();
    const upload = vi.fn(async () => STORED_ASSET);
    const pending = enqueueReplacement(queue, upload, { siteId: "previous-site" });
    await queue.whenIdle();
    expect(upload).not.toHaveBeenCalled();
    expect(pending.apply).not.toHaveBeenCalled();
    expectDiscarded(queue, pending.id);
    expect(originalImage().src).toBe(OLD_SOURCE);
  });

  it.each(["another site", "another window type", "viewer access"] as const)("discards in-flight results after switching to %s", async (change) => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    if (change === "another site") load("another-site");
    else if (change === "viewer access") load(SITE_ID, fixture(), "viewer");
    else {
      const replacement = makeWindow("document");
      useEditorStore.getState().updateWindow(GALLERY_A, (current) => ({ ...replacement, id: current.id }));
    }
    const before = structuredClone(useEditorStore.getState().versionedDocument);
    expectDiscarded(queue, pending.id);
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).not.toHaveBeenCalled();
    expect(useEditorStore.getState().versionedDocument).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(STORED_ASSET);
  });

  it.each(["window", "image"] as const)("does not resurrect an upload after its %s is deleted and restored with undo", async (deleted) => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    const store = useEditorStore.getState();
    if (deleted === "window") store.deleteWindow(GALLERY_A);
    else store.updateWindow(GALLERY_A, (current) => current.type === "gallery" ? { ...current, content: { ...current.content, images: [] } } : current);
    expectDiscarded(queue, pending.id);
    store.undo();
    expect(originalImage().src).toBe(OLD_SOURCE);
    const before = structuredClone(useEditorStore.getState().versionedDocument);
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).not.toHaveBeenCalled();
    expect(useEditorStore.getState().versionedDocument).toEqual(before);
  });

  it.each(["new JSON snapshot", "same document object"] as const)("invalidates pending work when setSite reloads the same site using a %s", async (snapshot) => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    const state = useEditorStore.getState();
    const legacy = snapshot === "same document object" ? state.document! : JSON.parse(JSON.stringify(state.document)) as SiteDocument;
    const canonical = snapshot === "same document object" ? state.versionedDocument! : JSON.parse(JSON.stringify(state.versionedDocument)) as SiteDocumentV2Input;
    load(SITE_ID, { legacy, canonical });
    expectDiscarded(queue, pending.id);
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).not.toHaveBeenCalled();
    expect(originalImage().src).toBe(OLD_SOURCE);
    expect(useEditorStore.getState().past).toHaveLength(0);
  });

  it.each(["undo", "redo"] as const)("cancels pending writes when %s changes history even though the image source is unchanged", async (action) => {
    const store = useEditorStore.getState();
    store.setSiteName("History edit");
    if (action === "redo") store.undo();
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    store[action]();
    expect(originalImage().src).toBe(OLD_SOURCE);
    expectDiscarded(queue, pending.id);
    const expectedHistory = useEditorStore.getState().past.length;
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).not.toHaveBeenCalled();
    expect(useEditorStore.getState().past).toHaveLength(expectedHistory);
    expect(originalImage().src).toBe(OLD_SOURCE);
  });

  it("allows ordinary edits, focus, view state, autosave, and a new history branch while uploading", async () => {
    const store = useEditorStore.getState();
    store.setSiteName("A redo candidate");
    store.undo();
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    store.setSiteName("A new history branch");
    store.focusWindow(GALLERY_B);
    store.setDevice("mobile");
    store.setViewState(GALLERY_A, "min");
    store.updateWindow(GALLERY_B, (current) => ({ ...current, title: "Changed while uploading" }));
    store.setSaveStatus("saving");
    store.markSaved(2, useEditorStore.getState().document!);
    expect(queue.getSnapshot().find((task) => task.id === pending.id)?.status).toBe("uploading");
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).toHaveBeenCalledTimes(1);
    expect(originalImage().src).toBe(STORED_ASSET);
    expect(gallery(GALLERY_B).title).toBe("Changed while uploading");
    expect(useEditorStore.getState()).toMatchObject({ selectedId: GALLERY_B, device: "mobile", saveStatus: "dirty", version: 2 });
    expect(useEditorStore.getState().document?.siteName).toBe("A new history branch");
  });

  it("rejects a stale replacement when its source is edited, even if the original source is restored", async () => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    const setSource = (src: string) => useEditorStore.getState().updateWindow(GALLERY_A, (current) => current.type === "gallery" ? {
      ...current,
      content: { ...current.content, images: current.content.images.map((image) => image.id === IMAGE_ID ? { ...image, src } : image) },
    } : current);
    setSource("https://example.com/manually-edited.png");
    expectDiscarded(queue, pending.id);
    setSource(OLD_SOURCE);
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).not.toHaveBeenCalled();
    expect(originalImage().src).toBe(OLD_SOURCE);
  });

  it("supersedes an unfinished replacement and never commits the older file", async () => {
    const queue = session();
    const first = transport();
    const second = transport();
    const oldTask = enqueueReplacement(queue, first.upload, { name: "older.png" });
    await first.started;
    const newTask = enqueueReplacement(queue, second.upload, { name: "newer.png" });
    expectDiscarded(queue, oldTask.id);
    first.finish(STORED_ASSET);
    await second.started;
    expect(originalImage().src).toBe(OLD_SOURCE);
    expect(oldTask.apply).not.toHaveBeenCalled();
    second.finish(NEWER_ASSET);
    await queue.whenIdle();
    expect(originalImage().src).toBe(NEWER_ASSET);
    expect(newTask.apply).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(queue.getSnapshot().find((task) => task.id === newTask.id)?.status).toBe("completed");
  });

  it("merges completion with the newest fields, order, and sibling data", async () => {
    const queue = session();
    const upload = transport();
    const pending = enqueueReplacement(queue, upload.upload);
    await upload.started;
    const sibling = makeGalleryImage({ id: "added-while-uploading", src: "https://example.com/sibling.png", caption: "Keep this sibling" });
    useEditorStore.getState().updateWindow(GALLERY_A, (current) => current.type === "gallery" ? {
      ...current, title: "Latest window title",
      content: { columns: 4, images: [sibling, ...current.content.images.map((image) => ({ ...image, title: "Latest title", caption: "Latest caption", alt: "Latest alternative text", href: "https://example.com/artwork" }))] },
    } : current);
    upload.finish(STORED_ASSET);
    await queue.whenIdle();
    expect(pending.apply).toHaveBeenCalledTimes(1);
    expect(gallery()).toMatchObject({ title: "Latest window title", content: { columns: 4 } });
    expect(gallery().content.images[0]).toEqual(sibling);
    expect(gallery().content.images[1]).toMatchObject({ id: IMAGE_ID, src: STORED_ASSET, title: "Latest title", caption: "Latest caption", alt: "Latest alternative text", href: "https://example.com/artwork" });
    const canonicalWindow = useEditorStore.getState().versionedDocument?.windows.find((window) => window.id === GALLERY_A);
    expect(canonicalWindow).toEqual(gallery());
  });

  it("commits one canonical history step that survives undo, redo, reload, and private-safe public projection", async () => {
    const queue = session();
    const pending = enqueueReplacement(queue, async () => STORED_ASSET);
    await queue.whenIdle();
    const store = useEditorStore.getState();
    expect(pending.apply).toHaveBeenCalledTimes(1);
    expect(store.past).toHaveLength(1);
    expect(store.versionedPast).toHaveLength(1);
    expect(originalImage().src).toBe(STORED_ASSET);
    store.undo();
    expect(originalImage().src).toBe(OLD_SOURCE);
    const undoneGallery = useEditorStore.getState().versionedDocument?.windows.find((window) => window.id === GALLERY_A);
    expect(undoneGallery?.type === "gallery" && undoneGallery.content.images[0].src).toBe(OLD_SOURCE);
    store.redo();
    expect(originalImage().src).toBe(STORED_ASSET);
    const raw = JSON.stringify(useEditorStore.getState().versionedDocument);
    expect(raw).not.toContain("LOCAL_UPLOAD.png");
    expect(raw).not.toContain("local-image-bytes");
    const reloaded = parseSiteDocument(JSON.parse(raw));
    if (!reloaded.ok || reloaded.version !== 2) throw new Error("Reload failed");
    const view = projectV2ToLegacyDocument(reloaded.document);
    if (!view.ok) throw new Error("Reload view failed");
    load(SITE_ID, { legacy: view.document, canonical: reloaded.document });
    expect(originalImage().src).toBe(STORED_ASSET);
    const projected = projectPublicSiteDocument(useEditorStore.getState().versionedDocument, SITE_ID);
    if (!projected.ok || projected.document.schemaVersion !== 2) throw new Error("Public projection failed");
    const publicGallery = projected.document.windows.find((window) => window.id === GALLERY_A);
    expect(publicGallery?.type === "gallery" && publicGallery.content.images[0].src).toBe(STORED_ASSET);
    expect(projected.document.entities.profiles).toEqual([]);
    expect(projected.document.entities.posts).toEqual([]);
    expect(JSON.stringify(projected.document)).not.toMatch(/PRIVATE_OC_NAME|PRIVATE_POST_CAPTION/);
    expect(JSON.stringify(projected.document)).not.toContain(PRIVATE_ASSET);
    expect(queue.getSnapshot()[0].status).toBe("completed");
  });
});
