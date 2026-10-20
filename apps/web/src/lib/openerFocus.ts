/**
 * Which control opened a dialog, so focus can go back to it when the dialog closes.
 *
 * `document.activeElement` is not enough: Safari (and macOS Firefox) do not give a button focus when it is clicked with
 * a mouse or finger, so at the moment a dialog opens the active element is `<body>` and "return focus to the opener"
 * would have nothing to return to. We therefore remember the last control a pointer or click landed on and fall back to
 * it. Keyboard activation keeps working through the normal active element.
 */
const INTERACTIVE = "button, a[href], summary, input, select, textarea, [role='button'], [role='menuitem'], [tabindex]";
/** A pointer landing on a control only counts as "the opener" for a moment: dialogs open right after the click. */
const FRESH_MS = 1500;
let lastActivated: HTMLElement | null = null;
let lastActivatedAt = 0;

if (typeof document !== "undefined") {
  const remember = (event: Event) => {
    const element = (event.target as Element | null)?.closest?.(INTERACTIVE) as HTMLElement | null;
    // A tabindex=-1 container (the phone screen) is a focus fallback, not a control someone activated.
    if (element && element.getAttribute("tabindex") !== "-1") { lastActivated = element; lastActivatedAt = Date.now(); }
  };
  document.addEventListener("pointerdown", remember, true);
  document.addEventListener("click", remember, true);
}

/** The element to restore focus to when a dialog opened right now closes (null when there is no sensible one). */
export function currentOpener(): HTMLElement | null {
  const doc = globalThis.document;
  const active = doc.activeElement as HTMLElement | null;
  // A click that lands on a button WebKit refuses to focus focuses the nearest programmatic container instead (e.g. the
  // phone screen, tabindex=-1): that is not the control that opened the dialog, so it counts as "no focus" too.
  const container = !!active && active.getAttribute("tabindex") === "-1" && !active.matches("input, textarea, select, button, a[href], [contenteditable]");
  if (active && active !== doc.body && active !== doc.documentElement && !container) return active;
  const fresh = Date.now() - lastActivatedAt < FRESH_MS;
  return fresh && lastActivated?.isConnected && !lastActivated.closest("[inert]") && !lastActivated.hasAttribute("disabled") ? lastActivated : null;
}
