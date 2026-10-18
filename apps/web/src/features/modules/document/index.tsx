import { useId, useState } from "react";
import { makeBlock, type DocumentBlock, type DocumentBlockKind } from "@retrodesk/shared";
import { UploadTaskList, useWindowMedia } from "../../media/editorMedia";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, opensNewTab, patchById, safeHref, type ModuleProps } from "../types";
import "./editor.css";

const LABEL: Record<DocumentBlockKind, string> = { heading: "標題", text: "段落", image: "圖片", button: "按鈕", link: "超連結", list: "清單", divider: "分隔線" };
const ADD_ORDER: DocumentBlockKind[] = ["heading", "text", "image", "button", "list", "link", "divider"];
const MAX_BLOCKS = 100;

export function DocumentView({ window, ctx }: ModuleProps<"document">) {
  const { tv } = ctx;
  const blocks = window.content.blocks;
  const go = (event: React.MouseEvent, url: string) => {
    if (ctx.onLink) { event.preventDefault(); ctx.onLink({ target: "url", url }); }
  };
  if (!blocks.length) return <p className="doc-empty">（這個文件還沒有內容）</p>;
  return (
    <div className="doc-body document-view">
      {blocks.map((block) => {
        switch (block.kind) {
          case "heading": return <h2 key={block.id} style={{ color: tv.titleFrom }}>{block.text}</h2>;
          case "text": return <p key={block.id} style={{ textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" }}>{block.text}</p>;
          case "image": {
            const caption = block.caption ?? block.alt;
            return block.src
              ? <figure key={block.id}><SafeImg src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} />{caption ? <figcaption>{caption}</figcaption> : null}</figure>
              : <div key={block.id} className="doc-img-ph ph" style={{ boxShadow: tv.sunken }} />;
          }
          case "button": return <div key={block.id}><a className="doc-button" href={safeHref(block.url)} target={opensNewTab(block.url) ? "_blank" : undefined} rel="noopener noreferrer" onClick={(event) => go(event, block.url)} style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }}>{block.text}</a></div>;
          case "link": return <a key={block.id} className="doc-link" href={safeHref(block.url)} target={opensNewTab(block.url) ? "_blank" : undefined} rel="noopener noreferrer" onClick={(event) => go(event, block.url)} style={{ color: tv.accent }}>{block.text}</a>;
          case "list": return <ul key={block.id}>{block.text.split("\n").map((item) => item.trim()).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul>;
          case "divider": return <hr key={block.id} style={{ borderTop: `1px solid ${tv.shadow}`, borderBottom: "1px solid #fff" }} />;
        }
      })}
    </div>
  );
}

export function DocumentInlineEditor({ window, ctx, update }: ModuleProps<"document">) {
  const { tv } = ctx;
  const fieldPrefix = useId();
  const [selection, setSelection] = useState<{ windowId: string; blockId: string } | null>(null);
  const active = selection?.windowId === window.id ? selection.blockId : null;
  const blocks = window.content.blocks;
  const media = useWindowMedia(window, ctx);
  const select = (id: string) => setSelection({ windowId: window.id, blockId: id });

  const setBlocks = (recipe: (list: DocumentBlock[]) => DocumentBlock[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, blocks: recipe(current.content.blocks) } }), key);
  const patch = (id: string, change: Partial<DocumentBlock>, field?: string) =>
    setBlocks((list) => patchById(list, id, change as never), field ? `document:${window.id}:${id}:${field}` : undefined);

  function uploadInto(block: Extract<DocumentBlock, { kind: "image" }>, file: File | undefined) {
    if (!file) return;
    const { id, src, srcUrl } = block;
    media.upload(file, {
      kind: "image",
      slot: `image:${id}`,
      isCurrent: (current) => current.content.blocks.some((item) => item.id === id && item.kind === "image" && item.src === src && item.srcUrl === srcUrl),
      apply: (current, stored) => ({
        ...current,
        content: { ...current.content, blocks: current.content.blocks.map((item) => item.id === id && item.kind === "image" ? { ...item, src: stored, srcUrl: "" } : item) }
      })
    });
  }

  function changeAlt(id: string, alt: string) {
    // Old documents used alt for both meanings. Keep their visible caption
    // when editing alt for the first time; an explicitly empty caption stays empty.
    setBlocks((list) => list.map((block) => block.id === id && block.kind === "image"
      ? { ...block, caption: block.caption ?? block.alt, alt }
      : block), `document:${window.id}:${id}:alt`);
  }

  return (
    <div className="doc-body editing document-editor">
      <p className="document-editor-hint">直接編輯文字；選取區塊可排序、刪除或設定圖片與連結。</p>
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      {blocks.map((block, index) => {
        const isActive = active === block.id;
        const fieldId = `${fieldPrefix}-${block.id}`;
        return (
          <div
            key={block.id}
            className="doc-block"
            role="group"
            aria-label={`${LABEL[block.kind]}區塊 ${index + 1}`}
            tabIndex={0}
            data-block-id={block.id}
            data-active={isActive}
            onFocus={() => select(block.id)}
          >
            {isActive ? (
              <div className="ie-row block-bar doc-block-toolbar" role="group" aria-label="區塊工具">
                <span className="block-tag">{LABEL[block.kind]}</span>
                {block.kind === "text" ? (
                  <div className="doc-text-format" role="group" aria-label="段落格式">
                    <MiniBtn label="粗體" on={block.bold} aria-pressed={block.bold} onClick={() => patch(block.id, { bold: !block.bold } as never)}><b>B</b></MiniBtn>
                    <MiniBtn label="斜體" on={block.italic} aria-pressed={block.italic} onClick={() => patch(block.id, { italic: !block.italic } as never)}><i>I</i></MiniBtn>
                    <MiniBtn label="靠左" on={block.align === "left"} aria-pressed={block.align === "left"} onClick={() => patch(block.id, { align: "left" } as never)}>靠左</MiniBtn>
                    <MiniBtn label="置中" on={block.align === "center"} aria-pressed={block.align === "center"} onClick={() => patch(block.id, { align: "center" } as never)}>置中</MiniBtn>
                    <MiniBtn label="靠右" on={block.align === "right"} aria-pressed={block.align === "right"} onClick={() => patch(block.id, { align: "right" } as never)}>靠右</MiniBtn>
                  </div>
                ) : null}
                <div className="doc-block-actions">
                  <MiniBtn label="上移" disabled={index === 0} onClick={() => setBlocks((list) => moveById(list, block.id, -1))}>▲</MiniBtn>
                  <MiniBtn label="下移" disabled={index === blocks.length - 1} onClick={() => setBlocks((list) => moveById(list, block.id, 1))}>▼</MiniBtn>
                  <MiniBtn label="刪除區塊" danger onClick={() => { setBlocks((list) => list.filter((item) => item.id !== block.id)); setSelection(null); }}>×</MiniBtn>
                </div>
              </div>
            ) : null}

            {block.kind === "heading" ? <textarea className="ie heading" rows={1} value={block.text} maxLength={500} placeholder="標題" aria-label="標題" style={{ color: tv.titleFrom }} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "text" ? <textarea className="ie" rows={2} value={block.text} maxLength={10_000} placeholder="輸入段落文字…" aria-label="段落" style={{ textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" }} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "list" ? <textarea className="ie" rows={3} value={block.text} maxLength={10_000} placeholder="每行一個項目" aria-label="清單，每行一項" onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "image" ? (
              <figure className="doc-fig">
                {block.src ? <SafeImg src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} /> : <div className="doc-img-ph ph" style={{ boxShadow: tv.sunken }}>選取此區塊加入圖片</div>}
                {(block.caption ?? block.alt) ? <figcaption>{block.caption ?? block.alt}</figcaption> : null}
                {isActive ? (
                  <div className="doc-block-settings" role="group" aria-label="圖片設定">
                    <FilePick onFiles={(files) => uploadInto(block, files[0])}>{block.src ? "更換圖片…" : "上傳圖片…"}</FilePick>
                    <label className="doc-setting-label">
                      <span>圖片網址</span>
                      <ImageUrlField raw={block.srcUrl} label="圖片網址" placeholder="https://（支援 Google 雲端公開連結）" onCommit={(raw, src) => patch(block.id, { srcUrl: raw, src } as never)} />
                    </label>
                    <label className="doc-setting-label">
                      <span>圖說</span>
                      <input className="ie small" value={block.caption ?? block.alt} maxLength={300} placeholder="顯示在圖片下方的文字" aria-label="圖說" aria-describedby={`${fieldId}-caption-help`} onChange={(event) => patch(block.id, { caption: event.target.value } as never, "caption")} />
                    </label>
                    <small id={`${fieldId}-caption-help`} className="doc-setting-help">圖說會顯示在公開頁；留空可隱藏。</small>
                    <label className="doc-setting-label">
                      <span>替代文字</span>
                      <input className="ie small" value={block.alt} maxLength={300} placeholder="描述圖片中的內容" aria-label="替代文字" aria-describedby={`${fieldId}-alt-help`} onChange={(event) => changeAlt(block.id, event.target.value)} />
                    </label>
                    <small id={`${fieldId}-alt-help`} className="doc-setting-help">提供螢幕閱讀器描述圖片；裝飾圖片可留空，不會改變圖說。</small>
                  </div>
                ) : null}
              </figure>
            ) : null}
            {block.kind === "button" || block.kind === "link" ? (
              <div className="doc-action-editor">
                <input
                  className={`ie ${block.kind === "button" ? "btn-text" : "link-text"}`}
                  value={block.text}
                  maxLength={block.kind === "button" ? 200 : 500}
                  aria-label={block.kind === "button" ? "按鈕文字" : "連結文字"}
                  style={block.kind === "button" ? { background: tv.face, color: tv.text, boxShadow: tv.bevel } : { color: tv.accent }}
                  onChange={(event) => patch(block.id, { text: event.target.value }, "text")}
                />
                {isActive ? (
                  <div className="doc-block-settings">
                    <label className="doc-setting-label">
                      <span>{block.kind === "button" ? "按鈕網址" : "連結網址"}</span>
                      <input className="ie small" value={block.url} maxLength={2048} placeholder="https://" aria-label={block.kind === "button" ? "按鈕網址" : "連結網址"} aria-invalid={!!block.url && safeHref(block.url) === "#"} aria-describedby={`${fieldId}-url-help`} onChange={(event) => patch(block.id, { url: event.target.value }, "url")} />
                    </label>
                    <small id={`${fieldId}-url-help`} className="doc-setting-help">支援 https://、http:// 或 mailto:。公開頁會使用這個網址。</small>
                    {block.url && safeHref(block.url) === "#" ? <small className="ie-error" role="alert">請輸入完整的 http://、https:// 或 mailto: 網址。</small> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {block.kind === "divider" ? <hr className="doc-divider" style={{ borderTop: `1px solid ${tv.shadow}`, borderBottom: "1px solid #fff" }} /> : null}
          </div>
        );
      })}
      <div className="ie-box add-bar">
        <span className="w98-hint">＋ 新增</span>
        <div className="ie-row">
          {ADD_ORDER.map((kind) => (
            <MiniBtn key={kind} label={`新增${LABEL[kind]}`} className="mini-btn wide" disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const block = makeBlock(kind); setBlocks((list) => list.length < MAX_BLOCKS ? [...list, block] : list); select(block.id); }}>{LABEL[kind]}</MiniBtn>
          ))}
        </div>
        {blocks.length >= MAX_BLOCKS ? <small className="doc-setting-help">已達 100 個區塊上限。</small> : null}
      </div>
    </div>
  );
}
