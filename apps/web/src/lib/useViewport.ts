import { useEffect, useState } from "react";

/** Same breakpoint the global stylesheet uses to hide the desktop renderer (`.visitor-desktop`). */
export const PHONE_QUERY = "(max-width: 767px)";

const matches = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;

/**
 * True on a real phone-sized viewport. Preview surfaces use it as the single viewport boundary: on a phone there is only
 * one honest view (the mobile layout, without a simulated device frame); on larger screens the author may simulate one.
 */
export function useIsPhoneViewport(): boolean {
  const [phone, setPhone] = useState(matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
