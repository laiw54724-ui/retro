import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import type { RetroTheme } from "@retrodesk/shared";

type Props = {
  title: string;
  theme: RetroTheme;
  children: ReactNode;
  style?: CSSProperties;
  active?: boolean;
  interactiveControls?: boolean;
  maximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
};

export function RetroWindow({
  title,
  theme,
  children,
  style,
  active = true,
  interactiveControls = false,
  maximized = false,
  onMinimize,
  onMaximize,
  onClose
}: Props) {
  const stopPointer = (event: PointerEvent<HTMLButtonElement>) => event.stopPropagation();
  const click = (handler?: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    handler?.();
  };

  return (
    <section className="retro-window" style={{ background: theme.face, color: theme.text, ...style }} role="dialog" aria-label={title}>
      <div
        className="retro-titlebar"
        style={{
          background: active
            ? `linear-gradient(90deg, ${theme.titleFrom}, ${theme.titleTo})`
            : `linear-gradient(90deg, ${theme.shadow}, ${theme.light})`,
          color: active ? "#fff" : theme.text
        }}
      >
        <strong>{title}</strong>
        {interactiveControls ? (
          <span className="titlebar-controls">
            <button type="button" aria-label="最小化" onPointerDown={stopPointer} onClick={click(onMinimize)}>—</button>
            <button type="button" aria-label={maximized ? "還原" : "最大化"} onPointerDown={stopPointer} onClick={click(onMaximize)}>{maximized ? "❐" : "□"}</button>
            <button type="button" aria-label="關閉" onPointerDown={stopPointer} onClick={click(onClose)}>×</button>
          </span>
        ) : (
          <span className="titlebar-controls" aria-hidden="true"><i /><i /><i /></span>
        )}
      </div>
      <div className="retro-window-body">{children}</div>
    </section>
  );
}
