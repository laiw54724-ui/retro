import { InlineTextField, EditorStatusBar, InlineErrorBanner } from "../../../components/editing";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import { type DocumentBlock, type DocumentBlockKind } from "@retrodesk/shared";
import { UploadProgressList, useWindowMedia } from "../../media/editorMedia";
import { FileUploadButton, ImageUrlInput, CompactButton, FallbackImage } from "../ui";
import { moveById, opensNewTab, patchById, safeHref, type ModuleProps } from "../types";
import { convertBlock, emptyBlock, MAX_BLOCKS, moveBlock, splitBlock, textLimit } from "./editing";
import enDelta from "./locales/en.json";
import zhDelta from "./locales/zh-Hant.json";
import jaDelta from "./locales/ja.json";
import koDelta from "./locales/ko.json";
import "./editor.css";

const LABEL = (): Record<DocumentBlockKind, string> => ({ heading: i18n.t("modules:document.heading"), text: i18n.t("modules:document.paragraph"), image: i18n.t("modules:document.image"), button: i18n.t("modules:document.button"), link: i18n.t("modules:document.hyperlink"), list: i18n.t("modules:document.list"), divider: i18n.t("modules:document.divider") });
const ADD_ORDER: DocumentBlockKind[] = ["heading", "text", "image", "button", "list", "link", "divider"];


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
              ? <figure key={block.id}><FallbackImage src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} />{caption ? <figcaption>{caption}</figcaption> : null}</figure>
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

export function DocumentInlineEditor(props: ModuleProps<"document">) {
  return <DocumentEditorSession key={props.window.id} {...props} />;
}

function DocumentEditorSession({ window, ctx, update }: ModuleProps<"document">) {
  const { t: tr } = useTranslation("modules");
  const { tv } = ctx;
  const fieldPrefix = useId();
  const editor = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ convert: string | null; anchor: string | null } | null>(null);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string | null; after: boolean } | null>(null);
  const [, setFocusTick] = useState(0);
  const pending = useRef<{ id: string | null; position?: number; owner: Element | null } | null>(null);
  const blocks = window.content.blocks;
  const focusBlock = blocks.find((block) => block.id === active);
  const media = useWindowMedia(window, ctx);
  // Keep this module runnable before the integration owner merges these catalog deltas.
  // Shared catalog values take precedence; no global resources or loader are mutated.
  const translateDelta = tr as unknown as (key: string, options: { defaultValue: string; count?: number }) => string;
  const delta = ({ en: enDelta, "zh-Hant": zhDelta, ja: jaDelta, ko: koDelta }[i18n.resolvedLanguage ?? "en"] ?? enDelta).document.inline;
  const label = (key: keyof typeof delta) => i18n.exists(`modules:document.inline.${key}`)
    ? translateDelta(`document.inline.${key}`, { defaultValue: delta[key] }) : delta[key];
  const setBlocks = (recipe: (list: DocumentBlock[]) => DocumentBlock[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, blocks: recipe(current.content.blocks) } }), key);
  const patch = (id: string, change: Partial<DocumentBlock>, field?: string) =>
    setBlocks((list) => patchById(list, id, change as never), field ? `document:${window.id}:${id}:${field}` : undefined);

  function requestFocus(id: string | null, position?: number) {
    pending.current = { id, position, owner: document.activeElement };
    setActive(id); setFocusTick((value) => value + 1);
  }
  useLayoutEffect(() => {
    // Auto-size also in engines without field-sizing support.
    editor.current?.querySelectorAll("textarea").forEach((field) => { field.style.height = "auto"; field.style.height = `${field.scrollHeight}px`; });
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    const current = document.activeElement;
    if (current !== document.body && current !== next.owner && current?.isConnected) return;
    const row = Array.from(editor.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []).find((element) => element.dataset.blockId === next.id);
    const field = row?.querySelector<HTMLElement>("[data-primary]") ?? row ?? editor.current?.querySelector<HTMLElement>(".doc-append");
    field?.focus();
    if ((field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) && next.position !== undefined) {
      const position = next.position < 0 ? field.value.length : next.position;
      field.setSelectionRange(position, position);
    }
  });
  useLayoutEffect(() => {
    if (menu) editor.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menu]);

  function closeMenu() { requestFocus(menu?.anchor ?? active); setMenu(null); }
  function add(kind: DocumentBlockKind) {
    if (!menu?.convert && blocks.length >= MAX_BLOCKS) { setError(tr("document.youveReachedTheLimitOf")); return; }
    const block = emptyBlock(kind);
    if (menu?.convert) {
      block.id = menu.convert;
      media.cancel(`image:${block.id}`);
      setBlocks((list) => list.map((item) => item.id === block.id && "text" in item && !item.text && ["text", "heading", "list"].includes(item.kind) ? block : item));
    } else {
      const anchor = menu?.anchor ?? active;
      setBlocks((list) => {
        if (list.length >= MAX_BLOCKS) return list;
        const index = anchor ? list.findIndex((item) => item.id === anchor) : list.length - 1;
        return [...list.slice(0, index + 1), block, ...list.slice(index + 1)];
      });
    }
    requestFocus(block.id, 0); setMenu(null);
  }
  function remove(id: string) {
    const index = blocks.findIndex((block) => block.id === id);
    const neighbor = blocks[index - 1] ?? blocks[index + 1];
    media.cancel(`image:${id}`);
    requestFocus(neighbor?.id ?? null, -1);
    setBlocks((list) => list.filter((block) => block.id !== id));
  }
  function changeAlt(id: string, alt: string) {
    setBlocks((list) => list.map((block) => block.id === id && block.kind === "image" ? { ...block, caption: block.caption ?? block.alt, alt } : block), `document:${window.id}:${id}:alt`);
  }
  function validFile(file: File) {
    if (!file.type.startsWith("image/")) { setError(label("imagesOnly")); return false; }
    if (file.size > 8 * 1024 * 1024) { setError(label("fileTooLarge")); return false; }
    return true;
  }
  function uploadInto(block: Extract<DocumentBlock, { kind: "image" }>, file: File | undefined) {
    if (!file || !validFile(file)) return;
    const { id, src, srcUrl } = block;
    media.upload(file, {
      kind: "image", slot: `image:${id}`,
      isCurrent: (current) => current.content.blocks.some((item) => item.id === id && item.kind === "image" && item.src === src && item.srcUrl === srcUrl),
      apply: (current, stored) => ({ ...current, content: { ...current.content, blocks: current.content.blocks.map((item) => item.id === id && item.kind === "image" ? { ...item, src: stored, srcUrl: "" } : item) } })
    });
  }
  function dropFiles(files: File[], target: string | null, after: boolean, into?: Extract<DocumentBlock, { kind: "image" }>) {
    if (!files.length || !files.every(validFile)) return;
    if (blocks.length + files.length - Number(!!into) > MAX_BLOCKS) { setError(tr("document.youveReachedTheLimitOf")); return; }
    const newFiles = into ? files.slice(1) : files;
    const inserted = newFiles.map(() => emptyBlock("image") as Extract<DocumentBlock, { kind: "image" }>);
    // Reserve IDs in selection order before starting uploads; completion order never sets insertion order.
    setBlocks((list) => {
      if (list.length + inserted.length > MAX_BLOCKS) return list;
      const index = target ? list.findIndex((item) => item.id === target) + Number(after) : list.length;
      return [...list.slice(0, index), ...inserted, ...list.slice(index)];
    });
    if (into) uploadInto(into, files[0]);
    inserted.forEach((block, index) => uploadInto(block, newFiles[index]));
  }
  function drop(event: DragEvent, target: string | null, after: boolean) {
    event.preventDefault(); event.stopPropagation();
    if (dragId) setBlocks((list) => moveBlock(list, dragId, target, after));
    else dropFiles(Array.from(event.dataTransfer.files), target, after);
    setDragId(null); setOver(null);
  }
  function dragOver(event: DragEvent<HTMLElement>, id: string | null) {
    if (!dragId && !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setOver({ id, after: id !== null && event.clientY > rect.top + rect.height / 2 });
  }
  function onKey(event: KeyboardEvent<HTMLElement>, block: DocumentBlock) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault(); event.stopPropagation();
      setBlocks((list) => moveById(list, block.id, event.key === "ArrowUp" ? -1 : 1)); return;
    }
    const primary = (event.target as HTMLElement).hasAttribute("data-primary");
    if (!primary && event.target !== event.currentTarget) return;
    if ((event.ctrlKey || event.metaKey) && /^(b|i)$/i.test(event.key) && block.kind === "text") {
      event.preventDefault(); event.stopPropagation();
      patch(block.id, event.key.toLowerCase() === "b" ? { bold: !block.bold } : { italic: !block.italic }); return;
    }
    if (block.kind === "divider" && (event.key === "Delete" || event.key === "Backspace")) { event.preventDefault(); event.stopPropagation(); remove(block.id); return; }
    if (!("text" in block) || !primary) return;
    if (event.key === "/" && !block.text && ["text", "heading", "list"].includes(block.kind)) {
      event.preventDefault(); event.stopPropagation(); setMenu({ convert: block.id, anchor: block.id }); return;
    }
    if (event.key === "Backspace" && !block.text && ["text", "heading", "list"].includes(block.kind)) { event.preventDefault(); event.stopPropagation(); remove(block.id); return; }
    if (event.key === "Enter" && !event.shiftKey && block.kind !== "list") {
      event.preventDefault(); event.stopPropagation();
      if (blocks.length >= MAX_BLOCKS) { setError(tr("document.youveReachedTheLimitOf")); return; }
      const field = event.target as HTMLTextAreaElement;
      const next = emptyBlock("text");
      setBlocks((list) => block.kind === "text" || block.kind === "heading"
        ? splitBlock(list, block.id, field.selectionStart ?? block.text.length, field.selectionEnd ?? block.text.length, next)
        : list.flatMap((item) => item.id === block.id ? [item, next] : [item]));
      requestFocus(next.id, 0);
    }
  }
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();
  const textStyle = focusBlock && ["text", "heading", "list"].includes(focusBlock.kind);
  return (
    <div ref={editor} className="document-editor" data-mobile={ctx.mobile} style={{ "--doc-face": tv.face, "--doc-shadow": tv.shadow, "--doc-bevel": tv.bevel, "--doc-sunken": tv.sunken, "--doc-pressed": tv.pressed, background: tv.face, color: tv.text } as CSSProperties}
      onDragOver={(event) => dragOver(event, null)} onDrop={(event) => drop(event, null, false)}
      onBlur={(event) => { if (menu && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setMenu(null); }}>
      <div className="doc-format-toolbar" role="toolbar" aria-label={tr("document.paragraphFormatting")}>
        <select aria-label={label("paragraphStyle")} disabled={!textStyle} value={textStyle ? focusBlock!.kind : "other"}
          onChange={(event) => {
            if (!focusBlock) return;
            const converted = convertBlock(focusBlock, event.target.value as "text" | "heading" | "list");
            if (!converted) { setError(label("tooLongToConvert")); return; }
            setBlocks((list) => list.map((block) => block.id === converted.id ? converted : block)); requestFocus(converted.id, -1);
          }}>
          {["text", "heading", "list"].map((kind) => <option key={kind} value={kind}>{LABEL()[kind as DocumentBlockKind]}</option>)}
          {!textStyle ? <option value="other">{focusBlock ? LABEL()[focusBlock.kind] : tr("document.paragraph")}</option> : null}
        </select>
        <span className="doc-toolbar-divider" />
        <CompactButton label={tr("document.bold")} disabled={focusBlock?.kind !== "text"} on={focusBlock?.kind === "text" && focusBlock.bold} aria-pressed={focusBlock?.kind === "text" && focusBlock.bold} onMouseDown={keepFocus} onClick={() => focusBlock?.kind === "text" && patch(focusBlock.id, { bold: !focusBlock.bold })}><b>B</b></CompactButton>
        <CompactButton label={tr("document.italic")} disabled={focusBlock?.kind !== "text"} on={focusBlock?.kind === "text" && focusBlock.italic} aria-pressed={focusBlock?.kind === "text" && focusBlock.italic} onMouseDown={keepFocus} onClick={() => focusBlock?.kind === "text" && patch(focusBlock.id, { italic: !focusBlock.italic })}><i>I</i></CompactButton>
        <span className="doc-toolbar-divider" />
        {(["left", "center", "right"] as const).map((align) => <CompactButton key={align} label={tr(align === "left" ? "document.alignLeft" : align === "center" ? "document.center" : "document.alignRight")} disabled={focusBlock?.kind !== "text"} on={focusBlock?.kind === "text" && focusBlock.align === align} aria-pressed={focusBlock?.kind === "text" && focusBlock.align === align} onMouseDown={keepFocus} onClick={() => focusBlock?.kind === "text" && patch(focusBlock.id, { align })}><span aria-hidden="true" className={`doc-align-icon ${align}`}><i /><i /><i /></span></CompactButton>)}
        <span className="doc-toolbar-divider" />
        <CompactButton label={label("insert")} aria-haspopup="menu" aria-expanded={!!menu} onMouseDown={keepFocus} onClick={() => menu ? closeMenu() : setMenu({ convert: null, anchor: active })}>{label("insert")} ▾</CompactButton>
      </div>
      {menu ? <div className="doc-insert-menu" role="menu" aria-label={label("insert")} onKeyDown={(event) => {
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); event.stopPropagation(); items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus(); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(); }
        if (event.key === "Tab") { event.preventDefault(); closeMenu(); }
      }}>{ADD_ORDER.map((kind) => <button key={kind} type="button" role="menuitem" onClick={() => add(kind)}>{LABEL()[kind]}</button>)}</div> : null}
      <div className="doc-page" onPointerDown={() => { if (menu) setMenu(null); }}>
        <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
        <div className="doc-body doc-edit-blocks">
          {blocks.map((block, index) => {
            const isActive = active === block.id;
            const fieldId = `${fieldPrefix}-${block.id}`;
            return <div key={block.id} className="doc-block" role="group" aria-label={tr("document.block", { v1: LABEL()[block.kind], v2: index + 1 })} tabIndex={0} data-block-id={block.id} data-active={isActive} data-dragging={dragId === block.id} data-drop={over?.id === block.id ? over.after ? "after" : "before" : undefined} onFocus={() => setActive(block.id)} onKeyDown={(event) => onKey(event, block)} onDragOver={(event) => dragOver(event, block.id)} onDrop={(event) => drop(event, block.id, event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2)}>
              <button type="button" tabIndex={-1} className="doc-drag-handle" draggable aria-label={label("reorder")} title={label("reorder")} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", block.id); setDragId(block.id); setMenu(null); }} onDragEnd={() => { setDragId(null); setOver(null); }}>⋮⋮</button>
              <div className="doc-block-content">
                {block.kind === "heading" || block.kind === "text" || block.kind === "list" ? <div className={block.kind === "list" ? "doc-list-editor" : undefined}>
                  {block.kind === "list" ? <span aria-hidden="true" className="doc-list-bullets">{block.text.split("\n").map(() => "•").join("\n")}</span> : null}
                  <textarea data-primary className={`ie ${block.kind === "heading" ? "heading" : ""}`} rows={1} value={block.text} maxLength={textLimit(block.kind)} placeholder={block.kind === "heading" ? tr("document.heading") : block.kind === "list" ? tr("document.oneItemPerLine") : label("typeOrSlash")} aria-label={block.kind === "list" ? tr("document.listOneItemPerLine") : LABEL()[block.kind]} style={block.kind === "heading" ? { color: tv.titleFrom } : block.kind === "text" ? { textAlign: block.align, fontWeight: block.bold ? 700 : 400, fontStyle: block.italic ? "italic" : "normal" } : undefined} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} />
                </div> : null}
                {block.kind === "image" ? <figure className="doc-fig">
                  {block.src ? <FallbackImage src={block.src} alt={block.alt} className="doc-img" style={{ boxShadow: tv.sunken }} /> : <div className="doc-image-drop" onDragOver={(event) => { if (!dragId && event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }} onDrop={(event) => { if (dragId) return; event.preventDefault(); event.stopPropagation(); setOver(null); dropFiles(Array.from(event.dataTransfer.files), block.id, true, block); }}><span>{label("dropImage")}</span><FileUploadButton onFiles={(files) => uploadInto(block, files[0])}>{tr("document.uploadImage")}</FileUploadButton></div>}
                  {(block.caption ?? block.alt) ? <figcaption>{block.caption ?? block.alt}</figcaption> : null}
                  {isActive ? <div className="doc-block-settings" role="group" aria-label={tr("document.imageSettings")}>
                    <div className="doc-image-actions">{block.src ? <FileUploadButton onFiles={(files) => uploadInto(block, files[0])}>{tr("document.replaceImage")}</FileUploadButton> : null}<CompactButton label={tr("image.remove")} disabled={!block.src} onClick={() => { media.cancel(`image:${block.id}`); patch(block.id, { src: null, srcUrl: "" }); }}>{tr("image.remove")}</CompactButton></div>
                    <label className="doc-setting-label"><span>{tr("document.imageUrl")}</span><ImageUrlInput onEdit={() => media.cancel(`image:${block.id}`)} raw={block.srcUrl} label={tr("document.imageUrl")} placeholder={tr("document.httpsPublicGoogleDriveLinks")} onCommit={(raw, src) => patch(block.id, { srcUrl: raw, src })} /></label>
                    <label className="doc-setting-label"><span>{tr("document.caption")}</span><InlineTextField className="ie small" value={block.caption ?? block.alt} maxLength={300} aria-label={tr("document.caption")} aria-describedby={`${fieldId}-caption-help`} onChange={(event) => patch(block.id, { caption: event.target.value }, "caption")} /></label>
                    <small id={`${fieldId}-caption-help`}>{tr("document.theCaptionAppearsOnThe")}</small>
                    <label className="doc-setting-label"><span>{tr("document.altText")}</span><InlineTextField className="ie small" value={block.alt} maxLength={300} aria-label={tr("document.altText")} aria-describedby={`${fieldId}-alt-help`} onChange={(event) => changeAlt(block.id, event.target.value)} /></label>
                    <small id={`${fieldId}-alt-help`}>{tr("document.describesTheImageForScreen")}</small>
                  </div> : null}
                </figure> : null}
                {block.kind === "button" || block.kind === "link" ? <div className="doc-action-editor">
                  <InlineTextField data-primary className={`ie ${block.kind === "button" ? "btn-text" : "link-text"}`} value={block.text} maxLength={textLimit(block.kind)} aria-label={block.kind === "button" ? tr("document.buttonText") : tr("document.linkText")} style={block.kind === "button" ? { background: tv.face, color: tv.text, boxShadow: tv.bevel } : { color: tv.accent }} onChange={(event) => patch(block.id, { text: event.target.value }, "text")} />
                  {isActive ? <div className="doc-block-settings"><label className="doc-setting-label"><span>{block.kind === "button" ? tr("document.buttonUrl") : tr("document.linkUrl")}</span><InlineTextField className="ie small" value={block.url} maxLength={2048} placeholder="https://" aria-label={block.kind === "button" ? tr("document.buttonUrl") : tr("document.linkUrl")} aria-invalid={!!block.url && safeHref(block.url) === "#"} aria-describedby={`${fieldId}-url-help`} onChange={(event) => patch(block.id, { url: event.target.value }, "url")} /></label><small id={`${fieldId}-url-help`}>{tr("document.supportsHttpsHttpOrMailto")}</small>{block.url && safeHref(block.url) === "#" ? <small className="ie-error" role="alert">{tr("document.enterAFullHttpHttps")}</small> : null}</div> : null}
                </div> : null}
                {block.kind === "divider" ? <button type="button" data-primary className="doc-divider" aria-label={tr("document.divider")}><hr style={{ borderTop: `1px solid ${tv.shadow}`, borderBottom: "1px solid #fff" }} /></button> : null}
              </div>
              <CompactButton tabIndex={isActive ? 0 : -1} className="mini-btn doc-delete" label={tr("document.deleteBlock")} danger onMouseDown={keepFocus} onClick={() => remove(block.id)}>×</CompactButton>
            </div>;
          })}
          <button type="button" className="doc-append" aria-label={tr("document.add2", { v1: tr("document.paragraph") })} data-drop={over?.id === null ? "before" : undefined} onClick={() => { const last = blocks[blocks.length - 1]; if (last?.kind === "text" && !last.text) { requestFocus(last.id, 0); } else { setActive(null); const block = emptyBlock("text"); if (blocks.length >= MAX_BLOCKS) { setError(tr("document.youveReachedTheLimitOf")); return; } setBlocks((list) => list.length < MAX_BLOCKS ? [...list, block] : list); requestFocus(block.id, 0); } }} onDragOver={(event) => dragOver(event, null)} onDrop={(event) => drop(event, null, false)}>{blocks.length ? "+" : tr("document.typeParagraphText")}</button>
        </div>
      </div>
      <EditorStatusBar className="doc-status" tv={tv} mobile={ctx.mobile} message={dragId ? label("dragHint") : label("status")} count={label("count").replace("{{count}}", String(blocks.length))} />
      <InlineErrorBanner className="doc-error" tv={tv} mobile={ctx.mobile} message={error} onClose={() => setError("")} />
    </div>
  );
}
