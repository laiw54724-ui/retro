import type { ImageCrop } from "@retrodesk/shared";
import { useState } from "react";
import { useAssetSourceState } from "../lib/assetSource";

export const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };

/** Renders an image filling its (overflow:hidden) parent, positioned by a non-destructive crop. */
export function AvatarImage({ src, crop = DEFAULT_CROP, alt = "" }: { src: string; crop?: ImageCrop; alt?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const { source: resolved, status } = useAssetSourceState(src);
  if (status === "failed" || (resolved && failedSource === resolved)) return <span className="img-fail compact" role="alert">頭像無法載入</span>;
  if (!resolved) return null;
  return (
    <img
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedSource(resolved)}
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
