import type { DesktopWindow } from "@retrodesk/shared";

/** Reader-first slice: no environment override or enabled creation path. */
export const IMAGE_WINDOW_CREATION_ENABLED = false;
export const canCreateWindowType = (type: DesktopWindow["type"]): boolean => type !== "image" || IMAGE_WINDOW_CREATION_ENABLED;
