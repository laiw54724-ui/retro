import type { CSSProperties } from "react";
import { iconBackground } from "../lib/icons";

/** Pixel icon: a built-in key or an uploaded/linked image URL. Decorative by default. */
export function Icon({ name, size = 32, style, className }: { name?: string | null; size?: number; style?: CSSProperties; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={"w98-icon " + (className ?? "")}
      style={{ width: size, height: size, background: iconBackground(name), ...style }}
    />
  );
}
