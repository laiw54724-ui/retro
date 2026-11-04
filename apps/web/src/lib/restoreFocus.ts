/**
 * Returns focus to `resolve()` after an overlay closed, but only if nothing else has claimed it meanwhile.
 *
 * Closing unmounts the overlay, so focus falls back to <body>; the restore is deferred one frame so the DOM is settled.
 * If the user pressed a pointer on something in that gap, or focus already sits on a real element, that choice wins:
 * an unconditional `focus()` here would re-raise the window that owned the opener over the window the user just picked
 * (visitor windows raise on focus).
 */
export function restoreFocusUnlessMoved(resolve: () => HTMLElement | null | undefined): void {
  const doc = globalThis.document;
  let moved = false;
  const mark = () => { moved = true; };
  doc.addEventListener("pointerdown", mark, true);
  doc.addEventListener("touchstart", mark, true);
  requestAnimationFrame(() => {
    doc.removeEventListener("pointerdown", mark, true);
    doc.removeEventListener("touchstart", mark, true);
    const active = doc.activeElement;
    if (moved || (active && active !== doc.body && active !== doc.documentElement)) return;
    const target = resolve();
    if (target?.isConnected) target.focus();
  });
}
