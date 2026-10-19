import type { DesktopWindow } from "@retrodesk/shared";

/** Local authoring acceptance only. Production stays off even with the flag set. */
export const IMAGE_WINDOW_CREATION_ENABLED = import.meta.env.DEV && import.meta.env.VITE_IMAGE_WINDOW_WRITER === "true";
export const canCreateWindowType = (type: DesktopWindow["type"]): boolean => type !== "image" || IMAGE_WINDOW_CREATION_ENABLED;
