import type { ImageCrop } from "@retrodesk/shared";

export const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };

/** Renders an image filling its (overflow:hidden) parent, positioned by a non-destructive crop. */
export function AvatarImage({ src, crop = DEFAULT_CROP, alt = "" }: { src: string; crop?: ImageCrop; alt?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: `${crop.x}% ${crop.y}%`,
        transformOrigin: `${crop.x}% ${crop.y}%`,
        transform: crop.zoom === 1 ? undefined : `scale(${crop.zoom})`
      }}
    />
  );
}
