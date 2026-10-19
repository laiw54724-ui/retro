import { createContext, useContext, type ReactNode } from "react";
import type { AppearanceApiLoad } from "../../lib/appearanceCompatibility";
import { compatibleImageLoad } from "../../lib/imageCompatibility";
import { IMAGE_WINDOW_CREATION_ENABLED } from "../../lib/imageWindowCreation";

const ImageWriteContext = createContext(false);

/** A preservation advertisement belongs to this site/API load, never another editor tab. */
export function ImageWriteProvider({ siteId, apiOrigin, load, blocked, children }: { siteId: string; apiOrigin: string; load: AppearanceApiLoad | null; blocked: boolean; children: ReactNode }) {
  return <ImageWriteContext.Provider value={IMAGE_WINDOW_CREATION_ENABLED && !blocked && compatibleImageLoad(siteId, apiOrigin, load)}>{children}</ImageWriteContext.Provider>;
}

export const useImageWriter = () => useContext(ImageWriteContext);
