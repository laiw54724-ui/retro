/**
 * A tour step only points at something that is really there. Before showing a step the tour asks for its target and
 * gets back why it can't be used (not in this screen, hidden, disabled) instead of drawing an arrow at nothing.
 */
export type TargetStatus = "ok" | "missing" | "hidden" | "disabled";
export type TargetResult = { status: TargetStatus; element: HTMLElement | null };

export function resolveTarget(selector: string, root: ParentNode = globalThis.document): TargetResult {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element || !element.isConnected) return { status: "missing", element: null };
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return { status: "disabled", element };
  const style = globalThis.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  if (style.display === "none" || style.visibility === "hidden" || element.closest("[hidden]") || rect.width === 0 || rect.height === 0) return { status: "hidden", element };
  return { status: "ok", element };
}

export type Box = { left: number; top: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

/**
 * Chooses where the explanation card goes so it never covers the highlighted target and stays inside the viewport:
 * below the target, above it, then docked to the bottom or top edge of the screen (the phone case). `obstacles` are
 * other controls that should stay usable (top bar, phone toolbar); a position that would cover one is rejected too.
 */
export function placeCard(target: Box, card: { width: number; height: number }, viewport: { width: number; height: number }, margin = 8, gap = 12, obstacles: Box[] = []): Box & { placement: "below" | "above" | "dock-bottom" | "dock-top" } {
  const width = Math.min(card.width, viewport.width - margin * 2);
  const clampLeft = (left: number) => Math.min(Math.max(margin, left), viewport.width - width - margin);
  const left = clampLeft(target.left + target.width / 2 - width / 2);
  type Placed = Box & { placement: "below" | "above" | "dock-bottom" | "dock-top" };
  const topRegion = obstacles.filter((obstacle) => obstacle.top < viewport.height / 2);
  const bottomRegion = obstacles.filter((obstacle) => obstacle.top >= viewport.height / 2);
  const underTopBar = topRegion.reduce((max, obstacle) => Math.max(max, obstacle.top + obstacle.height), 0);
  const aboveBottomBar = bottomRegion.reduce((min, obstacle) => Math.min(min, obstacle.top), viewport.height);
  const candidates: Placed[] = [
    { placement: "below", left, top: target.top + target.height + gap, width, height: card.height },
    { placement: "above", left, top: target.top - gap - card.height, width, height: card.height },
    // clear of every top bar row / of the phone toolbar, whatever the target is
    { placement: "dock-top", left: margin, top: Math.max(margin, underTopBar + gap), width: viewport.width - margin * 2, height: card.height },
    { placement: "dock-bottom", left: margin, top: aboveBottomBar - gap - card.height, width: viewport.width - margin * 2, height: card.height },
    { placement: "dock-bottom", left: margin, top: viewport.height - card.height - margin, width: viewport.width - margin * 2, height: card.height }
  ];
  for (const candidate of candidates) {
    const inside = candidate.top >= margin && candidate.top + candidate.height <= viewport.height - margin;
    if (inside && !overlaps(candidate, target) && !obstacles.some((obstacle) => overlaps(candidate, obstacle))) return candidate;
  }
  // Nothing fits cleanly (target fills the screen): dock where the target is not.
  const preferTop = target.top > viewport.height / 2;
  return preferTop ? { placement: "dock-top", left: margin, top: margin, width: viewport.width - margin * 2, height: card.height } : { placement: "dock-bottom", left: margin, top: viewport.height - card.height - margin, width: viewport.width - margin * 2, height: card.height };
}
