import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import type { DesktopWindow, RetroTheme, WindowChromeInput, WindowChromeSection, WindowControlAction } from "@retrodesk/shared";

/** Runtime-only slots. Never serialize React nodes or handlers in a SiteDocument. */
export type WindowChromeSlots = {
  /** Replace the titlebar by rendering WindowTitleBar with the supplied drag/ARIA props. */
  titleBar?: (props: WindowTitleBarProps) => ReactNode;
  menuBar?: ReactNode;
  toolbar?: ReactNode;
  statusBar?: ReactNode;
  footerActions?: ReactNode;
};

export type WindowControlHandlers = {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
};

export type WindowTitleBarProps = WindowControlHandlers & {
  title: string;
  icon?: ReactNode;
  controls: readonly WindowControlAction[];
  interactive?: boolean;
  maximized?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  titleBarProps?: HTMLAttributes<HTMLDivElement>;
};

export type WindowChromeProps = WindowControlHandlers & {
  title: string;
  theme: RetroTheme;
  appearance?: DesktopWindow["appearance"];
  chrome?: WindowChromeInput;
  icon?: ReactNode;
  children: ReactNode;
  active?: boolean;
  maximized?: boolean;
  interactiveControls?: boolean;
  /** Mobile keeps its single-window navigation; unsupported desktop controls are omitted. */
  presentation?: "desktop" | "mobile";
  slots?: WindowChromeSlots;
  /** Host defaults, displayed only when neither a direct slot nor an App portal supplies that section. */
  fallbackSlots?: Partial<Record<WindowChromeSection, ReactNode>>;
  titleBarLeading?: ReactNode;
  titleBarTrailing?: ReactNode;
  titleBarProps?: HTMLAttributes<HTMLDivElement>;
  contentProps?: HTMLAttributes<HTMLDivElement>;
  frameProps?: Omit<HTMLAttributes<HTMLElement>, "children" | "title">;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
};
