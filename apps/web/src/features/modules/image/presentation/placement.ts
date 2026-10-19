import type { ImageCrop } from "@retrodesk/shared";

export type ImageFit = "contain" | "cover" | "original";
export type ImageSize = { width: number; height: number };
export type ImagePlacement = { left: number; top: number; width: number; height: number };

export const DEFAULT_IMAGE_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };
// Bounds CSS layout work for malformed or exceptionally large decoded images.
export const MAX_DISPLAY_EDGE = 32_768;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Pixel-space placement. Fit and crop never change the source image or asset reference. */
export function imagePlacement(
  natural: ImageSize,
  viewport: ImageSize,
  fit: ImageFit,
  crop: ImageCrop = DEFAULT_IMAGE_CROP
): ImagePlacement | null {
  const values = [natural.width, natural.height, viewport.width, viewport.height];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const base = fit === "original" ? 1 : fit === "cover"
    ? Math.max(viewport.width / natural.width, viewport.height / natural.height)
    : Math.min(viewport.width / natural.width, viewport.height / natural.height);
  const zoom = Number.isFinite(crop.zoom) ? clamp(crop.zoom, 1, 4) : 1;
  const bounded = Math.min(base * zoom, MAX_DISPLAY_EDGE / Math.max(natural.width, natural.height));
  const width = natural.width * bounded;
  const height = natural.height * bounded;
  const x = Number.isFinite(crop.x) ? clamp(crop.x, 0, 100) / 100 : 0.5;
  const y = Number.isFinite(crop.y) ? clamp(crop.y, 0, 100) / 100 : 0.5;
  return { width, height, left: ((viewport.width - width) * x) || 0, top: ((viewport.height - height) * y) || 0 };
}
