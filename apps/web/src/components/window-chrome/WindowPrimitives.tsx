import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import styles from "./WindowChrome.module.css";

export type WindowChromeButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
  isDefault?: boolean;
};

export const WindowChromeButton = forwardRef<HTMLButtonElement, WindowChromeButtonProps>(function WindowChromeButton({ pressed, isDefault, type = "button", className, ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={`${styles.button} ${className ?? ""}`} aria-pressed={pressed ?? props["aria-pressed"]} data-default={isDefault || undefined} data-window-no-drag />;
});

export type WindowToolbarProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  orientation?: "horizontal" | "vertical";
};

const controlSelector = "button, a[href], input:not([type='hidden']), select, textarea, [tabindex], [contenteditable='true']";
const ownsArrowKeys = "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='slider'], [role='spinbutton'], [role='combobox'], [role='listbox'], [role='grid'], [role='tree'], [role='tablist'], [role='menu'], [role='menubar']";

/** A single tab stop for ordinary controls; text fields and compound widgets retain their keys. */
export const WindowToolbar = forwardRef<HTMLDivElement, WindowToolbarProps>(function WindowToolbar({ label, orientation = "horizontal", className, onKeyDown, onFocusCapture, ...props }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLElement | null>(null);
  const originalTabIndex = useRef(new Map<HTMLElement, string | null>());
  useImperativeHandle(ref, () => root.current!, []);

  const synchronize = useCallback((focused?: HTMLElement) => {
    const toolbar = root.current;
    if (!toolbar) return [];
    const candidates = Array.from(toolbar.querySelectorAll<HTMLElement>(controlSelector)).filter((element) => {
      if (element.closest("[role='toolbar']") !== toolbar) return false;
      const composite = element.closest("[role='menu'], [role='menubar'], [role='tablist'], [role='grid'], [role='tree'], [role='listbox']");
      return !composite || !toolbar.contains(composite);
    });
    for (const [element, value] of originalTabIndex.current) {
      if (candidates.includes(element)) continue;
      if (value === null) element.removeAttribute("tabindex");
      else element.setAttribute("tabindex", value);
      originalTabIndex.current.delete(element);
    }
    for (const element of candidates) {
      if (!originalTabIndex.current.has(element)) originalTabIndex.current.set(element, element.getAttribute("tabindex"));
    }
    const controls = candidates.filter((element) => {
      const original = originalTabIndex.current.get(element);
      const visibility = toolbar.ownerDocument.defaultView?.getComputedStyle(element).visibility;
      return !(original !== null && original !== undefined && Number(original) < 0)
        && !element.matches(":disabled, [aria-disabled='true']")
        && !element.closest("[hidden], [inert], [aria-hidden='true']")
        && visibility !== "hidden" && visibility !== "collapse"
        && element.getClientRects().length > 0;
    });
    const selected = focused && controls.includes(focused) ? focused : active.current && controls.includes(active.current) ? active.current : controls[0];
    if (selected) active.current = selected;
    for (const element of candidates) {
      const index = element === selected ? 0 : -1;
      if (element.tabIndex !== index) element.tabIndex = index;
    }
    return controls;
  }, []);

  useLayoutEffect(() => {
    const toolbar = root.current;
    if (!toolbar) return;
    synchronize();
    // State-driven disabled/hidden controls and added controls update the one tab stop.
    const observer = new MutationObserver(() => synchronize());
    observer.observe(toolbar, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "hidden", "aria-hidden", "inert", "type", "style", "class"] });
    // Slot visibility belongs to ancestors. A toolbar mounted inside a hidden
    // outlet must regain its one tab stop when that outlet becomes available.
    for (let ancestor = toolbar.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["hidden", "aria-hidden", "inert", "style", "class"] });
    }
    const resizeObserver = new ResizeObserver(() => synchronize());
    resizeObserver.observe(toolbar);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      for (const [element, value] of originalTabIndex.current) {
        if (value === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", value);
      }
      originalTabIndex.current.clear();
    };
  }, [synchronize]);

  return (
    <div
      {...props}
      ref={root}
      role="toolbar"
      aria-label={props["aria-label"] ?? label}
      aria-orientation={orientation}
      className={`${styles.toolbar} ${className ?? ""}`}
      data-window-no-drag
      onFocusCapture={(event) => {
        onFocusCapture?.(event);
        const element = (event.target as HTMLElement).closest<HTMLElement>(controlSelector);
        if (element) synchronize(element);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
        const target = event.target as HTMLElement;
        if (target.closest("[role='toolbar']") !== event.currentTarget || target.closest(ownsArrowKeys)) return;
        const previous = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
        const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
        if (![previous, next, "Home", "End"].includes(event.key)) return;
        const controls = synchronize();
        if (controls.length === 0) return;
        const index = controls.findIndex((element) => element === target || element.contains(target));
        if (index < 0) return;
        const rtl = orientation === "horizontal" && event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
        const direction = (event.key === next ? 1 : -1) * (rtl ? -1 : 1);
        const destination = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + direction + controls.length) % controls.length;
        event.preventDefault();
        event.stopPropagation();
        synchronize(controls[destination]);
        controls[destination].focus();
      }}
    />
  );
});

export const WindowStatusBar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function WindowStatusBar({ className, ...props }, ref) {
  return <div {...props} ref={ref} className={`${styles.statusBar} ${className ?? ""}`} role="status" aria-live="off" />;
});

export const WindowStatusField = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function WindowStatusField({ className, ...props }, ref) {
  return <div {...props} ref={ref} className={`${styles.statusField} ${className ?? ""}`} />;
});

export const WindowFooterActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function WindowFooterActions({ className, ...props }, ref) {
  return <div {...props} ref={ref} className={`${styles.footer} ${className ?? ""}`} data-window-no-drag />;
});

export type WindowSeparatorProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & { orientation?: "horizontal" | "vertical" };

export const WindowSeparator = forwardRef<HTMLDivElement, WindowSeparatorProps>(function WindowSeparator({ orientation = "horizontal", className, ...props }, ref) {
  return <div {...props} ref={ref} className={`${styles.separator} ${className ?? ""}`} role="separator" aria-orientation={orientation} />;
});

export const WindowSunkenPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function WindowSunkenPanel({ className, ...props }, ref) {
  return <div {...props} ref={ref} className={`${styles.sunken} ${className ?? ""}`} />;
});
