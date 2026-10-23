import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import type { ImageCrop } from "@retrodesk/shared";
import { useAssetSourceState } from "../../../../lib/assetSource";
import { FallbackImage } from "../../ui";
import { imagePlacement, type ImageFit, type ImageSize } from "./placement";
import styles from "./ImagePresentation.module.css";

export type ImagePresentationProps = {
  source: string | null;
  alt: string;
  caption?: string;
  showCaption?: boolean;
  fit?: ImageFit;
  crop?: ImageCrop;
  background?: "transparent" | "checker" | { color: string };
  pixelated?: boolean;
  frame?: "none" | "simple";
  interaction?: "content" | "decorative";
  mode?: "visitor" | "editor";
  onSelect?: () => void;
};

type LoadedImage = ImageSize & { source: string };
const safeColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;

/** W3a presentation only: no upload, document mutation, viewer controls, or action dispatch. */
export function ImagePresentation({
  source, alt, caption = "", showCaption = true, fit = "contain", crop,
  background = "transparent", pixelated = false, frame = "none",
  interaction = "content", mode = "visitor", onSelect
}: ImagePresentationProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ImageSize>({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const { source: resolved, status } = useAssetSourceState(source);
  const decorative = interaction === "decorative";
  const pointerThrough = decorative && mode === "visitor";
  const failed = status === "failed" || !!resolved && failedSource === resolved;
  const placement = resolved && loaded?.source === resolved
    ? imagePlacement(loaded, viewport, fit, crop) : null;

  useEffect(() => setFailedSource(null), [source]);

  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      setViewport((previous) => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function imageLoaded(event: SyntheticEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLImageElement) || !resolved || target.getAttribute("src") !== resolved) return;
    const width = target.naturalWidth;
    const height = target.naturalHeight;
    if (width > 0 && height > 0) {
      setLoaded((previous) => previous?.source === resolved && previous.width === width && previous.height === height
        ? previous : { source: resolved, width, height });
    }
  }

  function imageFailed(event: SyntheticEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLImageElement && resolved && target.getAttribute("src") === resolved) setFailedSource(resolved);
  }

  const stageStyle: CSSProperties = typeof background === "object"
    ? { backgroundColor: safeColor(background.color) } : {};
  const imageStyle: CSSProperties = placement
    ? { left: placement.left, top: placement.top, width: placement.width, height: placement.height,
        imageRendering: pixelated ? "pixelated" : "auto" }
    : { left: 0, top: 0, width: "100%", height: "100%", objectFit: fit === "original" ? "none" : fit,
        imageRendering: pixelated ? "pixelated" : "auto" };

  return (
    <figure
      className={`${styles.root} ${frame === "simple" ? styles.simple : styles.none} ${pointerThrough ? styles.pointerThrough : ""}`}
      data-fit={fit}
      data-frame={frame}
      aria-hidden={pointerThrough || undefined}
      aria-busy={source && !failed && (!resolved || !placement) ? true : undefined}
    >
      <div
        ref={stage}
        className={`${styles.stage} ${background === "checker" ? styles.checker : ""}`}
        style={stageStyle}
        onLoadCapture={imageLoaded}
        onErrorCapture={imageFailed}
        data-testid="image-stage"
      >
        {resolved && !failed ? <FallbackImage key={resolved} src={resolved} alt={decorative ? "" : alt} className={styles.image} style={imageStyle} compact /> : null}
        {!source ? <span className={styles.state} role={pointerThrough ? undefined : "status"}>No image</span> : null}
        {source && !failed && !placement ? <span className={styles.state} role={pointerThrough ? undefined : "status"}>Loading image</span> : null}
        {failed ? <span className={styles.state} role={pointerThrough ? undefined : "alert"}>Image unavailable</span> : null}
      </div>
      {!decorative && showCaption && caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
      {mode === "editor" && onSelect ? <button type="button" className={styles.selection} aria-label="Select image" onClick={onSelect} /> : null}
    </figure>
  );
}
