import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { resolveWindowChrome, type WindowChromeSection } from "@retrodesk/shared";
import { useThemeView } from "../../lib/themeView";
import { resolveWindowAppearance, resolveWindowFrame } from "../../lib/windowAppearance";
import { WindowTitleBar } from "./WindowTitleBar";
import type { WindowChromeProps, WindowTitleBarProps } from "./types";
import styles from "./WindowChrome.module.css";

const sections: readonly WindowChromeSection[] = ["menuBar", "toolbar", "statusBar", "footerActions"];
type SlotHosts = Partial<Record<WindowChromeSection, HTMLDivElement>>;
type SlotContextValue = {
  hosts: SlotHosts;
  register: (name: WindowChromeSection, id: string, present: boolean) => void;
};
const SlotContext = createContext<SlotContextValue | null>(null);

/** Put stateful App controls into the surrounding chrome without a registry/store dependency. */
export function WindowChromeSlot({ name, children }: { name: WindowChromeSection; children: ReactNode }) {
  const context = useContext(SlotContext);
  const id = useId();
  const register = context?.register;
  const present = children !== null && children !== undefined && children !== false;
  useLayoutEffect(() => {
    if (!present) return;
    register?.(name, id, true);
    return () => register?.(name, id, false);
  }, [register, name, id, present]);
  if (!present) return null;
  // Standalone module previews retain their controls when there is no surrounding chrome.
  if (!context) return <>{children}</>;
  const host = context.hosts[name];
  return host ? createPortal(children, host) : null;
}

/** Stable frame/content DOM across presets. Layout, focus, and persistence belong to its host. */
export function WindowChrome({ title, theme, appearance, chrome, icon, children, active = true, maximized = false, interactiveControls = false, presentation = "desktop", slots, fallbackSlots, titleBarLeading, titleBarTrailing, titleBarProps, controlLabels, contentProps, frameProps, style, bodyStyle, onMinimize, onMaximize, onClose }: WindowChromeProps) {
  const config = useMemo(() => resolveWindowChrome(chrome), [chrome]);
  const baseView = useThemeView(theme);
  const tv = { ...baseView, ...resolveWindowFrame(theme, appearance) };
  const titleView = resolveWindowAppearance(theme, appearance, active, { preset: config.preset });
  const [hosts, setHosts] = useState<SlotHosts>({});
  const [registrations, setRegistrations] = useState<Record<string, WindowChromeSection>>({});
  const register = useCallback((name: WindowChromeSection, id: string, present: boolean) => {
    setRegistrations((previous) => {
      if (present && previous[id] === name) return previous;
      if (!present && !(id in previous)) return previous;
      const next = { ...previous };
      if (present) next[id] = name;
      else delete next[id];
      return next;
    });
  }, []);
  const refs = useMemo(() => Object.fromEntries(sections.map((name) => [name, (node: HTMLDivElement | null) => {
    setHosts((previous) => {
      if (previous[name] === (node ?? undefined)) return previous;
      const next = { ...previous };
      if (node) next[name] = node;
      else delete next[name];
      return next;
    });
  }])) as Record<WindowChromeSection, (node: HTMLDivElement | null) => void>, []);
  const context = useMemo(() => ({ hosts, register }), [hosts, register]);
  const controls = presentation === "mobile" ? config.controls.filter((action) => action === "close") : config.controls;
  const titleProps: WindowTitleBarProps = {
    title, icon: config.showIcon ? icon : undefined, controls, interactive: interactiveControls, maximized,
    leading: titleBarLeading, trailing: titleBarTrailing, controlLabels,
    titleBarProps: {
      ...titleBarProps,
      className: `${presentation === "mobile" ? "m-win-title " : ""}${titleBarProps?.className ?? ""}`,
      style: { background: titleView.titleBackground, color: titleView.titleColor, ...titleBarProps?.style }
    },
    onMinimize, onMaximize, onClose
  };
  const variables = {
    "--wc-face": tv.face, "--wc-text": tv.text, "--wc-light": tv.light,
    "--wc-shadow": tv.shadow, "--wc-dark": tv.dark, "--wc-accent": tv.accent,
    "--wc-accent-text": tv.accentText, "--wc-raised": tv.bevel, "--wc-sunken": tv.sunken, "--wc-pressed": tv.pressed,
    "--wc-title-background": titleView.titleBackground, "--wc-title-color": titleView.titleColor,
    fontFamily: tv.fontFamily
  } as CSSProperties;
  function outlet(name: WindowChromeSection) {
    const direct = slots?.[name];
    const hasDirect = direct !== null && direct !== undefined && direct !== false;
    const hasPortal = Object.values(registrations).includes(name);
    const content = hasDirect || hasPortal ? direct : fallbackSlots?.[name];
    const present = (content !== null && content !== undefined && content !== false) || hasPortal;
    return <div key={name} ref={refs[name]} className={styles.slot} data-chrome-slot={name} hidden={!present || config.sections?.[name] === false}>{content}</div>;
  }
  return (
    <SlotContext.Provider value={context}>
      <section
        {...frameProps}
        role={frameProps?.role ?? "dialog"}
        aria-label={frameProps?.["aria-label"] ?? title}
        className={`${styles.frame} retro-window${presentation === "mobile" ? " m-window" : ""} ${frameProps?.className ?? ""}`}
        data-chrome-preset={config.preset}
        data-chrome-density={config.density}
        data-active={active}
        data-maximized={maximized}
        data-presentation={presentation}
        style={{ ...variables, ...frameProps?.style, ...style }}
      >
        {slots?.titleBar ? slots.titleBar(titleProps) : <WindowTitleBar {...titleProps} />}
        {outlet("menuBar")}
        {outlet("toolbar")}
        <div
          {...contentProps}
          className={`${styles.content} retro-window-body${presentation === "mobile" ? " m-win-body" : ""} ${contentProps?.className ?? ""}`}
          style={{ ...contentProps?.style, ...bodyStyle }}
        >{children}</div>
        {outlet("statusBar")}
        {outlet("footerActions")}
      </section>
    </SlotContext.Provider>
  );
}
