import type { DesktopWindow } from "@retrodesk/shared";
import { imageAuthoringAllowed } from "./imageAuthoringGate";

/** Default off; a staging release also requires the exact compiled target and runtime origin. */
export const IMAGE_WINDOW_CREATION_ENABLED = imageAuthoringAllowed({
  dev: import.meta.env.DEV, mode: import.meta.env.MODE, ordinaryFlag: import.meta.env.VITE_IMAGE_WINDOW_WRITER,
  devServer: typeof __RETRO_IMAGE_DEV_SERVER__ !== "undefined" && __RETRO_IMAGE_DEV_SERVER__,
  release: typeof __RETRO_IMAGE_STAGING_ROLLOUT__ === "undefined" ? { enabled: false, webOrigin: null, apiOrigin: null } : __RETRO_IMAGE_STAGING_ROLLOUT__,
  webOrigin: globalThis.location?.origin, apiOrigin: import.meta.env.VITE_API_URL
});
export const canCreateWindowType = (type: DesktopWindow["type"]): boolean => type !== "image" || IMAGE_WINDOW_CREATION_ENABLED;
