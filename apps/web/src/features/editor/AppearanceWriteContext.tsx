import { createContext, useContext, type ReactNode } from "react";
import { compatibleAppearanceLoad, type AppearanceApiLoad } from "../../lib/appearanceCompatibility";
import { APPEARANCE_P2_WRITER_ENABLED } from "../../lib/appearanceP2Writer";

const AppearanceWriteContext = createContext(false);
/** No module-level mutable capability: a successful load belongs to one site/API. */
export function AppearanceWriteProvider({ siteId, apiOrigin, load, blocked, children }: { siteId: string; apiOrigin: string; load: AppearanceApiLoad | null; blocked: boolean; children: ReactNode }) {
  return <AppearanceWriteContext.Provider value={APPEARANCE_P2_WRITER_ENABLED && !blocked && compatibleAppearanceLoad(siteId, apiOrigin, load)}>{children}</AppearanceWriteContext.Provider>;
}
export const useAppearanceP2Writer = () => useContext(AppearanceWriteContext);
