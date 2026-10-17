import { useState } from "react";
import { makeGalleryImage, normalizeImageUrl, type GalleryImage } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, patchById, safeHref, type ModuleProps } from "../types";
import { useWindowMedia, UploadTaskList } from "../../media/editorMedia";
import { insertInSelectionOrder } from "../../media/uploadTasks";
import "./editor.css";

function Lightbox({ images, index, onIndex, onClose, ctx }: { images: GalleryImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; ctx: ModuleProps<"gallery">["ctx"] }) {
  const image = images[index];
  const { tv } = ctx;
  const n = images.length;
  const btn = { background: tv.face, color: tv.text, boxShadow: tv.bevel };
  return (
    <div className="lightbox" role="dialog" aria-label="圖片檢視" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <div className="ie-row"><span style={{ flex: 1 }}>{index + 1} / {n}</span><button type="button" className="lb-btn sq32" style={btn} aria-label="關閉" onClick={onClose} autoFocus>×</button></div>
      <div className="lb-stage">{image.src ? <SafeImg src={image.src} alt={image.alt ?? (image.caption || image.title)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div className="ph" style={{ width: "70%", aspectRatio: "1", maxHeight: "100%" }} />}</div>
      <div className="ie-row lb-foot">
        <button type="button" className="lb-btn sq36" style={btn} aria-label="上一張" onClick={() => onIndex((index - 1 + n) % n)}>‹</button>
        <div className="lb-cap"><strong>{image.title}</strong><span>{image.caption}</span>
          {image.href ? <button type="button" className="lb-btn" style={btn} onClick={() => ctx.onLink({ target: "url", url: image.href, label: image.title })}>開啟連結 ↗</button> : null}
        </div>
        <button type="button" className="lb-btn sq36" style={btn} aria-label="下一張" onClick={() => onIndex((index + 1) % n)}>›</button>
      </div>
    </div>
  );
}

export function GalleryView({ window, ctx }: ModuleProps<"gallery">) {
  const { tv } = ctx;
  const [open, setOpen] = useState(-1);
  const images = window.content.images;
  const columns = ctx.mobile ? 2 : window.content.columns;
  if (!images.length) return <div className="empty-module">還沒有圖片</div>;
  return (
    <div className="gal-wrap">
      <div className="gal-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {images.map((image, index) => (
          <button type="button" key={image.id} className="gal-item" aria-label={`放大 ${image.title || "圖片"}`} onClick={() => setOpen(index)}>
            <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>{image.src ? <SafeImg src={image.src} alt={image.alt ?? (image.caption || image.title)} compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}</span>
            <span className="gal-title">{image.title}</span>
          </button>
        ))}
      </div>
      {open >= 0 && images[open] ? <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} ctx={ctx} /> : null}
    </div>
  );
}

export function GalleryInlineEditor({ window, ctx, update }: ModuleProps<"gallery">) {
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
    if (images.length >= 200) { setUrlError("相簿最多可放 200 張圖片。請先移除不需要的圖片。"); return; }
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
    if (images.length >= 200) { setUrlError("相簿最多可放 200 張圖片。"); return; }
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
        <span>{images.length} / 200 張</span>
        <span className="w98-hint">展示欄數</span>
        {[2, 3, 4].map((count) => <MiniBtn key={count} label={`${count} 欄`} on={window.content.columns === count} onClick={() => update((current) => ({ ...current, content: { ...current.content, columns: count } }))}>{count}</MiniBtn>)}
        <FilePick multiple disabled={images.length >= 200} onFiles={addFiles}><b>上傳圖片（可多選）</b></FilePick>
      </div>
      <div className="ie-row gal-add-url">
        <input className="w98-input small-input" value={url} maxLength={2048} placeholder="貼上圖片網址加入相簿" aria-label="新增圖片網址" onChange={(event) => { setUrl(event.target.value); setUrlError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} />
        <MiniBtn label="加入" className="mini-btn wide" disabled={images.length >= 200} onClick={addUrl}>加入</MiniBtn>
      </div>
      <span className="w98-hint">也支援 Google 雲端公開圖片連結。</span>
      {urlError ? <span role="alert" className="ie-error">{urlError}</span> : null}
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      {!images.length ? <p className="gal-editor-empty">還沒有圖片。上傳檔案或貼上圖片網址即可開始。</p> : (
        <div className="gal-editor-workspace">
          <div className="gal-editor-list" role="group" aria-label="相簿縮圖">
            {images.map((image, index) => (
              <button type="button" key={image.id} className="gal-editor-thumb" aria-label={`選取圖片 ${index + 1}：${image.title || "未命名圖片"}`} aria-pressed={selected?.id === image.id} onClick={() => setActiveId(image.id)}>
                <span className="gal-thumb" style={{ boxShadow: tv.sunken }}>
                  {image.src ? <SafeImg src={image.src} alt="" compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span className="ph gal-ph" />}
                </span>
                <span className="gal-editor-thumb-title">{image.title || "未命名圖片"}</span>
              </button>
            ))}
          </div>
          {selected ? (
            <section className="gal-editor-properties" aria-label="圖片屬性" key={selected.id} onFocusCapture={() => setActiveId(selected.id)}>
              <div className="ie-row">
                <strong>圖片 {selectedIndex + 1} 的屬性</strong>
                <MiniBtn label="往前" disabled={selectedIndex === 0} onClick={() => setImages((list) => moveById(list, selected.id, -1))}>◀</MiniBtn>
                <MiniBtn label="往後" disabled={selectedIndex === images.length - 1} onClick={() => setImages((list) => moveById(list, selected.id, 1))}>▶</MiniBtn>
                <MiniBtn label="刪除圖片" danger onClick={() => setImages((list) => list.filter((item) => item.id !== selected.id))}>×</MiniBtn>
              </div>
              <label>圖片標題<input className="ie small" maxLength={200} value={selected.title} placeholder="圖片標題" onChange={(event) => patch(selected.id, { title: event.target.value }, historyKey("title", selected.id))} /></label>
              <label>圖說<textarea className="ie small" rows={2} maxLength={1000} value={selected.caption} aria-label="圖說" placeholder="放大圖片時顯示的說明（選填）" onChange={(event) => patch(selected.id, { caption: event.target.value }, historyKey("caption", selected.id))} /></label>
              <span className="w98-hint">圖說會顯示在放大圖片的下方。</span>
              <label>替代文字<textarea className="ie small" rows={2} maxLength={300} value={selected.alt ?? ""} aria-label="替代文字" placeholder={selected.alt === undefined ? "目前沿用圖說或標題；輸入可獨立設定" : "描述畫面，供螢幕閱讀器使用"} onChange={(event) => patch(selected.id, { alt: event.target.value }, historyKey("alt", selected.id))} /></label>
              <span className="w98-hint">替代文字不會顯示為圖說。{selected.alt === undefined ? "目前沿用圖說或標題，尚未設定獨立的替代文字。" : selected.alt === "" ? "這張圖片已標記為裝飾圖片，螢幕閱讀器會略過圖片內容。" : "螢幕閱讀器會朗讀這段畫面描述。"}</span>
              <div className="ie-row">
                <MiniBtn label="設為裝飾圖片" className="mini-btn wide" disabled={selected.alt === ""} onClick={() => patch(selected.id, { alt: "" })}>設為裝飾圖片</MiniBtn>
                {selected.alt !== undefined ? <MiniBtn label="沿用圖說或標題" className="mini-btn wide" onClick={() => patch(selected.id, { alt: undefined })}>沿用圖說或標題</MiniBtn> : null}
              </div>
              <FilePick title="更換選取圖片" onFiles={(files) => replace(selected, files[0])}>更換圖片…</FilePick>
              <label>圖片來源<ImageUrlField raw={selected.srcUrl} label="圖片網址" placeholder="圖片網址 / Google 雲端公開連結" onCommit={(raw, src) => patch(selected.id, { srcUrl: raw, src })} /></label>
              <label>圖片連結<input className="ie small" value={selected.href} maxLength={2048} placeholder="https:// 或 mailto:（選填）" aria-invalid={!!selected.href && safeHref(selected.href) === "#"} onChange={(event) => patch(selected.id, { href: event.target.value }, historyKey("href", selected.id))} /></label>
              {selected.href && safeHref(selected.href) === "#" ? <span role="alert" className="ie-error">請填寫有效的 http、https 或 mailto 連結。</span> : null}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
