import { normalizeImageUrl } from "@retrodesk/shared";
import { insertInSelectionOrder } from "../../media/uploadTasks";

/** Keep the shared URL policy (including Drive normalization) for every line. */
export function parseGalleryUrls(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const valid: Array<{ src: string; srcUrl: string }> = [];
  let rejected = 0;
  for (const srcUrl of lines) {
    const result = normalizeImageUrl(srcUrl);
    if (result.ok) valid.push({ src: result.url, srcUrl });
    else rejected++;
  }
  return { valid, rejected };
}

export function reorderGallery<T extends { id: string }>(list: T[], id: string, targetId: string | null, after = false): T[] {
  if (id === targetId || !list.some((item) => item.id === id)) return list;
  if (targetId && !list.some((item) => item.id === targetId)) return list;
  const item = list.find((entry) => entry.id === id)!;
  const next = list.filter((entry) => entry.id !== id);
  const index = targetId ? next.findIndex((entry) => entry.id === targetId) + Number(after) : next.length;
  next.splice(index, 0, item);
  return next;
}

/** A failed member can retry in selection order, even after its drop anchor disappears. */
export function insertGalleryUpload<T extends { id: string }>(list: T[], item: T, selectionIds: string[], beforeId?: string) {
  if (list.some((entry) => selectionIds.includes(entry.id))) return insertInSelectionOrder(list, item, selectionIds);
  const index = beforeId ? list.findIndex((entry) => entry.id === beforeId) : -1;
  if (index < 0) return [...list, item];
  const next = [...list];
  next.splice(index, 0, item);
  return next;
}

export function validGalleryFile(file: Pick<File, "type" | "size">) {
  return file.type.startsWith("image/") && file.size <= 8 * 1024 * 1024;
}
