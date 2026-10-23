import { InlineTextField, InlineTextArea, EditorStatusBar, InlineErrorBanner } from "../../../components/editing";
import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { ParseKeys } from "i18next";
import type galleryLocaleDelta from "./locale-deltas/en.json";
import { useTranslation } from "react-i18next";
import { makeGalleryImage, type GalleryImage } from "@retrodesk/shared";
import { FileUploadButton, ImageUrlInput, CompactButton, FallbackImage } from "../ui";
import { moveById, patchById, safeHref, type ModuleProps } from "../types";
import { useWindowMedia, UploadProgressList } from "../../media/editorMedia";
import { insertGalleryUpload, parseGalleryUrls, reorderGallery, validGalleryFile } from "./inlineEditing";
import { Lightbox } from "./Lightbox";
import { restoreFocusUnlessMoved } from "../../../lib/restoreFocus";
import "./editor.css";

export function GalleryView({ window, ctx }: ModuleProps<"gallery">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const [open, setOpen] = useState(-1);
  const opener = useRef<HTMLButtonElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const images = window.content.images;
  const columns = ctx.mobile ? 2 : window.content.columns;
  const close = () => {
    setOpen(-1);
    restoreFocusUnlessMoved(() => opener.current?.isConnected ? opener.current : grid.current?.querySelector<HTMLButtonElement>(".gal-item"));
  };
  if (!images.length) return <div className="empty-module">{tr("gallery.noImagesYet")}</div>;
  return (
    <div className="gal-wrap">
      <div ref={grid} className="gal-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {images.map((image, index) => (
          <button type="button" key={image.id} className="gal-item" aria-label={tr("gallery.enlarge", { title: image.title || tr("gallery.imageFallback") })} onClick={(event) => { opener.current = event.currentTarget; setOpen(index); }}>
            <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>{image.src ? <FallbackImage src={image.src} alt={image.alt ?? (image.caption || image.title)} compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}</span>
            <span className="gal-title">{image.title}</span>
          </button>
        ))}
      </div>
      {open >= 0 && images[open] ? <Lightbox images={images} index={open} onIndex={setOpen} onClose={close} ctx={ctx} /> : null}
    </div>
  );
}

export function GalleryInlineEditor(props: ModuleProps<"gallery">) {
  return <GalleryEditorSession key={props.window.id} {...props} />;
}

function GalleryEditorSession({ window, ctx, update }: ModuleProps<"gallery">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const media = useWindowMedia(window, ctx);
  // Undefined retains the existing initial first-image selection; null explicitly deselects.
  const [activeId, setActiveId] = useState<string | null | undefined>(undefined);
  const [url, setUrl] = useState("");
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string | null; after: boolean } | null>(null);
  const [dropping, setDropping] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const urlInput = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const urlToggle = useRef<HTMLButtonElement>(null);
  const composingUrl = useRef(false);
  const images = window.content.images;
  const selected = activeId === undefined ? images[0] : images.find((image) => image.id === activeId);
  const selectedIndex = selected ? images.findIndex((image) => image.id === selected.id) : -1;
  const historyKey = (field: string, id: string) => `gallery:${window.id}:${id}:${field}`;
  // Existing catalogs remain usable until the four locale deltas are integrated.
  const label = (key: keyof typeof galleryLocaleDelta.gallery.inline, fallback: ParseKeys<"modules">) =>
    tr([`gallery.inline.${key}` as ParseKeys<"modules">, fallback]);
  const setImages = (recipe: (list: GalleryImage[]) => GalleryImage[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, images: recipe(current.content.images) } }), key);
  const patch = (id: string, change: Partial<GalleryImage>, key?: string) => setImages((list) => patchById(list, id, change), key);
  const thumb = (id?: string) => Array.from(editor.current?.querySelectorAll<HTMLButtonElement>("[data-image-id]") ?? []).find((item) => item.dataset.imageId === id);

  function addFiles(files: File[], beforeId?: string) {
    const valid = files.filter(validGalleryFile);
    const available = Math.max(0, 200 - images.length);
    const accepted = valid.slice(0, available);
    if (valid.length !== files.length) setUrlError(label("invalidFiles", "gallery.noImagesYetUploadFiles"));
    else if (valid.length > available) setUrlError(tr("gallery.aGalleryCanHoldUp"));
    const additions = accepted.map((file) => makeGalleryImage({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) }));
    const selectionIds = additions.map((image) => image.id);
    accepted.forEach((file, index) => {
      const image = additions[index];
      media.upload(file, {
        kind: "image", slot: `add:${image.id}`,
        isCurrent: (current) => current.content.images.length < 200 && !current.content.images.some((item) => item.id === image.id),
        apply: (current, stored) => ({
          ...current,
          content: { ...current.content, images: insertGalleryUpload(current.content.images, { ...image, src: stored }, selectionIds, beforeId) }
        })
      });
    });
  }

  function replace(image: GalleryImage, file: File) {
    if (!validGalleryFile(file)) { setUrlError(label("invalidFiles", "gallery.noImagesYetUploadFiles")); return; }
    media.upload(file, {
      kind: "image", slot: `replace:${image.id}`,
      isCurrent: (current) => current.content.images.some((item) => item.id === image.id && item.src === image.src && item.srcUrl === image.srcUrl),
      apply: (current, stored) => ({
        ...current,
        content: { ...current.content, images: patchById(current.content.images, image.id, { src: stored, srcUrl: "" }) }
      })
    });
  }

  function closeUrls() {
    setUrlOpen(false);
    urlInput.current?.blur();
    restoreFocusUnlessMoved(() => urlToggle.current);
  }

  function addUrl() {
    const { valid, rejected } = parseGalleryUrls(url);
    if (!valid.length) { setUrlError(label("invalidUrls", "gallery.pasteAnImageUrlTo")); return; }
    const available = Math.max(0, 200 - images.length);
    if (!available) { setUrlError(tr("gallery.aGalleryCanHoldUp2")); return; }
    const additions = valid.slice(0, available).map((item) => makeGalleryImage(item));
    setImages((list) => [...list, ...additions.slice(0, Math.max(0, 200 - list.length))]);
    setActiveId(additions[0].id);
    setUrl("");
    setUrlError(valid.length > available ? tr("gallery.aGalleryCanHoldUp2") : rejected ? label("skippedUrls", "gallery.pasteAnImageUrlTo") : "");
    closeUrls();
  }

  function deselect() {
    setActiveId(null);
    restoreFocusUnlessMoved(() => urlToggle.current);
  }

  function deleteSelected() {
    if (!selected) return;
    const neighbor = images[selectedIndex + 1] ?? images[selectedIndex - 1];
    // Focus the surviving control during the delete action, including taps in WebKit.
    (thumb(neighbor?.id) ?? urlToggle.current)?.focus();
    setImages((list) => list.filter((item) => item.id !== selected.id));
    setActiveId(neighbor?.id ?? null);
  }

  function clearDrag() { setDragId(null); setOver(null); setDropping(false); }
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  function drop(event: DragEvent, targetId: string | null = null, after = false) {
    event.preventDefault(); event.stopPropagation();
    if (dragId) setImages((list) => reorderGallery(list, dragId, targetId, after));
    else if (event.dataTransfer.files.length) {
      const index = images.findIndex((image) => image.id === targetId);
      const beforeId = targetId ? (after ? images[index + 1]?.id : targetId) : undefined;
      addFiles(Array.from(event.dataTransfer.files), beforeId);
    }
    clearDrag();
  }
  const columns = ctx.mobile ? 2 : window.content.columns;
  const status = dragId ? label("sorting", "gallery.galleryThumbnails") : dropping ? label("dropHere", "gallery.uploadImagesMultipleAllowed") : selected ? label("selectionHint", "gallery.galleryThumbnails") : label("browseHint", "gallery.noImagesYetUploadFiles");

  return (
    <div ref={editor} className="gal-wrap editing gal-editor" data-mobile={ctx.mobile || undefined} style={{
      "--gal-face": tv.face, "--gal-text": tv.text, "--gal-shadow": tv.shadow,
      "--gal-bevel": tv.bevel, "--gal-sunken": tv.sunken, "--gal-pressed": tv.pressed,
      "--gal-columns": columns
    } as CSSProperties} onDragOver={(event) => {
      if (hasFiles(event)) { event.preventDefault(); setDropping(true); }
    }} onDragLeave={(event) => {
      if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { setDropping(false); setOver(null); }
    }} onDrop={(event) => drop(event)} onKeyDown={(event) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (urlOpen) closeUrls();
        else deselect();
      }
      // Gallery shortcuts belong to thumbnails, never to unrelated toolbar controls.
      if (!(event.target as HTMLElement).closest("[data-image-id]") || !selected) return;
      if (event.key === "Delete") { event.preventDefault(); event.stopPropagation(); deleteSelected(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown"))) {
        event.preventDefault(); event.stopPropagation();
        const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        if (event.altKey) setImages((list) => moveById(list, selected.id, direction));
        else {
          const next = images[selectedIndex + direction];
          if (next) { setActiveId(next.id); thumb(next.id)?.focus(); }
        }
      }
    }}>
      <div className="gal-editor-toolbar" role="toolbar" aria-label={tr("gallery.galleryThumbnails")}>
        <FileUploadButton multiple disabled={images.length >= 200} onFiles={addFiles}><b>{tr("gallery.uploadImagesMultipleAllowed")}</b></FileUploadButton>
        <button ref={urlToggle} type="button" className="mini-btn wide" aria-expanded={urlOpen} onClick={() => {
          if (urlOpen) closeUrls();
          else { setUrlOpen(true); requestAnimationFrame(() => urlInput.current?.focus()); }
        }}>{label("pasteUrls", "gallery.addImageUrl")}</button>
        <div className="gal-column-controls"><span className="gal-column-label">{tr("gallery.displayColumns")}</span>
        {[2, 3, 4].map((count) => <CompactButton key={count} label={tr("gallery.columns", { count })} aria-pressed={window.content.columns === count} on={window.content.columns === count} onClick={() => update((current) => ({ ...current, content: { ...current.content, columns: count } }))}>{count}</CompactButton>)}</div>
        {selected ? <button type="button" className="mini-btn wide gal-deselect" onClick={deselect}>{label("deselect", "lightbox.close")}</button> : null}
      </div>
      {urlOpen ? <div className="gal-add-url">
        <InlineTextArea ref={urlInput} rows={2} className="w98-input small-input" value={url} maxLength={409800} placeholder={label("urlsPlaceholder", "gallery.pasteAnImageUrlTo")} aria-label={tr("gallery.addImageUrl")} onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} onCompositionStart={() => { composingUrl.current = true; }} onCompositionEnd={() => { composingUrl.current = false; }} onKeyDown={(event) => {
          if (composingUrl.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeUrls(); }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); addUrl(); }
        }} />
        <CompactButton label={tr("gallery.add")} className="mini-btn wide" disabled={images.length >= 200} onClick={addUrl}>{tr("gallery.add")}</CompactButton>
      </div> : null}
      <div className="gal-upload-list"><UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} /></div>
      <div className="gal-editor-workspace" data-selected={!!selected}>
        <div className="gal-editor-grid-scroll" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveId(null); }}>
          {!images.length ? <FileUploadButton multiple className="gal-editor-empty" onFiles={addFiles}>{label("emptyDrop", "gallery.noImagesYetUploadFiles")}</FileUploadButton> : null}
          <div className="gal-editor-list" role="group" aria-label={tr("gallery.galleryThumbnails")}>
            {images.map((image, index) => (
              <button type="button" key={image.id} draggable data-image-id={image.id} data-dragging={dragId === image.id || undefined} data-drop={over?.id === image.id ? over.after ? "after" : "before" : undefined} className="gal-editor-thumb" aria-label={tr("gallery.selectImage", { n: index + 1, title: image.title || tr("gallery.untitledImage") })} aria-pressed={selected?.id === image.id} onFocus={() => setActiveId(image.id)} onClick={() => setActiveId(image.id)} onDoubleClick={() => titleInput.current?.focus()} onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", image.id); setDragId(image.id); setActiveId(image.id);
              }} onDragEnd={clearDrag} onDragOver={(event) => {
                if (!dragId && !hasFiles(event)) return;
                event.preventDefault(); event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setOver({ id: image.id, after: event.clientX > rect.left + rect.width / 2 });
                setDropping(hasFiles(event));
              }} onDrop={(event) => drop(event, image.id, over?.id === image.id && over.after)}>
                <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>
                  {image.src ? <FallbackImage src={image.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}
                  <span className="gal-thumb-number">{index + 1}</span>
                  {image.href ? <span className="gal-thumb-link" aria-hidden="true">↗</span> : null}
                </span>
                <span className="gal-editor-thumb-title">{image.title || tr("gallery.untitledImage")}</span>
              </button>
            ))}
            {images.length > 0 ? <div className="gal-end-drop" data-drop={over?.id === null || undefined} onDragOver={(event) => {
              if (!dragId && !hasFiles(event)) return;
              event.preventDefault(); event.stopPropagation(); setOver({ id: null, after: true });
            }} onDrop={(event) => drop(event)}><FileUploadButton multiple disabled={images.length >= 200} className="gal-add" title={tr("gallery.uploadImagesMultipleAllowed")} onFiles={addFiles}>＋ {tr("gallery.add")}</FileUploadButton></div> : null}
          </div>
        </div>
        {selected ? (
          <section className="gal-editor-properties" aria-label={tr("gallery.imageProperties", { n: selectedIndex + 1 })} key={selected.id} onFocusCapture={() => setActiveId(selected.id)}>
            <strong className="gal-property-heading">{tr("gallery.imageProperties", { n: selectedIndex + 1 })}</strong>
            <div className="gal-property-preview">{selected.src ? <FallbackImage src={selected.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span className="ph gal-ph" />}</div>
            <div className="ie-row gal-replace-row">
              <FileUploadButton title={tr("gallery.replaceSelectedImage")} onFiles={(files) => replace(selected, files[0])}>{tr("document.replaceImage")}</FileUploadButton>
              <CompactButton label={tr("gallery.moveUp")} disabled={selectedIndex === 0} onClick={() => setImages((list) => moveById(list, selected.id, -1))}>◀</CompactButton>
              <CompactButton label={tr("gallery.moveDown")} disabled={selectedIndex === images.length - 1} onClick={() => setImages((list) => moveById(list, selected.id, 1))}>▶</CompactButton>
            </div>
              <label>{tr("gallery.imageTitle")}<InlineTextField ref={titleInput} className="ie small" maxLength={200} value={selected.title} placeholder={tr("gallery.imageTitle")} onChange={(event) => patch(selected.id, { title: event.target.value }, historyKey("title", selected.id))} /></label>
              <label>{tr("document.caption")}<InlineTextArea className="ie small" rows={2} maxLength={1000} value={selected.caption} aria-label={tr("document.caption")} placeholder={tr("gallery.shownBelowTheEnlargedImage")} onChange={(event) => patch(selected.id, { caption: event.target.value }, historyKey("caption", selected.id))} /></label>
              <span className="w98-hint">{tr("gallery.theCaptionAppearsBelowThe")}</span>
              <label>{tr("document.altText")}<InlineTextArea className="ie small" rows={2} maxLength={300} value={selected.alt ?? ""} aria-label={tr("document.altText")} placeholder={selected.alt === undefined ? tr("gallery.currentlyFollowsTheCaptionOr") : tr("gallery.describeTheImageForScreen")} onChange={(event) => patch(selected.id, { alt: event.target.value }, historyKey("alt", selected.id))} /></label>
              <span className="w98-hint">{tr("gallery.altNotCaption")} {selected.alt === undefined ? tr("gallery.currentlyFollowsTheCaptionOr2") : selected.alt === "" ? tr("gallery.thisImageIsMarkedAs") : tr("gallery.screenReadersWillReadThis")}</span>
              <div className="ie-row">
                <CompactButton label={tr("gallery.markAsDecorative")} className="mini-btn wide" disabled={selected.alt === ""} onClick={() => patch(selected.id, { alt: "" })}>{tr("gallery.markAsDecorative")}</CompactButton>
                {selected.alt !== undefined ? <CompactButton label={tr("gallery.followCaptionOrTitle")} className="mini-btn wide" onClick={() => patch(selected.id, { alt: undefined })}>{tr("gallery.followCaptionOrTitle")}</CompactButton> : null}
              </div>
              <label>{tr("gallery.imageSource")}<ImageUrlInput key={selected.id} onEdit={() => media.cancel(`replace:${selected.id}`)} raw={selected.srcUrl} label={tr("document.imageUrl")} placeholder={tr("gallery.imageUrlPublicGoogleDrive")} onCommit={(raw, src) => patch(selected.id, { srcUrl: raw, src })} /></label>
              <label>{tr("gallery.imageLink")}<InlineTextField className="ie small" value={selected.href} maxLength={2048} placeholder={tr("gallery.httpsOrMailtoOptional")} aria-invalid={!!selected.href && safeHref(selected.href) === "#"} onChange={(event) => patch(selected.id, { href: event.target.value }, historyKey("href", selected.id))} /></label>
              {selected.href && safeHref(selected.href) === "#" ? <span role="alert" className="ie-error">{tr("gallery.enterAValidHttpHttps")}</span> : null}
            <CompactButton label={tr("gallery.deleteImage")} className="mini-btn wide danger" onClick={deleteSelected}>{tr("gallery.deleteImage")}</CompactButton>
          </section>
        ) : null}
      </div>
      <EditorStatusBar className="gal-editor-status" tv={tv} mobile={ctx.mobile} message={status} count={tr("gallery.countOfMax", { count: images.length })} />
      {dropping ? <div className="gal-drop-overlay">{label("dropHere", "gallery.uploadImagesMultipleAllowed")}</div> : null}
      <InlineErrorBanner className="gal-editor-error" tv={tv} mobile={ctx.mobile} message={urlError} onClose={() => setUrlError("")} />
    </div>
  );
}
