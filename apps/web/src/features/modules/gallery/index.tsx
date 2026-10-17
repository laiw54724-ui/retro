import { useRef, useState } from "react";
import { makeGalleryImage, normalizeImageUrl, type GalleryImage } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, patchById, type ModuleProps } from "../types";
import { Lightbox } from "./Lightbox";

export function GalleryView({ window, ctx }: ModuleProps<"gallery">) {
  const { tv } = ctx;
  const [open, setOpen] = useState(-1);
  const opener = useRef<HTMLButtonElement | null>(null);
  const grid = useRef<HTMLDivElement | null>(null);
  const images = window.content.images;
  const columns = ctx.mobile ? 2 : window.content.columns;
  const close = () => {
    setOpen(-1);
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected ? opener.current : grid.current?.querySelector<HTMLButtonElement>(".gal-item");
      target?.focus();
    });
  };
  if (!images.length) return <div className="empty-module">還沒有圖片</div>;
  return (
    <div className="gal-wrap">
      <div ref={grid} className="gal-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {images.map((image, index) => (
          <button type="button" key={image.id} className="gal-item" aria-label={`放大 ${image.title || "圖片"}`} onClick={(event) => { opener.current = event.currentTarget; setOpen(index); }}>
            <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>{image.src ? <SafeImg src={image.src} alt={image.caption || image.title} compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}</span>
            <span className="gal-title">{image.title}</span>
          </button>
        ))}
      </div>
      {open >= 0 && images[open] ? <Lightbox images={images} index={open} onIndex={setOpen} onClose={close} ctx={ctx} /> : null}
    </div>
  );
}

export function GalleryInlineEditor({ window, ctx, update }: ModuleProps<"gallery">) {
  const { tv } = ctx;
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const images = window.content.images;
  const columns = ctx.mobile ? 2 : window.content.columns;

  const setImages = (recipe: (list: GalleryImage[]) => GalleryImage[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, images: recipe(current.content.images) } }), key);
  const patch = (id: string, change: Partial<GalleryImage>, key?: string) => setImages((list) => patchById(list, id, change), key);

  async function addFiles(files: File[]) {
    // Upload sequentially so the order matches the selection and the server is not flooded.
    for (const file of files) {
      const stored = await ctx.upload?.(file, "image");
      if (stored) setImages((list) => [...list, makeGalleryImage({ src: stored, title: file.name.replace(/\.[^.]+$/, "") })]);
    }
  }
  async function replace(id: string, file: File) {
    const stored = await ctx.upload?.(file, "image");
    if (stored) patch(id, { src: stored, srcUrl: "" });
  }
  function addUrl() {
    const result = normalizeImageUrl(url);
    if (!result.ok) { setUrlError(result.reason); return; }
    setImages((list) => [...list, makeGalleryImage({ src: result.url, srcUrl: url.trim() })]);
    setUrl("");
    setUrlError("");
  }

  return (
    <div className="gal-wrap editing">
      <div className="ie-row">
        <span className="w98-hint">欄數</span>
        {[2, 3, 4].map((count) => <MiniBtn key={count} label={`${count} 欄`} on={window.content.columns === count} onClick={() => update((current) => ({ ...current, content: { ...current.content, columns: count } }))}>{count}</MiniBtn>)}
        <span style={{ flex: 1 }} />
        <FilePick multiple onFiles={(files) => void addFiles(files)}><b>上傳圖片（可多選）</b></FilePick>
      </div>
      <div className="gal-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {images.map((image, index) => (
          <div key={image.id} className="gal-edit">
            <div className="gal-thumb" style={{ boxShadow: tv.sunken, position: "relative" }}>
              {image.src ? <SafeImg src={image.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}
              <FilePick className="mini-btn gal-swap" title="換圖" onFiles={(files) => void replace(image.id, files[0])}>換圖</FilePick>
              <div className="gal-tools">
                <MiniBtn label="往前" disabled={index === 0} onClick={() => setImages((list) => moveById(list, image.id, -1))}>◀</MiniBtn>
                <MiniBtn label="往後" disabled={index === images.length - 1} onClick={() => setImages((list) => moveById(list, image.id, 1))}>▶</MiniBtn>
                <MiniBtn label="刪除" danger onClick={() => setImages((list) => list.filter((item) => item.id !== image.id))}>×</MiniBtn>
              </div>
            </div>
            <input className="ie small" value={image.title} placeholder="標題" aria-label="標題" onChange={(event) => patch(image.id, { title: event.target.value }, "gt" + image.id)} />
            <input className="ie small" value={image.caption} placeholder="說明" aria-label="說明" onChange={(event) => patch(image.id, { caption: event.target.value }, "gc" + image.id)} />
            <ImageUrlField raw={image.srcUrl} label="圖片網址" placeholder="圖片網址 / Google 雲端" onCommit={(raw, src) => patch(image.id, { srcUrl: raw, src })} />
            <input className="ie small" value={image.href} placeholder="點擊後開啟的連結（選填）" aria-label="圖片連結" onChange={(event) => patch(image.id, { href: event.target.value }, "gh" + image.id)} />
          </div>
        ))}
        <FilePick multiple className="gal-add" onFiles={(files) => void addFiles(files)}>＋<br />上傳</FilePick>
      </div>
      <div className="ie-row">
        <input className="w98-input small-input" value={url} placeholder="貼上圖片網址加入相簿（支援 Google 雲端公開連結）" aria-label="新增圖片網址" onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} />
        <MiniBtn label="加入" className="mini-btn wide" onClick={addUrl}>加入</MiniBtn>
      </div>
      {urlError ? <span role="alert" className="ie-error">{urlError}</span> : null}
    </div>
  );
}
