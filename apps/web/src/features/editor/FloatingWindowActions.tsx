import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./AuthoringShell.module.css";

/** Keep selected-window controls near their window without changing its saved geometry. */
export function FloatingWindowActions({ anchorKey, children }: { anchorKey: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Child layout effects run before the ancestor's ref is attached on mount.
    const bar = root.current, canvas = bar?.parentElement;
    if (!canvas || !bar) return;
    const target = canvas.querySelector<HTMLElement>(".canvas-window.selected") ?? canvas.querySelector<HTMLElement>(".deskicon[data-selected]");
    let frame = 0;
    const place = () => {
      if (!canvas.isConnected || !bar.isConnected) return;
      const area = canvas.getBoundingClientRect(), anchor = target?.getBoundingClientRect();
      const height = bar.offsetHeight, width = bar.offsetWidth;
      const availableHeight = canvas.clientHeight - 36;
      const clamp = (value: number, max: number) => Math.max(4, Math.min(value, Math.max(4, max)));
      const left = clamp(anchor ? anchor.left - area.left : 8, canvas.clientWidth - width - 4);
      const above = anchor ? anchor.top - area.top - height - 6 : 8;
      const below = anchor ? anchor.bottom - area.top + 6 : 8;
      // A maximized/edge window has no outside space: stay below its title bar.
      const top = above >= 4 ? above : below + height <= availableHeight - 4 ? below : anchor ? anchor.top - area.top + 36 : 8;
      bar.style.left = `${left}px`;
      bar.style.top = `${clamp(top, availableHeight - height - 4)}px`;
      bar.style.visibility = "visible";
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const resize = new ResizeObserver(schedule);
    resize.observe(canvas); resize.observe(bar); if (target) resize.observe(target);
    const movement = new MutationObserver(schedule);
    if (target) movement.observe(target, { attributes: true, attributeFilter: ["style"] });
    place();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); movement.disconnect(); };
  }, [anchorKey]);
  return <div ref={root} className={styles.floating} onPointerDown={event => event.stopPropagation()}>{children}</div>;
}
