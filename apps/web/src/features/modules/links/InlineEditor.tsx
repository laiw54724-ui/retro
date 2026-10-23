import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { makeLink, type LinkItem } from "@retrodesk/shared";
import { Icon } from "../../../components/Icon";
import { BUILTIN_ICON_KEYS } from "../../../lib/icons";
import { readableOn } from "../../../lib/themeView";
import { restoreFocusUnlessMoved } from "../../../lib/restoreFocus";
import { UploadProgressList, useWindowMedia } from "../../media/editorMedia";
import { FileUploadButton, ImageUrlInput, CompactButton } from "../ui";
import { moveById, patchById, type ModuleProps } from "../types";
import { describeIcon, IconPickerAction } from "./IconPicker";
import { linkDestinationSummary } from "./linkDestinationSummary";
import { guessPlatform, normalizeLinkInput } from "./guessPlatform";

const COLORS = ["#000080", "#2e1a7a", "#c2185b", "#e0245e", "#1f7a5c", "#bf360c", "#ffd166", "#111111", "#ffffff"];
const tileShadow = "inset -2px -2px rgba(0,0,0,.35), inset 2px 2px rgba(255,255,255,.4)";
type Panel = { id: string; kind: "icon" | "color" | "destination" | "order" };

export function LinksInlineEditor(props: ModuleProps<"links">) {
  return <Editor key={`${props.ctx.siteId}:${props.window.id}`} {...props} />;
}

function Editor({ window, ctx, update }: ModuleProps<"links">) {
  const { t } = useTranslation("modules");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listViewport = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const composing = useRef(false);
  const prefix = useId();
  const media = useWindowMedia(window, ctx);
  const links = window.content.links;
  // Native focus scrolling can leave a field partly behind the fixed status bar.
  // Scroll only this list, preserving the shell's visual-viewport/focus contract.
  const revealFocusedField = () => {
    const list = listViewport.current;
    const field = globalThis.document.activeElement;
    if (!list || !(field instanceof HTMLElement) || !list.contains(field)) return;
    const bounds = list.getBoundingClientRect();
    const rect = field.getBoundingClientRect();
    if (rect.bottom > bounds.bottom - 4) list.scrollTop += rect.bottom - bounds.bottom + 4;
    else if (rect.top < bounds.top + 4) list.scrollTop -= bounds.top + 4 - rect.top;
  };
  useEffect(() => {
    const list = listViewport.current;
    if (!list) return;
    const observer = new ResizeObserver(revealFocusedField);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  const setLinks = (recipe: (list: LinkItem[]) => LinkItem[], key?: string) =>
    update((current) => ({ ...current, content: { ...current.content, links: recipe(current.content.links) } }), key ? `links:${window.id}:${key}` : undefined);
  const patch = (id: string, change: Partial<LinkItem>, key?: string) => setLinks((list) => patchById(list, id, change), key);
  const otherWindows = ctx.windows.filter((candidate) => candidate.id !== window.id);
  const normalized = normalizeLinkInput(paste);
  const guess = normalized ? guessPlatform(normalized) : null;
  const guessLabel = guess?.label || t("links.inline.mailLabel");
  const missing = links.filter((link) => linkDestinationSummary(link, ctx.windows).state !== "ready").length;
  const close = (focus = true) => {
    setPanel(null);
    if (focus) restoreFocusUnlessMoved(() => trigger.current?.isConnected ? trigger.current : root.current?.querySelector<HTMLInputElement>(".link-paste-input"));
  };
  const toggle = (id: string, kind: Panel["kind"], element: HTMLElement) => {
    trigger.current = element;
    element.focus({ preventScroll: true });
    setPanel(panel?.id === id && panel.kind === kind ? null : { id, kind });
  };
  function add(blank = false) {
    if (links.length >= 100) { setError(t("links.youveReachedTheLimitOf")); return; }
    if (!blank && (!normalized || !guess)) { setError(t("links.inline.invalidPaste")); return; }
    const link = makeLink(blank ? { label: t("links.newLink"), url: "" } : { ...guess!, label: guessLabel.slice(0, 200), target: "url", url: normalized! });
    setLinks((list) => list.length < 100 ? [...list, link] : list);
    setPaste(""); setError("");
    setPanel(blank ? { id: link.id, kind: "destination" } : null);
    requestAnimationFrame(() => {
      if (!root.current?.contains(globalThis.document.activeElement)) return;
      const row = Array.from(root.current?.querySelectorAll<HTMLElement>("[data-link-id]") ?? []).find((item) => item.dataset.linkId === link.id);
      trigger.current = row?.querySelector<HTMLElement>(".link-destination-trigger") ?? null;
      row?.querySelector<HTMLInputElement>(blank ? ".link-destination-panel input.ie" : ".link-input")?.focus();
    });
  }
  function move(targetId: string | null, after: boolean) {
    if (!dragId || dragId === targetId) return;
    setLinks((list) => {
      const source = list.find((item) => item.id === dragId);
      if (!source || (targetId && !list.some((item) => item.id === targetId))) return list;
      const next = list.filter((item) => item.id !== dragId);
      next.splice(targetId ? next.findIndex((item) => item.id === targetId) + Number(after) : next.length, 0, source);
      return next;
    });
  }
  const resetDrag = () => { setDragId(null); setOver(null); };
  function dragOver(event: DragEvent<HTMLElement>, id: string) {
    if (!dragId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setOver({ id, after: event.clientY > rect.top + rect.height / 2 });
  }
  function setIcon(link: LinkItem, value: string, raw = "") {
    media.cancel(`icon:${link.id}`);
    patch(link.id, { icon: value, iconUrl: raw });
  }
  function uploadIcon(link: LinkItem, file: File) {
    if (!file.type.startsWith("image/")) { setError(t("links.inline.imageOnly")); return; }
    if (file.size > 8 * 1024 * 1024) { setError(t("links.inline.imageTooLarge")); return; }
    setError("");
    media.upload(file, {
      kind: "icon", slot: `icon:${link.id}`,
      isCurrent: (current) => current.content.links.some((item) => item.id === link.id && item.icon === link.icon && item.iconUrl === link.iconUrl),
      apply: (current, stored) => ({ ...current, content: { ...current.content, links: patchById(current.content.links, link.id, { icon: stored, iconUrl: "" }) } }),
    });
  }
  return <div ref={root} className="links-editor links-inline-v2 editing" data-mobile={ctx.mobile || undefined} style={{ background: ctx.tv.face, ["--links-face" as string]: ctx.tv.face, ["--links-text" as string]: ctx.tv.text, ["--links-bevel" as string]: ctx.tv.bevel, ["--links-pressed" as string]: ctx.tv.pressed, ["--links-sunken" as string]: ctx.tv.sunken }} onKeyDown={(event) => {
    if (event.currentTarget.contains(event.target as Node) && event.key === "Escape" && panel) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <div className="link-paste-bar">
      <label htmlFor={`${prefix}-paste`}>{t("links.inline.pasteLabel")}</label>
      <div><input id={`${prefix}-paste`} className="link-paste-input" value={paste} maxLength={2048} placeholder="https://instagram.com/mochi" onChange={(event) => { setPaste(event.target.value); setError(""); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(event) => {
        if (event.key === "Enter" && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); add(); }
      }} /><button type="button" disabled={links.length >= 100} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); add(); }}>{t("links.inline.add")}</button></div>
      {guess ? <span>{t("links.inline.preview", { name: guessLabel })}</span> : null}
    </div>
    <div ref={listViewport} className="link-editor-list" onFocusCapture={() => requestAnimationFrame(revealFocusedField)} onMouseDown={(event) => { if (event.target === event.currentTarget) close(false); }}>
      {!links.length ? <p className="links-editor-empty">{t("links.noLinksYetAddA")}</p> : null}
      {links.map((link, index) => {
        const destination = linkDestinationSummary(link, ctx.windows);
        const fg = readableOn(link.color);
        const open = panel?.id === link.id ? panel.kind : null;
        return <div key={link.id} className="link-editor-card" data-link-id={link.id} data-dragging={dragId === link.id || undefined} data-drop={over?.id === link.id ? over.after ? "after" : "before" : undefined}
          onDragOver={(event) => dragOver(event, link.id)} onDrop={(event) => { if (!dragId) return; event.preventDefault(); move(link.id, over?.after ?? false); resetDrag(); }}
          onKeyDown={(event) => {
            if (!event.currentTarget.contains(event.target as Node) || !event.altKey || event.nativeEvent.isComposing || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            setLinks((list) => moveById(list, link.id, event.key === "ArrowUp" ? -1 : 1));
          }}>
          <div className="link-editor-line">
            <button type="button" className="link-drag" draggable aria-label={t("links.inline.reorder")} title={t("links.inline.reorder")} aria-expanded={open === "order"} onClick={(event) => toggle(link.id, "order", event.currentTarget)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", link.id); setDragId(link.id); close(false); }} onDragEnd={resetDrag}>⋮⋮</button>
            <div className="link-tile edit" style={{ background: link.color, color: fg, boxShadow: tileShadow }}>
              <button type="button" className="link-icon btn" aria-label={t("iconPicker.chooseAnIcon")} aria-expanded={open === "icon"} onClick={(event) => toggle(link.id, "icon", event.currentTarget)}><Icon name={link.icon} size={24} /><span aria-hidden="true" className="link-icon-pencil">✎</span></button>
              <input className="link-input" value={link.label} maxLength={200} placeholder={t("document.buttonText")} aria-label={t("document.buttonText")} aria-invalid={!link.label.trim()} style={{ color: fg }} onChange={(event) => patch(link.id, { label: event.target.value }, `label:${link.id}`)} />
              <span aria-hidden="true">{link.target === "window" ? "▸" : "↗"}</span>
              <button type="button" className="link-color-trigger" style={{ borderColor: fg }} aria-label={t("links.inline.changeColor")} aria-expanded={open === "color"} onClick={(event) => toggle(link.id, "color", event.currentTarget)} />
            </div>
            <CompactButton label={t("links.delete")} className="mini-btn link-delete" danger onClick={() => {
              const neighbor = links[index + 1] ?? links[index - 1];
              media.cancel(`icon:${link.id}`); setLinks((list) => list.filter((item) => item.id !== link.id)); setPanel(null);
              restoreFocusUnlessMoved(() => Array.from(root.current?.querySelectorAll<HTMLElement>("[data-link-id]") ?? []).find((row) => row.dataset.linkId === neighbor?.id)?.querySelector<HTMLInputElement>(".link-input") ?? root.current?.querySelector<HTMLInputElement>(".link-paste-input"));
            }}>×</CompactButton>
          </div>
          {!link.label.trim() ? <p className="link-destination is-problem">{t("links.enterTheButtonTextSo")}</p> : null}
          <button type="button" className={`link-destination-trigger${destination.state !== "ready" ? " is-problem" : ""}`} title={destination.summary} aria-label={t("links.settingsForLink", { v1: link.label || index + 1 })} aria-expanded={open === "destination"} onClick={(event) => toggle(link.id, "destination", event.currentTarget)}><span aria-hidden="true">{destination.state !== "ready" ? "⚠" : link.target === "window" ? "▸" : "↗"}</span><span>{destination.summary}</span><span aria-hidden="true">▾</span></button>
          {open === "order" ? <div className="link-inline-panel link-order-panel" role="group" aria-label={t("links.inline.reorder")}>
            <CompactButton label={t("document.moveUp")} disabled={index === 0} onClick={() => setLinks((list) => moveById(list, link.id, -1))}>{t("document.moveUp")}</CompactButton>
            <CompactButton label={t("document.moveDown")} disabled={index === links.length - 1} onClick={() => setLinks((list) => moveById(list, link.id, 1))}>{t("document.moveDown")}</CompactButton>
          </div> : null}
          {open === "icon" ? <div className="link-inline-panel" aria-label={t("iconPicker.chooseAnIcon")}>
            <div className="link-icon-grid">{BUILTIN_ICON_KEYS.map((icon) => <button type="button" key={icon} aria-label={describeIcon(icon)} aria-pressed={link.icon === icon} onClick={() => { setIcon(link, icon); close(); }}><Icon name={icon} size={24} /></button>)}</div>
            <FileUploadButton onFiles={(files) => uploadIcon(link, files[0])}>{t("iconPicker.uploadOne")}</FileUploadButton>
            <ImageUrlInput key={link.id} onEdit={() => media.cancel(`icon:${link.id}`)} raw={link.iconUrl} label={t("iconPicker.iconUrl")} placeholder={t("iconPicker.orPasteAnIconUrl")} onCommit={(raw, src) => setIcon(link, src || "link", raw)} />
            <div onClickCapture={() => media.cancel(`icon:${link.id}`)}><IconPickerAction text={t("links.inline.fullLibrary")} siteId={ctx.siteId} value={link.icon} upload={ctx.upload} mediaTarget={{ windowId: window.id, windowType: "links", itemId: link.id }} label={link.label} defaultValue="link" onChange={(value) => setIcon(link, value, value.startsWith("http") ? value : "")} /></div>
          </div> : null}
          {open === "color" ? <div className="link-inline-panel link-colors"><span>{t("links.inline.colorHint")}</span>{COLORS.map((color) => <button key={color} type="button" className="swatch" aria-label={t("links.color", { color })} aria-pressed={link.color.toLowerCase() === color} style={{ background: color }} onClick={() => patch(link.id, { color })} />)}<label>{t("links.customColor")}<input type="color" value={link.color} aria-label={t("links.customColor")} onChange={(event) => patch(link.id, { color: event.target.value }, `color:${link.id}`)} /></label></div> : null}
          {open === "destination" ? <DestinationPanel key={link.id} link={link} windows={otherWindows} onApply={(change) => { patch(link.id, change); close(); }} onClose={() => close()} /> : null}
        </div>;
      })}
      <button type="button" className="ie-add link-add-blank" disabled={links.length >= 100} data-drop={over?.id === "end" || undefined} onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); add(true); }} onDragOver={(event) => { if (dragId) { event.preventDefault(); setOver({ id: "end", after: true }); } }} onDrop={(event) => { if (dragId) { event.preventDefault(); move(null, true); resetDrag(); } }}>{t("links.inline.blank")}</button>
      <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
    </div>
    <div className="link-status"><span title={t("links.inline.hint")} role="status">{dragId ? t("links.inline.dragHint") : missing ? t("links.inline.missing", { count: missing }) : t("links.inline.hint")}</span><span>{t("links.inline.count", { count: links.length })}</span></div>
    {error ? <div role="alert" className="link-error"><span>{error}</span><CompactButton label={t("iconPicker.cancel")} onClick={() => setError("")}>×</CompactButton></div> : null}
  </div>;
}

function DestinationPanel({ link, windows, onApply, onClose }: { link: LinkItem; windows: { id: string; title: string }[]; onApply: (patch: Partial<LinkItem>) => void; onClose: () => void }) {
  const { t } = useTranslation("modules");
  const [target, setTarget] = useState(link.target);
  const [url, setUrl] = useState(link.url);
  const [windowId, setWindowId] = useState(link.windowId);
  const group = useId();
  const invalid = target === "url" && !!url && (!/^(https?:\/\/|mailto:)/i.test(url) || !normalizeLinkInput(url));
  return <div className="link-inline-panel link-destination-panel" role="group" aria-label={t("links.destination")}>
    <div className="link-target-types" role="radiogroup" aria-label={t("links.destination")}>
      <label><input type="radio" name={group} checked={target === "url"} onChange={() => setTarget("url")} />{t("links.inline.openUrl")}</label>
      <label><input type="radio" name={group} checked={target === "window"} onChange={() => setTarget("window")} />{t("links.inline.openWindow")}</label>
    </div>
    {target === "url" ? <input className="ie" value={url} maxLength={2048} aria-label={t("document.linkUrl")} aria-invalid={invalid} placeholder="https:// / mailto:" onChange={(event) => setUrl(event.target.value)} /> : <div className="link-window-options">{windows.length ? windows.map((item) => <button type="button" key={item.id} aria-pressed={item.id === windowId} onClick={() => setWindowId(item.id)}>{item.id === windowId ? "✓ " : ""}{item.title}</button>) : <span>{t("links.inline.noWindows")}</span>}</div>}
    {invalid ? <span role="alert" className="ie-error">{t("document.enterAFullHttpHttps")}</span> : null}
    <div className="link-panel-actions"><CompactButton label={t("iconPicker.cancel")} onClick={onClose}>{t("iconPicker.cancel")}</CompactButton><CompactButton label={t("links.inline.done")} disabled={invalid} onClick={() => onApply({ target, url: target === "url" ? url.trim() : link.url, windowId })}>{t("links.inline.done")}</CompactButton></div>
  </div>;
}
