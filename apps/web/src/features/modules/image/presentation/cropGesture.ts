import type { ImageCrop } from "@retrodesk/shared";
import type { ImageSize } from "./placement";

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/** Convert an on-image pointer movement back to the canonical 0–100 crop focus. */
export function cropAfterDrag(start: ImageCrop, delta: { x: number; y: number }, stage: ImageSize, image: ImageSize): ImageCrop {
  const xTravel = stage.width - image.width;
  const yTravel = stage.height - image.height;
  return {
    x: Math.abs(xTravel) < 0.5 ? start.x : clamp(start.x + delta.x / xTravel * 100),
    y: Math.abs(yTravel) < 0.5 ? start.y : clamp(start.y + delta.y / yTravel * 100),
    zoom: start.zoom
  };
}
