function available(node: HTMLElement): boolean {
  if (!node.isConnected || node.closest("[inert], [hidden], [aria-hidden='true'], [aria-disabled='true']") || node.matches(":disabled")) return false;
  if (!node.getClientRects().length) return false;
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    if (getComputedStyle(ancestor).opacity === "0") return false;
  }
  const style = getComputedStyle(node);
  return style.visibility !== "hidden" && style.visibility !== "collapse";
}

/** Restore only inside the returning surface, after its source app renders. */
export function restoreNavigationFocus(key: string | null, surface?: HTMLElement | null) {
  // Keep the original one-argument API. Capture its active surface before the
  // source is replaced; explicit null must never turn into a global search.
  const scope = surface === undefined
    ? document.activeElement?.closest<HTMLElement>(".visitor-mobile, .visitor-desktop, [aria-modal='true']") ?? document
    : surface;
  if (!scope || (!key && scope === document)) return;
  requestAnimationFrame(() => {
    if (scope instanceof HTMLElement && !available(scope)) return;
    const modal = document.activeElement?.closest("[aria-modal='true']");
    if (modal && (scope === document || !modal.contains(scope))) return;
    if (key) {
      for (const node of scope.querySelectorAll<HTMLElement>("[data-navigation-focus]")) {
        if (node.dataset.navigationFocus !== key || !available(node)) continue;
        node.focus();
        if (document.activeElement === node) {
          // WebKit can focus a button in an inner scroll clip without revealing it.
          node.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
      }
    }
    // A removed/disabled trigger still leaves keyboard users in the source app.
    // The caller makes its surface programmatically focusable, not a Tab stop.
    if (scope instanceof HTMLElement) scope.focus({ preventScroll: true });
  });
}
