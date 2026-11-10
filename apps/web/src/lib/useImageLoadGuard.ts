import { useCallback, useState } from "react";

export const EXTERNAL_IMAGE_TIMEOUT_MS = 30_000;

/** Bound visible external loads without timing out images deferred by lazy loading. */
export function useImageLoadGuard(source: string | null) {
  const [failure, setFailure] = useState<{ source: string | null; failed: boolean }>({ source, failed: false });
  // Reset even for A -> B -> A, so revisiting a URL gets a fresh attempt.
  if (failure.source !== source) setFailure({ source, failed: false });
  const ref = useCallback((image: HTMLImageElement | null) => {
    if (!image || !source) return;
    let active = true;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | undefined;
    const stop = () => { clearTimeout(timer); observer?.disconnect(); };
    const finish = (failed: boolean) => {
      if (!active || settled) return;
      settled = true;
      stop();
      if (failed) setFailure({ source, failed: true });
    };
    const loaded = () => finish(false);
    const errored = () => finish(true);
    const start = () => {
      if (settled || timer !== undefined) return;
      observer?.disconnect();
      timer = setTimeout(() => finish(true), EXTERNAL_IMAGE_TIMEOUT_MS);
    };
    image.addEventListener("load", loaded);
    image.addEventListener("error", errored);
    if (image.complete) finish(image.naturalWidth === 0);
    else if (/^https?:\/\//i.test(source)) {
      if (typeof IntersectionObserver === "undefined") start();
      else {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) start();
        });
        observer.observe(image);
      }
    }
    return () => {
      active = false;
      stop();
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", errored);
    };
  }, [source]);
  return { ref, failed: failure.source === source && failure.failed };
}
