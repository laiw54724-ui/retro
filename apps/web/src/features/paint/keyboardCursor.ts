import type { PaintPoint } from "./engine";

/** Keyboard drawing always stays within the logical bitmap, independent of zoom and DPR. */
export function nextKeyboardCursor(current: PaintPoint, key: string, shift: boolean, width: number, height: number): PaintPoint | null {
  if (key === "Home") return { x: 0, y: 0 };
  if (key === "End") return { x: width - 1, y: height - 1 };
  const stride = shift ? 10 : 1;
  const delta: Record<string, PaintPoint> = {
    ArrowLeft: { x: -stride, y: 0 }, ArrowRight: { x: stride, y: 0 },
    ArrowUp: { x: 0, y: -stride }, ArrowDown: { x: 0, y: stride }
  };
  const offset = delta[key];
  if (!offset) return null;
  return {
    x: Math.max(0, Math.min(width - 1, current.x + offset.x)),
    y: Math.max(0, Math.min(height - 1, current.y + offset.y))
  };
}
