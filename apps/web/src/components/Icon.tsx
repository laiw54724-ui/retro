import { useEffect, useState, type CSSProperties } from "react";
import { fallbackIconKey, iconBackground, iconImageRendering, isImageIcon } from "../lib/icons";
import { resolveLibraryIcon, libraryNameOf } from "../lib/iconLibrary/library";
import { useAssetSource } from "../lib/assetSource";

/** Pixel icon: a built-in key or an uploaded/linked image URL. Decorative by default. */
export function Icon({ name, size = 32, style, className }: { name?: string | null; size?: number; style?: CSSProperties; className?: string }) {
  const [failed, setFailed] = useState(false);
  const library = resolveLibraryIcon(name);
  const image = !!name && (isImageIcon(name) || !!library);
  const resolved = useAssetSource(image ? library?.url ?? name : null);
  useEffect(() => setFailed(false), [name, resolved]);
  const showImage = image && !!resolved && !failed;
  return (
    <span
      aria-hidden="true"
      className={"w98-icon " + (className ?? "")}
      style={{ width: size, height: size, background: showImage ? "none" : iconBackground(image ? fallbackIconKey(library ? libraryNameOf(library.id) : name) : name), imageRendering: iconImageRendering(name), ...style }}
    >
      {showImage && resolved ? <img src={resolved} alt="" draggable={false} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : null}
    </span>
  );
}
