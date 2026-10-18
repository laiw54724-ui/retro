import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeGalleryImage, normalizeImageUrl, type GalleryImage } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, patchById, safeHref, type ModuleProps } from "../types";
import { useWindowMedia, UploadTaskList } from "../../media/editorMedia";
import { insertInSelectionOrder } from "../../media/uploadTasks";
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
            <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>{image.src ? <SafeImg src={image.src} alt={image.alt ?? (image.caption || image.title)} compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}</span>
            <span className="gal-title">{image.title}</span>
          </button>
        ))}
      </div>
      {open >= 0 && images[open] ? <Lightbox images={images} index={open} onIndex={setOpen} onClose={close} ctx={ctx} /> : null}
    </div>
  );
}

export function GalleryInlineEditor({ window, ctx, update }: ModuleProps<"gallery">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const media = useWindowMedia(window, ctx);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const images = window.content.images;
  const selected = images.find((image) => image.id === activeId) ?? images[0];
  const selectedIndex = selected ? images.findIndex((image) => image.id === selected.id) : -1;
  const historyKey = (field: string, id: string) => `gallery:${window.id}:${id}:${field}`;

  const setImages = (recipe: (list: GalleryImage[]) => GalleryImage[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, images: recipe(current.content.images) } }), key);
  const patch = (id: string, change: Partial<GalleryImage>, key?: string) => setImages((list) => patchById(list, id, change), key);

  function addFiles(files: File[]) {
    if (images.length >= 200) { setUrlError(tr("gallery.aGalleryCanHoldUp")); return; }
    const additions = files.map((file) => makeGalleryImage({ title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) }));
    const selectionIds = additions.map((image) => image.id);
    files.forEach((file, index) => {
      const image = additions[index];
      media.upload(file, {
        kind: "image", slot: `add:${image.id}`,
        isCurrent: (current) => current.content.images.length < 200 && !current.content.images.some((item) => item.id === image.id),
        apply: (current, stored) => ({
          ...current,
          content: { ...current.content, images: insertInSelectionOrder(current.content.images, { ...image, src: stored }, selectionIds) }
        })
      });
    });
  }

  function replace(image: GalleryImage, file: File) {
    media.upload(file, {
      kind: "image", slot: `replace:${image.id}`,
      isCurrent: (current) => current.content.images.some((item) => item.id === image.id && item.src === image.src && item.srcUrl === image.srcUrl),
      apply: (current, stored) => ({
        ...current,
        content: { ...current.content, images: patchById(current.content.images, image.id, { src: stored, srcUrl: "" }) }
      })
    });
  }

  function addUrl() {
    if (images.length >= 200) { setUrlError(tr("gallery.aGalleryCanHoldUp2")); return; }
    const result = normalizeImageUrl(url);
    if (!result.ok) { setUrlError(result.reason); return; }
    const image = makeGalleryImage({ src: result.url, srcUrl: url.trim() });
    setImages((list) => list.length < 200 ? [...list, image] : list);
    setActiveId(image.id);
    setUrl("");
    setUrlError("");
  }

  return (
    <div className="gal-wrap editing gal-editor">
      <div className="ie-row gal-editor-toolbar">
        <span>{tr("gallery.countOfMax", { count: images.length })}</span>
        <span className="w98-hint">{tr("gallery.displayColumns")}</span>
        {[2, 3, 4].map((count) => <MiniBtn key={count} label={tr("gallery.columns", { count })} on={window.content.columns === count} onClick={() => update((current) => ({ ...current, content: { ...current.content, columns: count } }))}>{count}</MiniBtn>)}
        <FilePick multiple disabled={images.length >= 200} onFiles={addFiles}><b>{tr("gallery.uploadImagesMultipleAllowed")}</b></FilePick>
      </div>
      <div className="ie-row gal-add-url">
        <input className="w98-input small-input" value={url} maxLength={2048} placeholder={tr("gallery.pasteAnImageUrlTo")} aria-label={tr("gallery.addImageUrl")} onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} />
        <MiniBtn label={tr("gallery.add")} className="mini-btn wide" disabled={images.length >= 200} onClick={addUrl}>{tr("gallery.add")}</MiniBtn>
      </div>
      <span className="w98-hint">{tr("gallery.publicGoogleDriveImageLinks")}</span>
      {urlError ? <span role="alert" className="ie-error">{urlError}</span> : null}
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      {!images.length ? <p className="gal-editor-empty">{tr("gallery.noImagesYetUploadFiles")}</p> : (
        <div className="gal-editor-workspace">
          <div className="gal-editor-list" role="group" aria-label={tr("gallery.galleryThumbnails")}>
            {images.map((image, index) => (
              <button type="button" key={image.id} className="gal-editor-thumb" aria-label={tr("gallery.selectImage", { n: index + 1, title: image.title || tr("gallery.untitledImage") })} aria-pressed={selected?.id === image.id} onClick={() => setActiveId(image.id)}>
                <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>
                  {image.src ? <SafeImg src={image.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}
                </span>
                <span className="gal-editor-thumb-title">{image.title || tr("gallery.untitledImage")}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <section className="gal-editor-properties" aria-label={tr("gallery.imageProperties")} key={selected.id} onFocusCapture={() => setActiveId(selected.id)}>
              <div className="ie-row">
                <strong>{tr("gallery.imageProperties", { n: selectedIndex + 1 })}</strong>
                <MiniBtn label={tr("gallery.moveUp")} disabled={selectedIndex === 0} onClick={() => setImages((list) => moveById(list, selected.id, -1))}>◀</MiniBtn>
                <MiniBtn label={tr("gallery.moveDown")} disabled={selectedIndex === images.length - 1} onClick={() => setImages((list) => moveById(list, selected.id, 1))}>▶</MiniBtn>
                <MiniBtn label={tr("gallery.deleteImage")} danger onClick={() => setImages((list) => list.filter((item) => item.id !== selected.id))}>×</MiniBtn>
              </div>
              <label>{tr("gallery.imageTitle")}<input className="ie small" maxLength={200} value={selected.title} placeholder={tr("gallery.imageTitle")} onChange={(event) => patch(selected.id, { title: event.target.value }, historyKey("title", selected.id))} /></label>
              <label>{tr("document.caption")}<textarea className="ie small" rows={2} maxLength={1000} value={selected.caption} aria-label={tr("document.caption")} placeholder={tr("gallery.shownBelowTheEnlargedImage")} onChange={(event) => patch(selected.id, { caption: event.target.value }, historyKey("caption", selected.id))} /></label>
              <span className="w98-hint">{tr("gallery.theCaptionAppearsBelowThe")}</span>
              <label>{tr("document.altText")}<textarea className="ie small" rows={2} maxLength={300} value={selected.alt ?? ""} aria-label={tr("document.altText")} placeholder={selected.alt === undefined ? tr("gallery.currentlyFollowsTheCaptionOr") : tr("gallery.describeTheImageForScreen")} onChange={(event) => patch(selected.id, { alt: event.target.value }, historyKey("alt", selected.id))} /></label>
              <span className="w98-hint">{tr("gallery.altNotCaption")} {selected.alt === undefined ? tr("gallery.currentlyFollowsTheCaptionOr2") : selected.alt === "" ? tr("gallery.thisImageIsMarkedAs") : tr("gallery.screenReadersWillReadThis")}</span>
              <div className="ie-row">
                <MiniBtn label={tr("gallery.markAsDecorative")} className="mini-btn wide" disabled={selected.alt === ""} onClick={() => patch(selected.id, { alt: "" })}>{tr("gallery.markAsDecorative")}</MiniBtn>
                {selected.alt !== undefined ? <MiniBtn label={tr("gallery.followCaptionOrTitle")} className="mini-btn wide" onClick={() => patch(selected.id, { alt: undefined })}>{tr("gallery.followCaptionOrTitle")}</MiniBtn> : null}
              </div>
              <FilePick title={tr("gallery.replaceSelectedImage")} onFiles={(files) => replace(selected, files[0])}>{tr("document.replaceImage")}</FilePick>
              <label>{tr("gallery.imageSource")}<ImageUrlField raw={selected.srcUrl} label={tr("document.imageUrl")} placeholder={tr("gallery.imageUrlPublicGoogleDrive")} onCommit={(raw, src) => patch(selected.id, { srcUrl: raw, src })} /></label>
              <label>{tr("gallery.imageLink")}<input className="ie small" value={selected.href} maxLength={2048} placeholder={tr("gallery.httpsOrMailtoOptional")} aria-invalid={!!selected.href && safeHref(selected.href) === "#"} onChange={(event) => patch(selected.id, { href: event.target.value }, historyKey("href", selected.id))} /></label>
              {selected.href && safeHref(selected.href) === "#" ? <span role="alert" className="ie-error">{tr("gallery.enterAValidHttpHttps")}</span> : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
