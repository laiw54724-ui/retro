import type { ImageCrop } from "@retrodesk/shared";
import { useTranslation } from "react-i18next";
import { useImageLoadGuard } from "../lib/useImageLoadGuard";
import { useAssetSourceState } from "../lib/assetSource";

export const DEFAULT_CROP: ImageCrop = { x: 50, y: 50, zoom: 1 };

/** Renders an image filling its (overflow:hidden) parent, positioned by a non-destructive crop. */
export function AvatarImage({ src, crop = DEFAULT_CROP, alt = "" }: { src: string; crop?: ImageCrop; alt?: string }) {
  const { t: tr } = useTranslation("editor");
  const { source: resolved, status } = useAssetSourceState(src);
  const { ref, failed } = useImageLoadGuard(resolved);
  if (status === "failed" || failed) return <span className="img-fail compact" role="alert">{tr("avatarImage.theAvatarCouldntBeLoaded")}</span>;
  if (!resolved) return null;
  return (
    <img
      ref={ref}
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
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
