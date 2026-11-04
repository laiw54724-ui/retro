import { HighlightEntityV2Schema, PostEntityV2Schema, projectV2ToLegacyDocument, updateHighlight, updatePost } from "@retrodesk/shared";
import { useEditorStore } from "../editor/store";
import { insertInSelectionOrder, type UploadTaskQueue } from "./uploadTasks";

export type CanonicalMediaTarget = {
  siteId: string;
  windowId: string;
  profileId: string;
  entityId: string;
  kind: "post" | "highlight";
};
export const canonicalMediaScope = (target: Omit<CanonicalMediaTarget, "windowId">) => JSON.stringify(["ig-media", target.siteId, target.profileId, target.kind, target.entityId]);
const limitFor = (target: CanonicalMediaTarget) => target.kind === "post" ? 10 : 50;

function readTarget(target: CanonicalMediaTarget) {
  const state = useEditorStore.getState();
  const document = state.versionedDocument;
  if (state.siteId !== target.siteId || state.accessRole === "viewer" || !document) return null;
  if (!document.windows.some((window) => window.id === target.windowId && window.type === "instagram") ||
      !document.entities.profiles.some((profile) => profile.id === target.profileId && profile.siteId === target.siteId)) return null;
  if (target.kind === "post") {
    const parsed = PostEntityV2Schema.safeParse(document.entities.posts.find((post) => post.id === target.entityId));
    return parsed.success && parsed.data.siteId === target.siteId && parsed.data.authorProfileId === target.profileId
      ? { kind: "post" as const, document, entity: parsed.data, items: parsed.data.media } : null;
  }
  const parsed = HighlightEntityV2Schema.safeParse(document.entities.highlights?.find((highlight) => highlight.id === target.entityId));
  return parsed.success && parsed.data.siteId === target.siteId && parsed.data.ownerProfileId === target.profileId
    ? { kind: "highlight" as const, document, entity: parsed.data, items: parsed.data.frames } : null;
}

/** Failed, retryable files retain a slot until retried or dismissed. No canonical placeholders. */
export function availableCanonicalMediaSlots(queue: UploadTaskQueue, target: CanonicalMediaTarget) {
  const current = readTarget(target);
  if (!current) return 0;
  const scope = canonicalMediaScope(target);
  const reserved = queue.getSnapshot().filter((task) => task.scope === scope && (task.status === "queued" || task.status === "uploading" || task.retryable)).length;
  return Math.max(0, limitFor(target) - current.items.length - reserved);
}

/** Each file settles independently; retries preserve surviving selection siblings and newer edits. */
export function enqueueCanonicalMedia(queue: UploadTaskQueue, target: CanonicalMediaTarget, files: File[], upload: (file: File) => Promise<string | null>) {
  const selected = files.slice(0, availableCanonicalMediaSlots(queue, target));
  const ids = selected.map(() => `${target.kind === "post" ? "media" : "frame"}:${crypto.randomUUID()}`);
  const scope = canonicalMediaScope(target);
  const taskIds = selected.map((file, index) => {
    const id = ids[index];
    const current = () => {
      const found = readTarget(target);
      return !!found && found.items.length < limitFor(target) && !found.items.some((item) => item.id === id);
    };
    return queue.enqueue({
      file, scope, slot: id, upload, isCurrent: current,
      apply: (src) => {
        const found = readTarget(target);
        if (!found || !current()) return false;
        const result = found.kind === "post"
          ? updatePost(found.document, target.entityId, { media: insertInSelectionOrder(found.items, { id, src, srcUrl: "", alt: "" }, ids) }, { siteId: target.siteId })
          : updateHighlight(found.document, target.entityId, { frames: insertInSelectionOrder(found.items, { id, src, srcUrl: "", alt: "", text: "" }, ids) }, { siteId: target.siteId });
        if (!result.ok) return false;
        const projected = projectV2ToLegacyDocument(result.document);
        if (!projected.ok) return false;
        useEditorStore.getState().replaceDocument(projected.document, undefined, result.document);
        return !!readTarget(target)?.items.some((item) => item.id === id && item.src === src);
      }
    });
  });
  return { taskIds, omitted: files.length - selected.length };
}
