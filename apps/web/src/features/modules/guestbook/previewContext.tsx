import { createContext, useContext, type ReactNode } from "react";

// Explicit host capability, independent of URL, site handle, draft visibility or editor privileges.
// Without a provider this is the real public/owner surface. Previews must never mount either live guestbook.
const GuestbookPreviewContext = createContext(false);

export function GuestbookPreviewProvider({ children }: { children: ReactNode }) {
  return <GuestbookPreviewContext.Provider value={true}>{children}</GuestbookPreviewContext.Provider>;
}

export const useGuestbookPreview = () => useContext(GuestbookPreviewContext);
