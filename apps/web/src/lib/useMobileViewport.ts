import { useSyncExternalStore } from "react";
const query = "(max-width: 767px)";
const subscribe = (notify: () => void) => {
  const media = globalThis.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const snapshot = () => globalThis.matchMedia(query).matches;
export function useMobileViewport(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
