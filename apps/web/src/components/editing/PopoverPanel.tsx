import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import { editingStyle, useEditingText, type EditingAppearance } from "./common";
export type PopoverPanelProps = EditingAppearance & HTMLAttributes<HTMLDivElement> & { open: boolean; onClose: () => void; triggerRef: RefObject<HTMLElement | null>; scopeRef?: RefObject<HTMLElement | null>; label: string; floating?: boolean; doneLabel?: string; showDone?: boolean; keepMounted?: boolean; shouldCloseOnOutside?: (target: Element) => boolean };
export function PopoverPanel({ open, onClose, triggerRef, scopeRef, label, floating, doneLabel, showDone = true, keepMounted, shouldCloseOnOutside, children, tv, mobile, className = "", style, onKeyDown, ...props }: PopoverPanelProps) {
  const panel = useRef<HTMLDivElement>(null), text = useEditingText();
  const close = (restore: boolean) => {
    onClose();
    // Let the panel unmount before restoring focus: focusing immediately blurs a
    // draft input and can commit it even when Escape meant to cancel the panel.
    if (restore) requestAnimationFrame(() => {
      const active = document.activeElement;
      // WebKit can leave focus on a programmatic-only host after removing the
      // clicked button. That host is not a deliberate destination for focus.
      const unclaimed = active === document.body || !active?.isConnected ||
        !!(active?.getAttribute("tabindex") === "-1" && !active.matches("input, textarea, select, button, a[href], [contenteditable]"));
      if (triggerRef.current?.isConnected && (unclaimed || active === triggerRef.current || !!(active && panel.current?.contains(active)))) triggerRef.current.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (panel.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target.closest('[aria-modal="true"],[data-editing-owned-portal]') || shouldCloseOnOutside?.(target) === false) return;
      // A new intentional control gets focus normally; blank clicks return to the trigger.
      const restore = !!(scopeRef?.current ?? panel.current?.parentElement)?.contains(target) && !target.closest("button,input,textarea,select,a,[tabindex]");
      if (restore) e.preventDefault();
      close(restore);
    };
    const escape = (e: KeyboardEvent) => {
      const nested = (e.target as Element).closest?.('[data-editing-popover],[role="dialog"],[role="menu"]');
      if (nested && nested !== panel.current && panel.current?.contains(nested)) return;
      if (e.defaultPrevented) return;
      if (e.key === "Escape" && !e.isComposing && (panel.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node))) { e.preventDefault(); e.stopPropagation(); close(true); } };
    document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape); };
  });
  if (!open && !keepMounted) return null;
  return <div {...props} ref={panel} data-editing-popover="true" hidden={!open} role={floating ? "dialog" : "group"} aria-label={label} className={`editing-popover ${className}`} data-floating={floating || undefined} data-mobile={mobile || undefined} style={editingStyle(tv, { ...style, ...(!open ? { display: "none" } : {}) })} onKeyDown={event => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.key !== "Escape") return;
    const nested = (event.target as Element).closest('[data-editing-popover],[role="dialog"],[role="menu"]');
    if (nested && nested !== panel.current && panel.current?.contains(nested)) return;
    event.preventDefault(); event.stopPropagation(); close(true);
  }}><strong className="editing-popover-title">{label}</strong>{children}{showDone ? <button className="editing-popover-done" type="button" onMouseDown={e => e.preventDefault()} onClick={() => close(true)}>{doneLabel ?? text("done")}</button> : null}</div>;
}
