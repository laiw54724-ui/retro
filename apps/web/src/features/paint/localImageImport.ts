import { MAX_IMPORT_EDGE, MAX_IMPORT_PIXELS } from "./engine";

export const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type ImportFailure = "type" | "file-size" | "dimensions" | "decode" | "source" | "cancelled";

export class PaintImportError extends Error {
  constructor(readonly reason: ImportFailure) { super(reason); }
}

/** Decode a selected local file. ImageBitmap may retain browser decode memory until closed. */
export async function decodeLocalImage(file: File, signal: AbortSignal): Promise<ImageBitmap> {
  if (signal.aborted) throw new PaintImportError("cancelled");
  if (!ALLOWED_TYPES.has(file.type)) throw new PaintImportError("type");
  if (!file.size || file.size > MAX_IMPORT_FILE_BYTES) throw new PaintImportError("file-size");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    if (signal.aborted) throw new PaintImportError("cancelled");
    if (error instanceof DOMException && error.name === "SecurityError") throw new PaintImportError("source");
    throw new PaintImportError("decode");
  }
  if (signal.aborted) { bitmap.close(); throw new PaintImportError("cancelled"); }
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_IMPORT_EDGE || bitmap.height > MAX_IMPORT_EDGE ||
      bitmap.width * bitmap.height > MAX_IMPORT_PIXELS) {
    bitmap.close();
    throw new PaintImportError("dimensions");
  }
  return bitmap;
}

export function importFailure(error: unknown): Exclude<ImportFailure, "cancelled"> {
  if (error instanceof PaintImportError && error.reason !== "cancelled") return error.reason;
  if (error instanceof DOMException && error.name === "SecurityError") return "source";
  return "decode";
}
