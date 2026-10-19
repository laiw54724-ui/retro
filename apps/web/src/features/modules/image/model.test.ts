import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2, projectV2ToLegacyDocument, type ImageContent } from "@retrodesk/shared";
import { useEditorStore } from "../../editor/store";
import { UploadTaskQueue } from "../../media/uploadTasks";
import { enqueueWindowUpload, observeEditorMedia } from "../../media/windowMediaSession";
import type { WindowOf } from "../types";
import { createImageContent, imageUploadOptions, patchImageContent } from "./model";

// This isolated leaf suite exercises the explicitly opted-in authoring path.
vi.mock("../../../lib/imageWindowCreation", () => ({ IMAGE_WINDOW_CREATION_ENABLED: true, canCreateWindowType: () => true }));

const SITE = "image-leaf-disposable-site";
const OLD = "https://example.com/old.png";
const ASSET = "retro-asset:11111111-1111-4111-8111-111111111111";
const NEXT = "retro-asset:22222222-2222-4222-8222-222222222222";

function imageWindow() {
  const target = useEditorStore.getState().document?.windows.find((item) => item.id === "image-leaf");
  if (target?.type !== "image") throw new Error("Image fixture was lost");
  return target;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const sessions: Array<{ queue: UploadTaskQueue; stop: () => void }> = [];
function session() {
  const queue = new UploadTaskQueue();
  sessions.push({ queue, stop: observeEditorMedia(queue, useEditorStore, SITE) });
  return queue;
}

function replace(queue: UploadTaskQueue, upload: (file: File) => Promise<string | null>) {
  const window = imageWindow();
  return enqueueWindowUpload(queue, useEditorStore, {
    siteId: SITE, windowId: window.id, windowType: "image", scope: `window:${window.id}:content`
  }, new File(["synthetic bytes"], "fixture.png", { type: "image/png" }), upload, imageUploadOptions(window));
}

beforeEach(() => {
  const legacy = createStarterDocument("Image test", "classic98", "card");
  const image = makeWindow("image", 0);
  if (image.type !== "image") throw new Error("Image factory returned another type");
  image.id = "image-leaf";
  image.content = { ...createImageContent(), src: OLD, srcUrl: OLD, alt: "Original description" };
  legacy.windows = [image];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Image migration failed");
  const projected = projectV2ToLegacyDocument(migrated.document);
  if (!projected.ok) throw new Error("Image projection failed");
  useEditorStore.getState().setSite(SITE, "image", projected.document, 1, null, null, "owner");
  useEditorStore.getState().setVersionedDocument(migrated.document);
});

afterEach(() => {
  for (const { queue, stop } of sessions.splice(0)) {
    stop();
    queue.invalidate("Fixture ended");
  }
});

describe("image module leaf", () => {
  it("retains accessibility, placement and background fields across source edits", () => {
    const original = imageWindow();
    const rich: Partial<ImageContent> = {
      alt: "A red kite", caption: "Summer", interactionMode: "decorative", fit: "cover",
      crop: { x: 23, y: 71, zoom: 2.1 }, background: { color: "#12aBcD" }, pixelated: true, showCaption: false
    };
    const edited = patchImageContent(original, rich);
    const replaced = patchImageContent(edited, { src: ASSET, srcUrl: "" });
    expect(replaced.content).toMatchObject({ ...rich, src: ASSET, srcUrl: "" });
    expect(original.content.src).toBe(OLD);
    expect(createImageContent()).toMatchObject({ frameMode: "simple", background: "transparent", fit: "contain", interactionMode: "content" });
  });

  it("commits a stable asset reference in one undo step and restores it on redo", async () => {
    const queue = session();
    replace(queue, async () => ASSET);
    await queue.whenIdle();
    expect(imageWindow().content).toMatchObject({ src: ASSET, srcUrl: "", alt: "Original description" });
    expect(useEditorStore.getState().past).toHaveLength(1);
    expect(useEditorStore.getState().versionedPast).toHaveLength(1);
    useEditorStore.getState().undo();
    expect(imageWindow().content).toMatchObject({ src: OLD, srcUrl: OLD });
    useEditorStore.getState().redo();
    expect(imageWindow().content.src).toBe(ASSET);
    expect(JSON.stringify(useEditorStore.getState().versionedDocument)).not.toContain("synthetic bytes");
  });

  it("retries a failed replacement without committing a failed asset", async () => {
    const queue = session();
    const upload = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(ASSET);
    const id = replace(queue, upload);
    await queue.whenIdle();
    expect(imageWindow().content.src).toBe(OLD);
    expect(queue.getSnapshot().find((task) => task.id === id)).toMatchObject({ status: "failed", retryable: true });
    queue.retry(id);
    await queue.whenIdle();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(imageWindow().content.src).toBe(ASSET);
    expect(useEditorStore.getState().past).toHaveLength(1);
  });

  it("discards late replacement after a URL edit and lets a newer file win the same slot", async () => {
    const queue = session();
    const late = deferred<string | null>();
    const started = deferred<void>();
    replace(queue, async () => { started.resolve(); return late.promise; });
    await started.promise;
    useEditorStore.getState().updateWindow("image-leaf", (current) => current.type === "image"
      ? patchImageContent(current, { src: "https://example.com/new.png", srcUrl: "https://example.com/new.png" }) : current);
    late.resolve(ASSET);
    await queue.whenIdle();
    expect(imageWindow().content.src).toBe("https://example.com/new.png");

    const secondLate = deferred<string | null>();
    const secondStarted = deferred<void>();
    replace(queue, async () => { secondStarted.resolve(); return secondLate.promise; });
    await secondStarted.promise;
    replace(queue, async () => NEXT);
    await queue.whenIdle();
    secondLate.resolve(ASSET);
    await Promise.resolve();
    expect(imageWindow().content).toMatchObject({ src: NEXT, srcUrl: "" });
  });
});
