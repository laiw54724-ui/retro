import { useEffect, useState, type CSSProperties } from "react";
import { iconBackground, isImageIcon } from "../lib/icons";
import { useAssetSource } from "../lib/assetSource";

/** Pixel icon: a built-in key or an uploaded/linked image URL. Decorative by default. */
export function Icon({ name, size = 32, style, className }: { name?: string | null; size?: number; style?: CSSProperties; className?: string }) {
  const [failed, setFailed] = useState(false);
  const image = !!name && isImageIcon(name);
  const resolved = useAssetSource(image ? name : null);
  useEffect(() => setFailed(false), [name, resolved]);
  return (
    <span
      aria-hidden="true"
      className={"w98-icon " + (className ?? "")}
      style={{ width: size, height: size, background: image && !failed ? "none" : iconBackground(image ? null : name), ...style }}
    >
      {image && resolved && !failed ? <img src={resolved} alt="" draggable={false} onError={() => setFailed(true)} /> : null}
    </span>
  );
}
