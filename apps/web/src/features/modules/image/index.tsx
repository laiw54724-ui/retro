import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ImageContent, ImageCrop } from "@retrodesk/shared";
import { FileUploadButton, ImageUrlInput } from "../ui";
import type { ModuleProps } from "../types";
import { UploadProgressList, useMediaQueue, useWindowMedia } from "../../media/editorMedia";
import { ImagePresentation } from "./presentation/ImagePresentation";
import { DEFAULT_IMAGE_CROP } from "./presentation/placement";
import { cropAfterDrag } from "./presentation/cropGesture";
import { createImageContent, imageUploadOptions, patchImageContent } from "./model";
import styles from "./ImageEditor.module.css";
import { EditorStatusBar, FileDropZone, InlineErrorBanner, InlineTextField, PopoverPanel } from "../../../components/editing";
import { useAssetSourceState } from "../../../lib/assetSource";
import { useEditorStore } from "../../editor/store";

export { createImageContent };

export function ImageView({ window, ctx }: ModuleProps<"image">) {
  const content = window.content;
  return <ImagePresentation
    source={content.src} alt={content.alt} caption={content.caption}
    showCaption={content.showCaption} fit={content.fit} crop={content.crop}
    background={content.background} pixelated={content.pixelated}
    frame={content.frameMode} interaction={content.interactionMode}
    mode={ctx.editing ? "editor" : "visitor"}
  />;
}

const colorOf = (background: ImageContent["background"]) => typeof background === "object" ? background.color : "#ffffff";
type Drag = { document: unknown; siteId: string | null; selectedId: string | null; content: ImageContent; pointerId: number; source: string; startX: number; startY: number; crop: ImageCrop; latest: ImageCrop; stage: { width: number; height: number }; image: { width: number; height: number } };

export function ImageInlineEditor({ window, ctx, update }: ModuleProps<"image">) {
  const { t } = useTranslation("modules");
  const media = useWindowMedia(window, ctx);
  const { queue } = useMediaQueue();
  const cancelSourceUpload = () => queue?.invalidate(t("image.sourceChanged"), (entry) => entry.options.scope === `window:${window.id}:content` && entry.options.slot === "source");
  const content = window.content;
  const crop = content.crop ?? DEFAULT_IMAGE_CROP;
  const { source: resolved, status: sourceStatus } = useAssetSourceState(content.src);
  const [natural, setNatural] = useState<{ source: string; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const positionButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [pendingCrop, setPendingCrop] = useState<ImageCrop | null>(null);
  const canUpload = !!(ctx.editing && ctx.siteId && ctx.upload);
  const key = (field: string) => `image:${window.id}:${field}`;
  const patch = (change: Partial<ImageContent>, field?: string) =>
    update((current) => patchImageContent(current, change), field ? key(field) : undefined);
  const patchCrop = (change: Partial<ImageCrop>, field?: string) =>
    update((current) => patchImageContent(current, { crop: { ...(current.content.crop ?? DEFAULT_IMAGE_CROP), ...change } }), field ? key(`crop:${field}`) : undefined);
  const zoom = (delta: number, continuous = false) => patchCrop({ zoom: Math.max(1, Math.min(4, +(crop.zoom + delta).toFixed(1))) }, continuous ? "zoom" : undefined);
  const latestZoom = useRef(zoom); latestZoom.current = zoom;
  useEffect(() => {
    const node = surface.current;
    if (!node || !content.src) return;
    const wheel = (event: WheelEvent) => { if (!event.deltaY || node.closest("[inert], [hidden]")) return; event.preventDefault(); latestZoom.current(event.deltaY < 0 ? .1 : -.1, true); };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [content.src]);
  const upload = (file: File) => {
    if (!canUpload) return;
    setError(""); media.upload(file, imageUploadOptions(window, file.name));
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !content.src || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    const step = event.shiftKey ? 10 : 2;
    const next = event.key === "ArrowLeft" ? { x: Math.max(0, crop.x - step) } : event.key === "ArrowRight" ? { x: Math.min(100, crop.x + step) } : event.key === "ArrowUp" ? { y: Math.max(0, crop.y - step) } : event.key === "ArrowDown" ? { y: Math.min(100, crop.y + step) } : null;
    if (next) { event.preventDefault(); patchCrop(next, "keyboard"); }
    else if (["+", "=", "-", "0"].includes(event.key)) { event.preventDefault(); if (event.key === "0") patch({ crop: undefined }); else zoom(event.key === "-" ? -.1 : .1, true); }
  };
  function cancelDrag() {
    const gesture = drag.current;
    drag.current = null;
    setPendingCrop(null);
    if (gesture && surface.current?.hasPointerCapture(gesture.pointerId)) surface.current.releasePointerCapture(gesture.pointerId);
  }
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((next, before) => {
      if (next.document !== before.document || next.versionedDocument !== before.versionedDocument || next.siteId !== before.siteId || next.selectedId !== before.selectedId || next.device !== before.device) cancelDrag();
    });
    const historyKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase()) || event.key === "Escape") cancelDrag();
    };
    document.addEventListener("keydown", historyKey, true);
    return () => { unsubscribe(); document.removeEventListener("keydown", historyKey, true); cancelDrag(); };
  }, []);
  useEffect(cancelDrag, [content.src, window.id, ctx.siteId, ctx.editing]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!content.src || event.button !== 0 || drag.current || !(event.target instanceof HTMLImageElement)) return;
    const stage = event.target.closest<HTMLElement>("[data-testid='image-stage']");
    if (!stage || !event.target.naturalWidth || !event.target.naturalHeight) return;
    const stageRect = stage.getBoundingClientRect();
    const imageRect = event.target.getBoundingClientRect();
    if (imageRect.width <= stageRect.width + .5 && imageRect.height <= stageRect.height + .5) return;
    event.currentTarget.focus({ preventScroll: true });
    // Focusing a background desktop image changes document layering. Finish
    // that existing shell action before taking the crop-gesture snapshot.
    if (!ctx.mobile) { useEditorStore.getState().focusWindow(window.id); event.stopPropagation(); }
    const state = useEditorStore.getState();
    const focused = state.document?.windows.find(candidate => candidate.id === window.id);
    const gestureContent = focused?.type === "image" ? focused.content : content;
    drag.current = {
      document: state.versionedDocument ?? state.document, siteId: state.siteId, selectedId: state.selectedId, content: gestureContent,
      pointerId: event.pointerId, source: content.src, startX: event.clientX, startY: event.clientY,
      crop: { ...crop }, latest: { ...crop }, stage: { width: stageRect.width, height: stageRect.height },
      image: { width: imageRect.width, height: imageRect.height }
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.source !== content.src) return;
    const delta = { x: event.clientX - gesture.startX, y: event.clientY - gesture.startY };
    if (Math.abs(delta.x) + Math.abs(delta.y) < 3) return;
    const next = cropAfterDrag(gesture.crop, delta, gesture.stage, gesture.image);
    if (next.x === gesture.latest.x && next.y === gesture.latest.y) return;
    gesture.latest = next;
    setPendingCrop(next);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current;
    if (gesture?.pointerId !== event.pointerId) return;
    drag.current = null;
    setPendingCrop(null);
    const state = useEditorStore.getState();
    if (event.type === "pointerup" && gesture.document === (state.versionedDocument ?? state.document) && gesture.siteId === state.siteId && gesture.selectedId === state.selectedId && gesture.source === content.src &&
      (gesture.latest.x !== gesture.crop.x || gesture.latest.y !== gesture.crop.y)) {
      update((current) => current.content === gesture.content && current.content.src === gesture.source
        ? patchImageContent(current, { crop: gesture.latest }) : current);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const missingAlt = !!content.src && content.interactionMode !== "decorative" && !content.alt.trim();
  const loadFailed = content.src && (sourceStatus === "failed" || resolved && failed === resolved);
  const sourceField = <ImageUrlInput onEdit={cancelSourceUpload} raw={content.srcUrl} label={t("image.url")} placeholder="https://" onCommit={(srcUrl, src) => { cancelSourceUpload(); patch({ srcUrl, src, crop: undefined }); setSourceOpen(false); setError(""); }} />;
  const bgKey = typeof content.background === "object" ? content.background.color.toLowerCase() : content.background;
  return <FileDropZone ref={root} role="region" className={styles.editor} aria-label={t("image.settings")} accept="image" maxBytes={8 * 1024 * 1024} disabled={!canUpload} onFiles={files => upload(files[0])} onError={setError} overlayText={t("image.dropReplace")} tv={ctx.tv} mobile={ctx.mobile} onPaste={event => {
      if (!canUpload || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      const file = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/"));
      if (file) { event.preventDefault(); if (file.size > 8 * 1024 * 1024) setError(t("image.fileTooLarge")); else upload(file); }
    }}>
    <div className={styles.canvas}>
      <div ref={surface} role="group" tabIndex={0} aria-label={t("image.canvas")} className={styles.preview} onKeyDown={keyboard} onDoubleClick={event => { if (content.src && !(event.target as HTMLElement).closest("input,button,label")) patch({ crop: undefined }); }} onLostPointerCapture={cancelDrag} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
        onLoadCapture={event => { const target = event.target; if (target instanceof HTMLImageElement && target.getAttribute("src") === resolved && target.naturalWidth) setNatural({ source: resolved!, width: target.naturalWidth, height: target.naturalHeight }); }}
        onErrorCapture={event => { if (event.target instanceof HTMLImageElement && event.target.getAttribute("src") === resolved) setFailed(resolved); }}>
        {content.src ? <ImagePresentation source={content.src} alt={content.alt} showCaption={false} fit={content.fit} crop={pendingCrop ?? content.crop} background={content.background} pixelated={content.pixelated} frame={content.frameMode} interaction={content.interactionMode} mode="editor" /> : <div className={styles.empty}>
          <strong>{t("image.emptyHint")}</strong>
          {canUpload ? <FileUploadButton onFiles={files => { if (files[0]) upload(files[0]); }}>{t("image.upload")}</FileUploadButton> : null}
          {sourceField}
        </div>}
      </div>
      {content.src && content.showCaption ? <InlineTextField className={styles.caption} aria-label={t("image.caption")} placeholder={t("image.captionPlaceholder")} value={content.caption} maxLength={300} onValueChange={caption => patch({ caption }, "caption")} /> : null}
    </div>
    {content.src ? <div className={styles.altRow} data-missing={missingAlt || undefined}>
      <label>{t("image.alt")}<InlineTextField value={content.alt} aria-label={t("image.alt")} maxLength={300} disabled={content.interactionMode === "decorative"} placeholder={t("image.altHint")} onValueChange={alt => patch({ alt }, "alt")} /></label>
      <label className={styles.check}><input type="checkbox" checked={content.interactionMode === "decorative"} onChange={event => patch({ interactionMode: event.target.checked ? "decorative" : "content" })} />{t("image.decorative")}</label>
      {content.interactionMode === "decorative" ? <small className={styles.decorativeHelp}>{t("image.decorativeHint")}</small> : null}
    </div> : null}
    <div className={styles.toolbar} role="toolbar" aria-label={t("image.canvasTools")}>
      <div className={styles.fits} role="radiogroup" aria-label={t("image.fit")}>
        {(["contain", "cover", "original"] as const).map(fit => <button type="button" className="mini-btn" key={fit} role="radio" aria-checked={content.fit === fit} title={t(`image.${fit}Hint`)} disabled={!content.src} onClick={() => patch({ fit, crop: undefined })}>{t(`image.${fit}`)}</button>)}
      </div>
      <button type="button" className="mini-btn" aria-label={t("image.zoomOut")} disabled={!content.src || crop.zoom <= 1} onClick={() => zoom(-.2)}>−</button>
      <span aria-hidden="true">{crop.zoom.toFixed(1)}×</span>
      <button type="button" className="mini-btn" aria-label={t("image.zoomIn")} disabled={!content.src || crop.zoom >= 4} onClick={() => zoom(.2)}>＋</button>
      {content.crop ? <button type="button" className="mini-btn" onClick={() => patch({ crop: undefined })}>{t("image.resetCrop")}</button> : null}
      <button ref={positionButton} type="button" className="mini-btn" disabled={!content.src} aria-expanded={positionOpen} onClick={() => setPositionOpen(!positionOpen)}>{t("image.placement")}</button>
      <span>{t("image.background")}</span>
      {(["transparent", "checker", "#ffffff", "#000000", "#008080"] as const).map((value, i) => <button type="button" key={value} className={`mini-btn ${styles.swatch}`} aria-label={t(`image.${(["transparent", "checker", "whiteBackground", "blackBackground", "tealBackground"] as const)[i]}`)} title={t(`image.${(["transparent", "checker", "whiteBackground", "blackBackground", "tealBackground"] as const)[i]}`)} aria-pressed={bgKey === value} disabled={!content.src} data-pattern={value === "checker" || undefined} style={{ backgroundColor: value.startsWith("#") ? value : undefined }} onClick={() => patch({ background: value === "transparent" || value === "checker" ? value : { color: value } })}>{value === "transparent" ? "∅" : ""}</button>)}
      <label className={styles.color} title={t("image.color")}><input type="color" aria-label={t("image.color")} disabled={!content.src} value={colorOf(content.background)} onChange={event => patch({ background: { color: event.target.value } }, "backgroundColor")} /></label>
      {([ ["frame", content.frameMode === "simple", () => patch({ frameMode: content.frameMode === "simple" ? "none" : "simple" })], ["pixelated", content.pixelated, () => patch({ pixelated: !content.pixelated })], ["showCaption", content.showCaption, () => patch({ showCaption: !content.showCaption })] ] as const).map(([label, on, toggle]) => <button type="button" className="mini-btn" key={label} disabled={!content.src} aria-pressed={on} onClick={toggle}>{t(`image.${label}`)}</button>)}
      {content.src ? <>
        {canUpload ? <FileUploadButton onFiles={files => { if (files[0]) upload(files[0]); }}>{t("image.replace")}</FileUploadButton> : null}
        <button type="button" ref={sourceButton} className="mini-btn" aria-expanded={sourceOpen} onClick={() => setSourceOpen(!sourceOpen)}>{t("image.source")}</button>
        <button type="button" className="mini-btn danger" onClick={() => { cancelSourceUpload(); patch({ src: null, srcUrl: "", crop: undefined }); }}>{t("image.remove")}</button>
      </> : null}
    </div>
    <PopoverPanel open={positionOpen} onClose={() => setPositionOpen(false)} triggerRef={positionButton} scopeRef={root} label={t("image.placement")} tv={ctx.tv} mobile={ctx.mobile}>
      <div className={styles.alignments}>{([ ["alignLeft", { x: 0 }, "←"], ["alignCenter", { x: 50 }, "↔"], ["alignRight", { x: 100 }, "→"], ["alignTop", { y: 0 }, "↑"], ["alignMiddle", { y: 50 }, "↕"], ["alignBottom", { y: 100 }, "↓"] ] as const).map(([label, change, glyph]) => <button type="button" className="mini-btn" key={label} aria-label={t(`image.${label}`)} onClick={() => patchCrop(change)}>{glyph}</button>)}</div>
    </PopoverPanel>
    <PopoverPanel open={sourceOpen && !!content.src} onClose={() => setSourceOpen(false)} triggerRef={sourceButton} scopeRef={root} label={t("image.source")} tv={ctx.tv} mobile={ctx.mobile}>{content.src ? sourceField : null}</PopoverPanel>
    <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
    <InlineErrorBanner message={error || (loadFailed ? t("image.loadFailed") : "")} onClose={() => { setError(""); setFailed(null); }} tv={ctx.tv} mobile={ctx.mobile} />
    <EditorStatusBar message={t(content.src ? "image.canvasHint" : "image.emptyHint")} problem={missingAlt ? t("image.missingAlt") : undefined} count={resolved && natural?.source === resolved ? `${natural.width}×${natural.height}` : undefined} tv={ctx.tv} mobile={ctx.mobile} />
  </FileDropZone>;
}
