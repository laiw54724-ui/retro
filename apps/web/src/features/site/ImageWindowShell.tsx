import type { DesktopWindow } from "@retrodesk/shared";
import { RetroWindow, type RetroWindowProps } from "../../components/RetroWindow";
import styles from "./ImageWindowShell.module.css";

export const isFramelessImage = (window: DesktopWindow) => window.type === "image" && window.content.frameMode === "none";
export const isDecorativeImage = (window: DesktopWindow) => window.type === "image" && window.content.interactionMode === "decorative";

/** The window managers keep geometry and navigation; this adapter owns image chrome only. */
export function ImageWindowShell({ window, editor = false, children, ...props }: RetroWindowProps & { window: DesktopWindow; editor?: boolean }) {
  if (!isFramelessImage(window)) return <RetroWindow {...props}>{children}</RetroWindow>;
  return <div className={styles.frameless} data-image-shell="none" style={props.style}>
    {props.presentation === "mobile" ? <div className={styles.navigation}>{props.titleBarLeading}{props.titleBarTrailing}</div> : null}
    <div className={styles.content} inert={!editor && isDecorativeImage(window) || undefined} aria-hidden={!editor && isDecorativeImage(window) || undefined}>{children}</div>
  </div>;
}
