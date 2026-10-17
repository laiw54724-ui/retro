import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type KeyboardEvent } from "react";
import styles from "./WindowChrome.module.css";

export type WindowMenuItem = {
  id: string;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** A display hint; the caller owns any application shortcut binding. */
  shortcut?: string;
  checked?: boolean;
  separator?: false;
} | { id: string; separator: true };

export type WindowMenu = {
  id: string;
  label: string;
  disabled?: boolean;
  items: readonly WindowMenuItem[];
};

export type WindowMenuBarProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  menus: readonly WindowMenu[];
  label?: string;
};

type Command = Exclude<WindowMenuItem, { separator: true }>;
type PopupPosition = Pick<CSSProperties, "left" | "top" | "bottom" | "minWidth" | "maxWidth" | "maxHeight">;
const isCommand = (item: WindowMenuItem): item is Command => item.separator !== true;
const canOpen = (menu: WindowMenu) => !menu.disabled && menu.items.some(isCommand);
const itemKey = (menuId: string, itemId: string) => JSON.stringify([menuId, itemId]);

/** A one-level application menubar. All commands remain ordinary, caller-owned callbacks. */
export function WindowMenuBar({ menus, label = "視窗選單", className, onKeyDown, onBlur, ...props }: WindowMenuBarProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const items = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ menuId: string; itemId: string } | null>(null);
  const search = useRef({ scope: "", text: "", at: 0 });
  const [activeId, setActiveId] = useState<string | undefined>(menus[0]?.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [position, setPosition] = useState<PopupPosition>({ left: 0, top: "100%" });
  const tabId = menus.some((menu) => menu.id === activeId) ? activeId : menus[0]?.id;

  function dismiss(restoreFocus = false) {
    if (restoreFocus) triggers.current.get(openId ?? tabId ?? "")?.focus();
    pendingFocus.current = null;
    search.current = { scope: "", text: "", at: 0 };
    setOpenId(null);
  }

  function focusItem(menuId: string, itemId: string) {
    const element = items.current.get(itemKey(menuId, itemId));
    element?.focus({ preventScroll: true });
    const container = element?.parentElement;
    if (!element || !container) return;
    // Scroll only the popup; scrollIntoView could also move the clipped window frame.
    if (element.offsetTop < container.scrollTop) container.scrollTop = element.offsetTop;
    else if (element.offsetTop + element.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = element.offsetTop + element.offsetHeight - container.clientHeight;
    }
  }

  function openMenu(menu: WindowMenu, edge: "first" | "last" = "first") {
    setActiveId(menu.id);
    if (!canOpen(menu)) {
      dismiss();
      triggers.current.get(menu.id)?.focus();
      return;
    }
    const commands = menu.items.filter(isCommand);
    const command = edge === "last" ? commands[commands.length - 1] : commands[0];
    if (openId === menu.id) focusItem(menu.id, command.id);
    else {
      pendingFocus.current = { menuId: menu.id, itemId: command.id };
      setOpenId(menu.id);
    }
  }

  function focusTrigger(index: number, keepOpen: boolean) {
    if (menus.length === 0) return;
    const menu = menus[(index + menus.length) % menus.length];
    setActiveId(menu.id);
    triggers.current.get(menu.id)?.focus();
    if (keepOpen) openMenu(menu);
    else setOpenId(null);
  }

  function activate(menu: WindowMenu, command: Command) {
    if (menu.disabled || command.disabled || !command.onSelect) return;
    // Return first, so a command that opens a dialog can then establish its own focus.
    dismiss(true);
    command.onSelect();
  }

  function findByTypeahead(key: string, scope: string, labels: readonly string[], current: number) {
    const now = Date.now();
    const previous = search.current;
    let text = previous.scope === scope && now - previous.at < 700 ? previous.text + key : key;
    const repeated = [...text].every((character) => character === text[0]);
    let prefix = repeated ? key : text;
    const find = (value: string, includeCurrent: boolean) => {
      for (let offset = includeCurrent ? 0 : 1; offset <= labels.length; offset++) {
        const index = (Math.max(0, current) + offset) % labels.length;
        if (labels[index]?.trim().toLocaleLowerCase().startsWith(value.toLocaleLowerCase())) return index;
      }
      return -1;
    };
    let match = find(prefix, prefix.length > 1);
    if (match < 0 && text.length > 1) {
      text = key;
      prefix = key;
      match = find(prefix, false);
    }
    search.current = { scope, text, at: now };
    return match;
  }

  // Popup focus and dimensions are resolved before paint, including inside a narrow frame.
  useLayoutEffect(() => {
    if (!openId) return;
    const menu = menus.find((entry) => entry.id === openId);
    if (!menu || !canOpen(menu)) {
      setOpenId(null);
      return;
    }
    const pending = pendingFocus.current;
    if (pending?.menuId === openId) {
      pendingFocus.current = null;
      focusItem(pending.menuId, pending.itemId);
    }
  }, [menus, openId]);

  useLayoutEffect(() => {
    if (!openId || !root.current) return;
    const bar = root.current;
    const document = bar.ownerDocument;
    const view = document.defaultView;
    const frame = bar.closest<HTMLElement>(".retro-window");
    const updatePosition = () => {
      const element = popup.current;
      const anchor = triggers.current.get(openId)?.parentElement;
      if (!element || !anchor || !view) return;
      const bounds = frame?.getBoundingClientRect();
      const origin = anchor.getBoundingClientRect();
      // Client rects include CSS zoom/transforms; offsets and scrollWidth are local CSS pixels.
      const ratioX = anchor.offsetWidth > 0 ? origin.width / anchor.offsetWidth : 1;
      const ratioY = anchor.offsetHeight > 0 ? origin.height / anchor.offsetHeight : 1;
      const scaleX = Number.isFinite(ratioX) && ratioX > 0 ? ratioX : 1;
      const scaleY = Number.isFinite(ratioY) && ratioY > 0 ? ratioY : 1;
      const left = Math.max(4, bounds ? bounds.left + 3 * scaleX : 4);
      const right = Math.min(view.innerWidth - 4, bounds ? bounds.right - 3 * scaleX : view.innerWidth - 4);
      const top = Math.max(4, bounds ? bounds.top + 3 * scaleY : 4);
      const bottom = Math.min(view.innerHeight - 4, bounds ? bounds.bottom - 3 * scaleY : view.innerHeight - 4);
      const maxWidth = Math.max(1, Math.min(280, (right - left) / scaleX));
      const renderedWidth = Math.min(Math.max(element.scrollWidth, 150), maxWidth) * scaleX;
      const below = bottom - origin.bottom;
      const above = origin.top - top;
      const openAbove = below < 96 * scaleY && above > below;
      const next: PopupPosition = {
        left: (Math.max(left, Math.min(origin.left, right - renderedWidth)) - origin.left) / scaleX,
        top: openAbove ? "auto" : "100%",
        bottom: openAbove ? "100%" : "auto",
        minWidth: Math.min(150, maxWidth),
        maxWidth,
        maxHeight: Math.max(1, Math.min(view.innerHeight * 0.45, openAbove ? above : below) / scaleY)
      };
      setPosition((previous) => Object.keys(next).every((key) => previous[key as keyof PopupPosition] === next[key as keyof PopupPosition]) ? previous : next);
    };
    const outside = (event: Event) => {
      if (event.composedPath().includes(bar)) return;
      pendingFocus.current = null;
      search.current = { scope: "", text: "", at: 0 };
      setOpenId(null);
    };
    const windowBlur = () => {
      pendingFocus.current = null;
      search.current = { scope: "", text: "", at: 0 };
      setOpenId(null);
    };
    updatePosition();
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    document.addEventListener("scroll", updatePosition, true);
    view?.addEventListener("resize", updatePosition);
    view?.addEventListener("blur", windowBlur);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    observer?.observe(frame ?? bar);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      document.removeEventListener("scroll", updatePosition, true);
      view?.removeEventListener("resize", updatePosition);
      view?.removeEventListener("blur", windowBlur);
      observer?.disconnect();
    };
  }, [openId]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-window-menu-trigger], button[data-window-menu-item]");
    if (!target || !root.current?.contains(target)) return;
    const menuId = target.dataset.windowMenuTrigger ?? target.dataset.windowMenu;
    const menuIndex = menus.findIndex((menu) => menu.id === menuId);
    const menu = menus[menuIndex];
    if (!menu) return;
    const inPopup = target.hasAttribute("data-window-menu-item");
    const commands = menu.items.filter(isCommand);
    const commandIndex = commands.findIndex((command) => command.id === target.dataset.windowMenuItem);
    const consume = () => { event.preventDefault(); event.stopPropagation(); };
    const focusCommand = (index: number) => {
      if (commands.length) focusItem(menu.id, commands[(index + commands.length) % commands.length].id);
    };

    if (event.key === "Tab") {
      // Return to the menubar's sole tab stop before the browser performs normal Tab navigation.
      // In particular, Shift+Tab must leave the composite rather than revisit its own trigger.
      if (inPopup) triggers.current.get(menu.id)?.focus();
      dismiss();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") {
      if (openId) { consume(); dismiss(true); }
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      consume();
      search.current.text = "";
      const rtl = event.currentTarget.ownerDocument.defaultView?.getComputedStyle(event.currentTarget).direction === "rtl";
      const direction = (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1);
      focusTrigger(menuIndex + direction, inPopup || openId !== null);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      consume();
      search.current.text = "";
      if (inPopup) focusCommand(commandIndex + (event.key === "ArrowDown" ? 1 : -1));
      else openMenu(menu, event.key === "ArrowUp" ? "last" : "first");
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      consume();
      search.current.text = "";
      if (inPopup) focusCommand(event.key === "Home" ? 0 : commands.length - 1);
      else focusTrigger(event.key === "Home" ? 0 : menus.length - 1, openId !== null);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      consume();
      if (event.repeat) return;
      if (inPopup && commands[commandIndex]) activate(menu, commands[commandIndex]);
      else if (!inPopup) openMenu(menu);
      return;
    }
    if (event.key.length === 1) {
      const labels = inPopup ? commands.map((command) => command.label) : menus.map((entry) => entry.label);
      const match = findByTypeahead(event.key, inPopup ? menu.id : "menubar", labels, inPopup ? commandIndex : menuIndex);
      consume();
      if (match >= 0) {
        if (inPopup) focusCommand(match);
        else focusTrigger(match, openId !== null);
      }
    }
  }

  return (
    <div
      {...props}
      ref={root}
      role="menubar"
      aria-label={props["aria-label"] ?? label}
      aria-orientation="horizontal"
      className={`${styles.menuBar} ${className ?? ""}`}
      data-window-no-drag
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        onBlur?.(event);
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) dismiss();
      }}
    >
      {menus.map((menu, menuIndex) => {
        const expanded = openId === menu.id;
        const triggerId = `${id}-trigger-${menuIndex}`;
        const menuId = `${id}-menu-${menuIndex}`;
        return (
          <div key={menu.id} className={styles.menuAnchor} role="none">
            <button
              ref={(element) => { if (element) triggers.current.set(menu.id, element); else triggers.current.delete(menu.id); }}
              id={triggerId}
              type="button"
              role="menuitem"
              className={styles.menuTrigger}
              data-window-menu-trigger={menu.id}
              aria-haspopup="menu"
              aria-expanded={expanded}
              aria-controls={expanded ? menuId : undefined}
              aria-disabled={!canOpen(menu) || undefined}
              tabIndex={tabId === menu.id ? 0 : -1}
              onFocus={() => setActiveId(menu.id)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && openId && openId !== menu.id) focusTrigger(menuIndex, true);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (!canOpen(menu)) { dismiss(); return; }
                if (expanded) dismiss(true);
                else openMenu(menu);
              }}
            >{menu.label}</button>
            {expanded ? (
              <div ref={popup} id={menuId} role="menu" aria-labelledby={triggerId} aria-orientation="vertical" className={styles.menu} style={position}>
                {menu.items.map((item) => item.separator ? (
                  <div key={item.id} role="separator" aria-orientation="horizontal" className={styles.separator} />
                ) : (
                  <button
                    key={item.id}
                    ref={(element) => { const key = itemKey(menu.id, item.id); if (element) items.current.set(key, element); else items.current.delete(key); }}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                    aria-checked={item.checked}
                    aria-disabled={item.disabled || !item.onSelect || undefined}
                    className={styles.menuItem}
                    data-window-menu={menu.id}
                    data-window-menu-item={item.id}
                    tabIndex={-1}
                    onPointerMove={(event) => {
                      if (event.pointerType === "mouse" && event.currentTarget.ownerDocument.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
                    }}
                    onClick={(event) => { event.stopPropagation(); activate(menu, item); }}
                  >
                    <span><span aria-hidden="true" style={{ display: "inline-block", width: "1.3em" }}>{item.checked ? "✓" : ""}</span>{item.label}</span>
                    {item.shortcut ? <span aria-hidden="true">{item.shortcut}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
