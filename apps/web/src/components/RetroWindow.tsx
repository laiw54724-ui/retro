import type { CSSProperties, HTMLAttributes, MouseEvent, PointerEvent, ReactNode } from "react";
import type { DesktopWindow, RetroTheme } from "@retrodesk/shared";
import { readableOn, themeView } from "../lib/themeView";
import { Icon } from "./Icon";

type Props = {
  title: string;
  theme: RetroTheme;
  appearance?: DesktopWindow["appearance"];
  children: ReactNode;
  icon?: string;
  style?: CSSProperties;
  active?: boolean;
  interactiveControls?: boolean;
  maximized?: boolean;
  /** Spread on the title bar, e.g. drag handlers. */
  titleBarProps?: HTMLAttributes<HTMLDivElement>;
  bodyStyle?: CSSProperties;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
};

export function RetroWindow({
  title,
  theme,
  appearance,
  children,
  icon,
  style,
  active = true,
  interactiveControls = false,
  maximized = false,
  titleBarProps,
  bodyStyle,
  onMinimize,
  onMaximize,
  onClose
}: Props) {
  const tv = themeView(theme);
  const stopPointer = (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation();
  const click = (handler?: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handler?.();
  };
  const btn: CSSProperties = { background: tv.face, color: tv.text, boxShadow: tv.bevel };
  const activeTitle = appearance
    ? appearance.titleGradient
      ? `linear-gradient(90deg, ${appearance.titleFrom}, ${appearance.titleTo})`
      : appearance.titleFrom
    : tv.titleBg;
  const activeTitleText = appearance ? readableOn(appearance.titleFrom) : "#fff";

  return (
    <section
      className="retro-window"
      role="dialog"
      aria-label={title}
      style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel, padding: 3, display: "flex", flexDirection: "column", overflow: "hidden", ...style }}
    >
      <div
        {...titleBarProps}
        className={"retro-titlebar " + (titleBarProps?.className ?? "")}
        style={{
          background: active ? activeTitle : tv.inactiveTitle,
          color: active ? activeTitleText : tv.text,
          ...titleBarProps?.style
        }}
      >
        {icon ? <Icon name={icon} size={16} /> : null}
        <strong className="retro-title-text">{title}</strong>
        {interactiveControls ? (
          <span className="titlebar-controls">
            <button type="button" className="tb-min" style={btn} aria-label="最小化" onPointerDown={stopPointer} onClick={click(onMinimize)}><i /></button>
            <button type="button" className={"tb-max " + (maximized ? "restored" : "")} style={btn} aria-label={maximized ? "還原" : "最大化"} onPointerDown={stopPointer} onClick={click(onMaximize)}><i /></button>
            <button type="button" className="tb-close" style={btn} aria-label="關閉" onPointerDown={stopPointer} onClick={click(onClose)}>×</button>
          </span>
        ) : (
          <span className="titlebar-controls" aria-hidden="true">
            <b style={btn} /><b style={btn} /><b style={btn} />
          </span>
        )}
      </div>
      <div className="retro-window-body" style={{ boxShadow: tv.sunken, ...bodyStyle }}>{children}</div>
    </section>
  );
}
