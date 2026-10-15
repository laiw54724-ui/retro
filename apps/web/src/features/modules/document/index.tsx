import { useState } from "react";
import { makeBlock, type DocumentBlock, type DocumentBlockKind } from "@retrodesk/shared";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, opensNewTab, patchById, safeHref, type ModuleProps } from "../types";

const LABEL: Record<DocumentBlockKind, string> = { heading: "標題", text: "段落", image: "圖片", button: "按鈕", link: "超連結", list: "清單", divider: "分隔線" };
const ADD_ORDER: DocumentBlockKind[] = ["heading", "text", "image", "button", "list", "link", "divider"];

export function DocumentView({ window, ctx }: ModuleProps<"document">) {
  const { tv } = ctx;
  const blocks = window.content.blocks;
  const go = (event: React.MouseEvent, url: string) => {
    if (ctx.onLink) { event.preventDefault(); ctx.onLink({ target: "url", url }); }
  };
  if (!blocks.length) return <p className="doc-empty">（這個文件還沒有內容）</p>;
  return (
    <div className="doc-body">
      {blocks.map((block) => {
        switch (block.kind) {
          case "heading": return <h2 key={block.id} style={{ color: tv.titleFrom }}>{block.text}</h2>;
          case "text": return <p key={block.id} style={{ textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" }}>{block.text}</p>;
          case "image": return block.src
            ? <figure key={block.id}><SafeImg src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} />{block.alt ? <figcaption>{block.alt}</figcaption> : null}</figure>
            : <div key={block.id} className="doc-img-ph ph" style={{ boxShadow: tv.sunken }} />;
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
  const [active, setActive] = useState<string | null>(null);
  const blocks = window.content.blocks;

  const setBlocks = (recipe: (list: DocumentBlock[]) => DocumentBlock[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, blocks: recipe(current.content.blocks) } }), key);
  const patch = (id: string, change: Partial<DocumentBlock>, key?: string) =>
    setBlocks((list) => patchById(list, id, change as never), key);

  async function uploadInto(id: string, file: File) {
    const url = await ctx.upload?.(file, "image");
    if (url) patch(id, { src: url, srcUrl: "" } as never);
  }

  return (
    <div className="doc-body editing">
      {blocks.map((block, index) => {
        const isActive = active === block.id;
        return (
          <div key={block.id} className="doc-block" onPointerDown={() => setActive(block.id)} onFocus={() => setActive(block.id)}>
            {isActive ? (
              <div className="ie-row block-bar">
                <span className="block-tag">{LABEL[block.kind]}</span>
                {block.kind === "text" ? (
                  <>
                    <MiniBtn label="粗體" on={block.bold} onClick={() => patch(block.id, { bold: !block.bold } as never)}><b>B</b></MiniBtn>
                    <MiniBtn label="斜體" on={block.italic} onClick={() => patch(block.id, { italic: !block.italic } as never)}><i>I</i></MiniBtn>
                    <MiniBtn label="靠左" className="mini-btn wide" on={block.align !== "center"} onClick={() => patch(block.id, { align: "left" } as never)}>靠左</MiniBtn>
                    <MiniBtn label="置中" className="mini-btn wide" on={block.align === "center"} onClick={() => patch(block.id, { align: "center" } as never)}>置中</MiniBtn>
                  </>
                ) : null}
                <span style={{ flex: 1 }} />
                <MiniBtn label="上移" disabled={index === 0} onClick={() => setBlocks((list) => moveById(list, block.id, -1))}>▲</MiniBtn>
                <MiniBtn label="下移" disabled={index === blocks.length - 1} onClick={() => setBlocks((list) => moveById(list, block.id, 1))}>▼</MiniBtn>
                <MiniBtn label="刪除區塊" danger onClick={() => setBlocks((list) => list.filter((item) => item.id !== block.id))}>×</MiniBtn>
              </div>
            ) : null}

            {block.kind === "heading" ? <textarea className="ie heading" rows={1} value={block.text} placeholder="標題" aria-label="標題" style={{ color: tv.titleFrom }} onChange={(event) => patch(block.id, { text: event.target.value }, "t" + block.id)} /> : null}
            {block.kind === "text" ? <textarea className="ie" rows={2} value={block.text} placeholder="輸入段落文字…" aria-label="段落" style={{ textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" }} onChange={(event) => patch(block.id, { text: event.target.value }, "t" + block.id)} /> : null}
            {block.kind === "list" ? <textarea className="ie" rows={3} value={block.text} placeholder="每行一個項目" aria-label="清單，每行一項" onChange={(event) => patch(block.id, { text: event.target.value }, "t" + block.id)} /> : null}
            {block.kind === "image" ? (
              <figure className="doc-fig">
                {block.src ? <SafeImg src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} /> : (
                  <FilePick className="doc-img-ph ph add" onFiles={(files) => void uploadInto(block.id, files[0])}>＋ 點此上傳圖片</FilePick>
                )}
                {block.src ? <FilePick onFiles={(files) => void uploadInto(block.id, files[0])}>更換圖片…</FilePick> : null}
                <ImageUrlField raw={block.srcUrl} label="圖片網址" placeholder="或貼上圖片網址（支援 Google 雲端公開連結）" onCommit={(raw, src) => patch(block.id, { srcUrl: raw, src } as never)} />
                <input className="ie small" value={block.alt} placeholder="圖說／替代文字（建議填寫）" aria-label="圖說" onChange={(event) => patch(block.id, { alt: event.target.value } as never, "a" + block.id)} />
              </figure>
            ) : null}
            {block.kind === "button" ? (
              <div className="ie-row">
                <input className="ie btn-text" value={block.text} aria-label="按鈕文字" style={{ background: tv.face, color: tv.text, boxShadow: tv.bevel }} onChange={(event) => patch(block.id, { text: event.target.value }, "t" + block.id)} />
                <input className="ie small grow" value={block.url} placeholder="連到 https://" aria-label="按鈕網址" onChange={(event) => patch(block.id, { url: event.target.value }, "u" + block.id)} />
              </div>
            ) : null}
            {block.kind === "link" ? (
              <div className="ie-row">
                <input className="ie link-text" value={block.text} aria-label="連結文字" style={{ color: tv.accent }} onChange={(event) => patch(block.id, { text: event.target.value }, "t" + block.id)} />
                <input className="ie small grow" value={block.url} placeholder="https://" aria-label="連結網址" onChange={(event) => patch(block.id, { url: event.target.value }, "u" + block.id)} />
              </div>
            ) : null}
            {block.kind === "divider" ? <hr style={{ borderTop: `1px solid ${tv.shadow}`, borderBottom: "1px solid #fff" }} /> : null}
          </div>
        );
      })}
      <div className="ie-box add-bar">
        <span className="w98-hint">＋ 新增</span>
        <div className="ie-row">
          {ADD_ORDER.map((kind) => (
            <MiniBtn key={kind} label={`新增${LABEL[kind]}`} className="mini-btn wide" onClick={() => { const block = makeBlock(kind); setBlocks((list) => [...list, block]); setActive(block.id); }}>{LABEL[kind]}</MiniBtn>
          ))}
        </div>
      </div>
    </div>
  );
}
