/** A local-only escape hatch when clipboard access is unavailable. */
export function downloadLocalDocument(siteId: string, document: unknown) {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = `retro-${siteId}-local-recovery.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
