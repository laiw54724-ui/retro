/**
 * Makes the page behind a full-screen overlay unreachable: the app root becomes `inert`
 * (no focus, clicks or screen-reader access) and page scrolling is locked.
 * Calls nest, so two overlays open at once release in any order.
 */
let depth = 0;
let saved: { html: string; body: string } | null = null;

export function lockBackground(): () => void {
  const doc = globalThis.document;
  const app = doc.getElementById("root");
  if (depth === 0) {
    saved = { html: doc.documentElement.style.overflow, body: doc.body.style.overflow };
    doc.documentElement.style.overflow = "hidden";
    doc.body.style.overflow = "hidden";
    app?.setAttribute("inert", "");
  }
  depth += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth -= 1;
    if (depth > 0) return;
    if (saved) {
      doc.documentElement.style.overflow = saved.html;
      doc.body.style.overflow = saved.body;
      saved = null;
    }
    app?.removeAttribute("inert");
  };
}
