/** Ephemeral work never enters a saved/public document. Queries run at exit time. */
const entries = new Map<symbol, { siteId: string; dirty: () => boolean }>();
export function registerEditorLocalWork(siteId: string, dirty: () => boolean) {
  const id = Symbol(siteId);
  entries.set(id, { siteId, dirty });
  return () => { entries.delete(id); };
}
export function hasUnsavedEditorLocalWork(siteId: string): boolean {
  return [...entries.values()].some((entry) => entry.siteId === siteId && entry.dirty());
}
