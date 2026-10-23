import { useEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import { clampPosition, editingStyle, type EditingAppearance } from "./common";
export function selectionBarPosition(rect: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, bounds: { width: number; height: number }) { return clampPosition({ x: rect.x, y: rect.y - size.height - 8 >= 0 ? rect.y - size.height - 8 : rect.y + rect.height + 8 }, size, bounds); }
export function FloatingSelectionBar({ rect, containerRef, hidden, label, children, tv, mobile, className = "", style, onPointerDown, ...props }: EditingAppearance & Omit<HTMLAttributes<HTMLDivElement>, "hidden"> & { rect: { x: number; y: number; width: number; height: number }; containerRef: RefObject<HTMLElement | null>; hidden?: boolean; label: string }) {
  const bar = useRef<HTMLDivElement>(null), [point, setPoint] = useState({ x: rect.x, y: rect.y });
  useEffect(() => { if (hidden || !bar.current || !containerRef.current) return; const node = bar.current, container = containerRef.current; const measure = () => setPoint(selectionBarPosition(rect, node.getBoundingClientRect(), container.getBoundingClientRect())); measure(); const observer = new ResizeObserver(measure); observer.observe(node); observer.observe(container); return () => observer.disconnect(); }, [rect.x, rect.y, rect.width, rect.height, hidden, containerRef]);
  if (hidden) return null;
  return <div {...props} ref={bar} role="toolbar" aria-label={label} data-mobile={mobile || undefined} className={`editing-selection-bar ${className}`} style={editingStyle(tv, { left: point.x, top: point.y, ...style })} onPointerDown={e => { e.stopPropagation(); onPointerDown?.(e); }}>{children}</div>;
}
