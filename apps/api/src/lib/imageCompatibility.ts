/** Independent transport contract; not a document field, permission, or writer flag. */
export const IMAGE_WINDOW_WRITE_CONTRACT = 1;

/** Raw inspection must precede schema parsing and use the same stored CAS snapshot. */
export function requiresImageWindowContract(document: unknown): boolean {
  if (!document || typeof document !== "object" || Array.isArray(document)) return false;
  const windows = (document as Record<string, unknown>).windows;
  return Array.isArray(windows) && windows.some((window: unknown) => window !== null && typeof window === "object" && !Array.isArray(window) && (window as Record<string, unknown>).type === "image");
}

export function imageWriteBlocked(incoming: unknown, stored: unknown, contract: unknown): boolean {
  return contract !== IMAGE_WINDOW_WRITE_CONTRACT && (requiresImageWindowContract(incoming) || requiresImageWindowContract(stored));
}
export const IMAGE_UPGRADE_MESSAGE = "This editor must be upgraded before saving this document. Your local edits have not been replaced.";

/** Entry restriction only: whether the Image authoring UI may be offered for this site. Write guards above never depend on it. */
export function imageEntryAdvertised(allowlist: string | undefined, siteId: string): boolean {
  if (allowlist === undefined) return true;
  return allowlist.split(",").map((id) => id.trim()).filter(Boolean).includes(siteId);
}
