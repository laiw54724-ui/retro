import { useId, useRef, useState } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { makeBlock, type DocumentBlock, type DocumentBlockKind } from "@retrodesk/shared";
import { UploadTaskList, useWindowMedia } from "../../media/editorMedia";
import { FilePick, ImageUrlField, MiniBtn, SafeImg } from "../ui";
import { moveById, opensNewTab, patchById, safeHref, type ModuleProps } from "../types";
import { restoreFocusUnlessMoved } from "../../../lib/restoreFocus";
import "./editor.css";

const LABEL = (): Record<DocumentBlockKind, string> => ({ heading: i18n.t("modules:document.heading"), text: i18n.t("modules:document.paragraph"), image: i18n.t("modules:document.image"), button: i18n.t("modules:document.button"), link: i18n.t("modules:document.hyperlink"), list: i18n.t("modules:document.list"), divider: i18n.t("modules:document.divider") });
const ADD_ORDER: DocumentBlockKind[] = ["heading", "text", "image", "button", "list", "link", "divider"];
const MAX_BLOCKS = 100;

export function DocumentView({ window, ctx }: ModuleProps<"document">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const blocks = window.content.blocks;
  const go = (event: React.MouseEvent, url: string) => {
    if (ctx.onLink) { event.preventDefault(); ctx.onLink({ target: "url", url }); }
  };
  if (!blocks.length) return <p className="doc-empty">{tr("document.thisDocumentHasNoContent")}</p>;
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
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const fieldPrefix = useId();
  const editor = useRef<HTMLDivElement>(null);
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

  function deleteBlock(id: string, index: number) {
    const neighbor = blocks[index + 1] ?? blocks[index - 1];
    setBlocks((list) => list.filter((item) => item.id !== id));
    setSelection(neighbor ? { windowId: window.id, blockId: neighbor.id } : null);
    restoreFocusUnlessMoved(() =>
      Array.from(editor.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []).find((block) => block.dataset.blockId === neighbor?.id)
      ?? editor.current?.querySelector<HTMLButtonElement>(".add-bar button:not(:disabled)"));
  }

  return (
    <div ref={editor} className="doc-body editing document-editor">
      <p className="document-editor-hint">{tr("document.editTheTextDirectlySelect")}</p>
      <UploadTaskList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
      {blocks.map((block, index) => {
        const isActive = active === block.id;
        const fieldId = `${fieldPrefix}-${block.id}`;
        return (
          <div
            key={block.id}
            className="doc-block"
            role="group"
            aria-label={tr("document.block", { v1: LABEL()[block.kind], v2: index + 1 })}
            tabIndex={0}
            data-block-id={block.id}
            data-active={isActive}
            onFocus={() => select(block.id)}
          >
            {isActive ? (
              <div className="ie-row block-bar doc-block-toolbar" role="group" aria-label={tr("document.blockTools")}>
                <span className="block-tag">{LABEL()[block.kind]}</span>
                {block.kind === "text" ? (
                  <div className="doc-text-format" role="group" aria-label={tr("document.paragraphFormatting")}>
                    <MiniBtn label={tr("document.bold")} on={block.bold} aria-pressed={block.bold} onClick={() => patch(block.id, { bold: !block.bold } as never)}><b>B</b></MiniBtn>
                    <MiniBtn label={tr("document.italic")} on={block.italic} aria-pressed={block.italic} onClick={() => patch(block.id, { italic: !block.italic } as never)}><i>I</i></MiniBtn>
                    <MiniBtn label={tr("document.alignLeft")} on={block.align === "left"} aria-pressed={block.align === "left"} onClick={() => patch(block.id, { align: "left" } as never)}>{tr("document.alignLeft")}</MiniBtn>
                    <MiniBtn label={tr("document.center")} on={block.align === "center"} aria-pressed={block.align === "center"} onClick={() => patch(block.id, { align: "center" } as never)}>{tr("document.center")}</MiniBtn>
                    <MiniBtn label={tr("document.alignRight")} on={block.align === "right"} aria-pressed={block.align === "right"} onClick={() => patch(block.id, { align: "right" } as never)}>{tr("document.alignRight")}</MiniBtn>
                  </div>
                ) : null}
                <div className="doc-block-actions">
                  <MiniBtn label={tr("document.moveUp")} disabled={index === 0} onClick={() => setBlocks((list) => moveById(list, block.id, -1))}>▲</MiniBtn>
                  <MiniBtn label={tr("document.moveDown")} disabled={index === blocks.length - 1} onClick={() => setBlocks((list) => moveById(list, block.id, 1))}>▼</MiniBtn>
                  <MiniBtn label={tr("document.deleteBlock")} danger onClick={() => deleteBlock(block.id, index)}>×</MiniBtn>
                </div>
              </div>
            ) : null}

            {block.kind === "heading" ? <textarea className="ie heading" rows={1} value={block.text} maxLength={500} placeholder={tr("document.heading")} aria-label={tr("document.heading")} style={{ color: tv.titleFrom }} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "text" ? <textarea className="ie" rows={2} value={block.text} maxLength={10_000} placeholder={tr("document.typeParagraphText")} aria-label={tr("document.paragraph")} style={{ textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" }} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "list" ? <textarea className="ie" rows={3} value={block.text} maxLength={10_000} placeholder={tr("document.oneItemPerLine")} aria-label={tr("document.listOneItemPerLine")} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} /> : null}
            {block.kind === "image" ? (
              <figure className="doc-fig">
                {block.src ? <SafeImg src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} /> : <div className="doc-img-ph ph" style={{ boxShadow: tv.sunken }}>{tr("document.selectThisBlockToAdd")}</div>}
                {(block.caption ?? block.alt) ? <figcaption>{block.caption ?? block.alt}</figcaption> : null}
                {isActive ? (
                  <div className="doc-block-settings" role="group" aria-label={tr("document.imageSettings")}>
                    <FilePick onFiles={(files) => uploadInto(block, files[0])}>{block.src ? tr("document.replaceImage") : tr("document.uploadImage")}</FilePick>
                    <label className="doc-setting-label">
                      <span>{tr("document.imageUrl")}</span>
                      <ImageUrlField onEdit={() => media.cancel(`image:${block.id}`)} raw={block.srcUrl} label={tr("document.imageUrl")} placeholder={tr("document.httpsPublicGoogleDriveLinks")} onCommit={(raw, src) => patch(block.id, { srcUrl: raw, src } as never)} />
                    </label>
                    <label className="doc-setting-label">
                      <span>{tr("document.caption")}</span>
                      <input className="ie small" value={block.caption ?? block.alt} maxLength={300} placeholder={tr("document.textShownBelowTheImage")} aria-label={tr("document.caption")} aria-describedby={`${fieldId}-caption-help`} onChange={(event) => patch(block.id, { caption: event.target.value } as never, "caption")} />
                    </label>
                    <small id={`${fieldId}-caption-help`} className="doc-setting-help">{tr("document.theCaptionAppearsOnThe")}</small>
                    <label className="doc-setting-label">
                      <span>{tr("document.altText")}</span>
                      <input className="ie small" value={block.alt} maxLength={300} placeholder={tr("document.describeWhatsInTheImage")} aria-label={tr("document.altText")} aria-describedby={`${fieldId}-alt-help`} onChange={(event) => changeAlt(block.id, event.target.value)} />
                    </label>
                    <small id={`${fieldId}-alt-help`} className="doc-setting-help">{tr("document.describesTheImageForScreen")}</small>
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
                  aria-label={block.kind === "button" ? tr("document.buttonText") : tr("document.linkText")}
                  style={block.kind === "button" ? { background: tv.face, color: tv.text, boxShadow: tv.bevel } : { color: tv.accent }}
                  onChange={(event) => patch(block.id, { text: event.target.value }, "text")}
                />
                {isActive ? (
                  <div className="doc-block-settings">
                    <label className="doc-setting-label">
                      <span>{block.kind === "button" ? tr("document.buttonUrl") : tr("document.linkUrl")}</span>
                      <input className="ie small" value={block.url} maxLength={2048} placeholder="https://" aria-label={block.kind === "button" ? tr("document.buttonUrl") : tr("document.linkUrl")} aria-invalid={!!block.url && safeHref(block.url) === "#"} aria-describedby={`${fieldId}-url-help`} onChange={(event) => patch(block.id, { url: event.target.value }, "url")} />
                    </label>
                    <small id={`${fieldId}-url-help`} className="doc-setting-help">{tr("document.supportsHttpsHttpOrMailto")}</small>
                    {block.url && safeHref(block.url) === "#" ? <small className="ie-error" role="alert">{tr("document.enterAFullHttpHttps")}</small> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {block.kind === "divider" ? <hr className="doc-divider" style={{ borderTop: `1px solid ${tv.shadow}`, borderBottom: "1px solid #fff" }} /> : null}
          </div>
        );
      })}
      <div className="ie-box add-bar">
        <span className="w98-hint">{tr("document.add")}</span>
        <div className="ie-row">
          {ADD_ORDER.map((kind) => (
            <MiniBtn key={kind} label={tr("document.add2", { v1: LABEL()[kind] })} className="mini-btn wide" disabled={blocks.length >= MAX_BLOCKS} onClick={() => { const block = makeBlock(kind); setBlocks((list) => list.length < MAX_BLOCKS ? [...list, block] : list); select(block.id); }}>{LABEL()[kind]}</MiniBtn>
          ))}
        </div>
        {blocks.length >= MAX_BLOCKS ? <small className="doc-setting-help">{tr("document.youveReachedTheLimitOf")}</small> : null}
      </div>
    </div>
  );
}
