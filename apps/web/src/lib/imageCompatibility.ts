import { compatibleAppearanceLoad, type AppearanceApiLoad } from "./appearanceCompatibility";

/** Reader preservation only. This does not enable image creation or author controls. */
export const CLIENT_IMAGE_WINDOW_CONTRACT = 1;
export function containsImageWindow(document: unknown): boolean {
  if (!document || typeof document !== "object" || Array.isArray(document)) return false;
  const windows = (document as Record<string, unknown>).windows;
  return Array.isArray(windows) && windows.some((window: unknown) => window !== null && typeof window === "object" && !Array.isArray(window) && (window as Record<string, unknown>).type === "image");
}
export function supportsImageWindowContract(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).imageWindow === CLIENT_IMAGE_WINDOW_CONTRACT;
}
export function compatibleImageLoad(siteId: string, apiOrigin: string, load: AppearanceApiLoad | null): boolean {
  return !!load && load.siteId === siteId && load.apiOrigin === apiOrigin && supportsImageWindowContract(load.writeCompatibility);
}
/** Preserve appearance recovery semantics; additionally require image support when either draft needs it. */
export function compatibleDocumentRecovery(siteId: string, apiOrigin: string, load: AppearanceApiLoad | null, localDocument: unknown, storedDocument: unknown): boolean {
  return compatibleAppearanceLoad(siteId, apiOrigin, load)
    && (!(containsImageWindow(localDocument) || containsImageWindow(storedDocument)) || compatibleImageLoad(siteId, apiOrigin, load));
}
