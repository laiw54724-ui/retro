import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import styles from "./AuthoringShell.module.css";

type Props = { canvasRef: RefObject<HTMLDivElement | null>; dockRef?: RefObject<HTMLDivElement | null>; anchorKey: string; children: ReactNode };

/** Follow the selection; dock outside the canvas when a floating bar would cover content. */
export function FloatingWindowActions({ canvasRef, dockRef, anchorKey, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  const restoreButton = useRef<number | null>(null);
  useLayoutEffect(() => {
    const bar = root.current;
    // Child layout effects run before the ancestor's ref is attached on mount.
    const canvas = canvasRef.current ?? bar?.closest<HTMLElement>(".desktop-canvas");
    if (!canvas || !bar) return;
    const target = canvas.querySelector<HTMLElement>(".canvas-window.selected") ?? canvas.querySelector<HTMLElement>(".deskicon[data-selected]");
    let frame = 0;
    const place = () => {
      if (!canvas.isConnected || !bar.isConnected) return;
      const area = canvas.getBoundingClientRect(), anchor = target?.getBoundingClientRect();
      const height = bar.offsetHeight, width = bar.offsetWidth;
      const availableHeight = canvas.clientHeight - 36;
      const above = anchor ? anchor.top - area.top - height - 6 : 8;
      const below = anchor ? anchor.bottom - area.top + 6 : 8;
      const needsDock = above < 4 && below + height > availableHeight - 4;
      if (dockRef?.current && needsDock !== docked) {
        const buttons = Array.from(bar.querySelectorAll("button"));
        const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
        restoreButton.current = active < 0 ? null : active;
        setDocked(needsDock);
        return;
      }
      if (!docked) {
        const clamp = (value: number, max: number) => Math.max(4, Math.min(value, Math.max(4, max)));
        bar.style.left = `${clamp(anchor ? anchor.left - area.left : 8, canvas.clientWidth - width - 4)}px`;
        bar.style.top = `${clamp(above >= 4 ? above : below, availableHeight - height - 4)}px`;
      } else {
        bar.style.removeProperty("left"); bar.style.removeProperty("top");
      }
      bar.style.visibility = "visible";
      if (restoreButton.current !== null) {
        bar.querySelectorAll<HTMLButtonElement>("button")[restoreButton.current]?.focus({ preventScroll: true });
        restoreButton.current = null;
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
    const resize = new ResizeObserver(schedule);
    resize.observe(canvas); resize.observe(bar); if (target) resize.observe(target);
    const movement = new MutationObserver(schedule);
    if (target) movement.observe(target, { attributes: true, attributeFilter: ["style"] });
    place();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); movement.disconnect(); };
  }, [canvasRef, dockRef, anchorKey, docked]);
  const bar = <div ref={root} className={docked ? styles.docked : styles.floating} onPointerDown={event => event.stopPropagation()}>{children}</div>;
  return docked && dockRef?.current ? createPortal(bar, dockRef.current) : bar;
}
