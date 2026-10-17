import { Icon } from "./Icon";
import { WindowChrome } from "./window-chrome/WindowChrome";
import { WindowStatusBar, WindowStatusField } from "./window-chrome/WindowPrimitives";
import type { WindowChromeProps } from "./window-chrome/types";

/** Backwards-compatible public adapter: existing Apps keep their content and manager. */
export type RetroWindowProps = Omit<WindowChromeProps, "icon"> & { icon?: string };

export function RetroWindow({ icon, slots, fallbackSlots, ...props }: RetroWindowProps) {
  // An optional window-owned status bar, independent of any App content/registry.
  const statusBar = props.chrome?.sections?.statusBar === true
    ? <WindowStatusBar><WindowStatusField title={props.title}>{props.title}</WindowStatusField><WindowStatusField>{props.maximized ? "最大化" : "視窗"}</WindowStatusField></WindowStatusBar>
    : undefined;
  return <WindowChrome {...props} icon={icon ? <Icon name={icon} size={16} /> : undefined} slots={slots} fallbackSlots={{ statusBar, ...fallbackSlots }} />;
}
