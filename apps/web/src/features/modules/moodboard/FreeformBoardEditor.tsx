import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { normalizeImageUrl, type MoodboardElement } from "@retrodesk/shared";
import { EditorStatusBar, FileDropZone, FloatingSelectionBar, InlineErrorBanner, InlineTextArea, PopoverPanel } from "../../../components/editing";
import { FallbackImage, FileUploadButton, ImageUrlInput } from "../ui";
import { UploadProgressList, useWindowMedia } from "../../media/editorMedia";
import type { ModuleProps } from "../types";
import { downloadMoodboardPng, exportMoodboardPng } from "./export";
import { boundedGeometry, clamp, geometryRange, orderedElements, reorderElement, type GeometryField } from "./editing";
import { handles, imageRect, moveSelection, resizeRect, selectionBounds, snapMovement, type Handle } from "./interactions";
import { GeometryInput } from "./GeometryInput";

const newId = () => globalThis.crypto.randomUUID();
const maxBytes = 8 * 1024 * 1024;
const typing = (target: EventTarget | null) => target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=true]");
type Gesture = { ids: Set<string>; x: number; y: number; key: string; handle?: Handle; snapshot?: MoodboardElement[]; moved: boolean; scale: number };

export function FreeformBoardEditor({ window: boardWindow, ctx, update }: ModuleProps<"moodboard">) {
  const { t: tr } = useTranslation("modules"), { t: te } = useTranslation("editor");
  const content = boardWindow.content;
  const [selection, setSelection] = useState<string[]>([]), [editing, setEditing] = useState<string | null>(null);
  const [panel, setPanel] = useState<"geometry" | "image" | "url" | null>(null);
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [dragging, setDragging] = useState(false);
  const [layout, setLayout] = useState({ scale: 1, x: 12, y: 12 });
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const rootRef = useRef<HTMLDivElement>(null), workspaceRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null);
  const geometryRef = useRef<HTMLFieldSetElement>(null), geometryTrigger = useRef<HTMLButtonElement>(null), imageTrigger = useRef<HTMLButtonElement>(null), urlTrigger = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null), textRef = useRef<HTMLTextAreaElement>(null), gesture = useRef<Gesture | null>(null);
  const textSession = useRef(newId()), mounted = useRef(true), latest = useRef({ content, selection, update });
  latest.current = { content, selection, update };
  const media = useWindowMedia(boardWindow, ctx);
  const selectedElements = content.elements.filter((item) => selection.includes(item.id));
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;
  const bounds = selectionBounds(selectedElements);
  const setElements = (recipe: (items: MoodboardElement[]) => MoodboardElement[], historyKey?: string) => update((current) => ({ ...current, content: { ...current.content, elements: recipe(current.content.elements) } }), historyKey);
  const patch = (id: string, change: Partial<MoodboardElement>, key?: string) => setElements((items) => items.map((item) => item.id === id ? { ...item, ...change } as MoodboardElement : item), key);
  const label = (item: MoodboardElement) => item.kind === "text" ? tr("moodboard.textLabel", { content: item.content || tr("moodboard.blank") }) : item.kind === "image" ? tr("moodboard.imageLabel", { alt: item.alt || tr("moodboard.untitled") }) : tr("moodboard.colorBlock", { color: item.color });
  const commitGeometry = () => geometryRef.current?.querySelector<HTMLInputElement>("input:focus")?.blur();
  const focusItem = (id: string) => requestAnimationFrame(() => stageRef.current?.querySelector<HTMLElement>(`[data-moodboard-id="${id}"]`)?.focus({ preventScroll: true }));
  const limit = () => { setError(tr("moodboard.theMoodboardHasReachedIts")); return false; };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; gesture.current = null; }; }, []);
  useLayoutEffect(() => {
    const node = workspaceRef.current; if (!node) return;
    const measure = () => { const { width, height } = node.getBoundingClientRect(); const scale = Math.max(0.01, Math.min((width - 24) / content.width, (height - 24) / content.height)); setLayout({ scale, x: (width - content.width * scale) / 2, y: (height - content.height * scale) / 2 }); };
    measure(); const observer = new ResizeObserver(measure); observer.observe(node); return () => observer.disconnect();
  }, [content.width, content.height]);
  useLayoutEffect(() => { if (editing) { textRef.current?.focus({ preventScroll: true }); textRef.current?.select(); } }, [editing]);

  // The listener reads current content so a numeric draft committed on pointerdown is included.
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const active = gesture.current; if (!active) return;
      const dxScreen = event.clientX - active.x, dyScreen = event.clientY - active.y;
      if (!active.moved && Math.hypot(dxScreen, dyScreen) < 3) return;
      active.moved = true; setDragging(true);
      const now = latest.current.content; active.snapshot ??= now.elements;
      const scale = active.scale;
      const dx = Math.round(dxScreen / scale), dy = Math.round(dyScreen / scale);
      let next: MoodboardElement[];
      if (active.handle) {
        const original = active.snapshot.find((item) => active.ids.has(item.id)); if (!original || original.locked) return;
        const rect = resizeRect(original, active.handle, dx, dy, now, original.kind === "image" || event.shiftKey);
        next = active.snapshot.map((item) => item.id === original.id ? { ...item, ...rect } : item);
      } else {
        const movable = active.snapshot.filter((item) => active.ids.has(item.id) && !item.locked);
        const box = selectionBounds(movable); if (!box) return;
        const snapped = snapMovement(box, dx, dy, active.snapshot.filter((item) => !active.ids.has(item.id)), now, scale, event.altKey);
        next = moveSelection(active.snapshot, active.ids, snapped.dx, snapped.dy, now); setGuides({ x: snapped.x, y: snapped.y });
      }
      // Apply only gesture members: late uploads and unrelated changes must never be overwritten.
      latest.current.update((current) => ({ ...current, content: { ...current.content, elements: current.content.elements.map((item) => {
        const moved = next.find((entry) => entry.id === item.id);
        return active.ids.has(item.id) && !item.locked && moved ? { ...item, x: moved.x, y: moved.y, width: moved.width, height: moved.height } : item;
      }) } }), active.key);
    };
    const finish = () => { gesture.current = null; setDragging(false); setGuides({ x: null, y: null }); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("blur", finish);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); window.removeEventListener("blur", finish); };
  }, []);

  function begin(event: PointerEvent<HTMLElement>, item: MoodboardElement, handle?: Handle) {
    if (event.button !== 0 || editing === item.id && !handle) return;
    event.stopPropagation(); commitGeometry(); setPanel(null);
    const next = handle ? [item.id] : event.shiftKey ? selection.includes(item.id) ? selection.filter((id) => id !== item.id) : [...selection, item.id] : selection.includes(item.id) ? selection : [item.id];
    setSelection(next);
    if (!item.locked && next.includes(item.id)) gesture.current = { ids: new Set(next), x: event.clientX, y: event.clientY, key: `moodboard-gesture-${newId()}`, handle, moved: false, scale: (stageRef.current?.getBoundingClientRect().width ?? content.width) / content.width };
  }
  function startText(item: MoodboardElement) { if (item.kind !== "text" || item.locked) return; setPanel(null); setSelection([item.id]); textSession.current = newId(); setEditing(item.id); }
  function finishText(id: string, restore: boolean) { setEditing(null); if (restore) focusItem(id); }
  function append(element: MoodboardElement) {
    if (latest.current.content.elements.length >= 100) return limit();
    setError(""); setElements((items) => items.length < 100 ? [...orderedElements(items).map((item, index) => ({ ...item, zOrder: index })), { ...element, zOrder: items.length }] : items);
    setSelection([element.id]); setPanel(null); return true;
  }
  function add(kind: "text" | "color", text?: string) {
    const offset = content.elements.length % 5 * 16, width = Math.min(240, content.width), height = Math.min(150, content.height);
    const base = { id: newId(), x: clamp((content.width - width) / 2 + offset, 0, content.width - width), y: clamp((content.height - height) / 2 + offset, 0, content.height - height), width, height, zOrder: 0, locked: false };
    const element: MoodboardElement = kind === "text" ? { ...base, kind, content: (text ?? tr("moodboard.enterText")).slice(0, 5000), color: "#111111", fontSize: 32, align: "left" } : { ...base, kind, color: "#f5b7d2" };
    if (append(element)) { if (kind === "text") startText(element); else focusItem(element.id); }
  }
  function boardPoint(point?: { x: number; y: number }) { const rect = stageRef.current?.getBoundingClientRect(); return point && rect ? { x: (point.x - rect.x) / layout.scale, y: (point.y - rect.y) / layout.scale } : undefined; }
  function addUrl(srcUrl: string, src: string | null) {
    if (!src) return;
    const element: MoodboardElement = { id: newId(), kind: "image", ...imageRect({ width: 280, height: 210 }, content), zOrder: 0, locked: false, src, srcUrl, alt: "" };
    if (append(element)) focusItem(element.id);
  }
  function upload(file: File, id: string, replacement: boolean, point?: { x: number; y: number }, placeholder?: MoodboardElement) {
    if (!file.type.startsWith("image/") || file.size > maxBytes) { setError(tr("moodboard.inline.invalidImage")); return; }
    const initial = latest.current.content.elements.find((item) => item.id === id);
    const source = initial?.kind === "image" ? { src: initial.src, srcUrl: initial.srcUrl } : { src: null, srcUrl: "" };
    media.upload(file, { kind: "image", slot: `image:${id}`,
      isCurrent: (current) => current.content.elements.some((item) => item.id === id && item.kind === "image" && item.src === source.src && item.srcUrl === source.srcUrl),
      apply: (current, src) => ({ ...current, content: { ...current.content, elements: current.content.elements.map((item) => item.id === id && item.kind === "image" ? { ...item, src, srcUrl: "" } : item) } }) });
    if (replacement) return;
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); if (!mounted.current) return;
      const rect = imageRect({ width: image.naturalWidth, height: image.naturalHeight }, latest.current.content, point);
      latest.current.update((current) => ({ ...current, content: { ...current.content, elements: current.content.elements.map((item) => item.id === id && item.kind === "image" && !item.locked && !item.srcUrl && placeholder && (["x", "y", "width", "height"] as const).every(field => item[field] === placeholder[field]) ? { ...item, ...rect } : item) } }), `moodboard-image-size-${id}`);
    };
    image.onerror = () => URL.revokeObjectURL(url); image.src = url;
  }
  function addFiles(files: File[], point?: { x: number; y: number }) {
    let remaining = 100 - latest.current.content.elements.length;
    const position = boardPoint(point), added: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > maxBytes) { setError(tr("moodboard.inline.invalidImage")); continue; }
      if (!remaining--) { limit(); break; }
      const id = newId(), offset = added.length * 16;
      const drop = position ? { x: position.x + offset, y: position.y + offset } : undefined;
      const element: MoodboardElement = { id, kind: "image", ...imageRect({ width: 280, height: 210 }, content, drop), zOrder: 0, locked: false, src: null, srcUrl: "", alt: file.name.replace(/\.[^.]+$/, "").slice(0, 300) };
      append(element); upload(file, id, false, drop, element); added.push(id);
    }
    if (added.length) { setSelection(added); focusItem(added[0]); }
  }
  function duplicate() {
    if (content.elements.length + selectedElements.length > 100) { limit(); return; }
    const copies = selectedElements.map((item) => ({ ...item, id: newId(), x: clamp(item.x + 24, 0, content.width - item.width), y: clamp(item.y + 24, 0, content.height - item.height) }));
    setElements((items) => [...orderedElements(items), ...copies].map((item, zOrder) => ({ ...item, zOrder }))); setSelection(copies.map(({ id }) => id)); if (copies[0]) focusItem(copies[0].id);
  }
  function remove() { selectedElements.forEach((item) => media.cancel(`image:${item.id}`)); setElements((items) => items.filter((item) => !selection.includes(item.id))); setSelection([]); setPanel(null); workspaceRef.current?.focus(); }
  function reorder(action: "backward" | "front") { if (selected) setElements((items) => reorderElement(items, selected.id, action)); }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || typing(event.target) || event.defaultPrevented) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "a") { event.preventDefault(); setSelection(content.elements.map(({ id }) => id)); return; }
    if (event.key === "Escape") { event.preventDefault(); setSelection([]); setPanel(null); return; }
    if (!selectedElements.length) return;
    if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicate(); }
    else if (command && ["[", "]"].includes(event.key)) { event.preventDefault(); reorder(event.key === "[" ? "backward" : "front"); }
    else if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); remove(); }
    else if (event.key.startsWith("Arrow")) { event.preventDefault(); const step = event.shiftKey ? 8 : 1; setElements((items) => moveSelection(items, new Set(selection), event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0, event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0, content)); }
    else if (event.key === "Enter" && selected?.kind === "text") { event.preventDefault(); startText(selected); }
  }
  async function exportPng() { if (!stageRef.current) return; setStatus(tr("moodboard.preparingPng")); const result = await exportMoodboardPng(content, stageRef.current); if (!mounted.current) return; if (!result.ok) { setStatus(tr("moodboard.cantExportUseImagesThat", { v1: result.blocked.join("、") })); return; } downloadMoodboardPng(result.blob, boardWindow.title); setStatus(tr("moodboard.exportedAPng", { width: content.width, height: content.height })); }
  const toolbarRect = bounds ? { x: layout.x + bounds.x * layout.scale, y: layout.y + bounds.y * layout.scale, width: bounds.width * layout.scale, height: bounds.height * layout.scale } : null;
  const setGeometry = (field: GeometryField, value: number) => selected && setElements((items) => items.map((item) => item.id === selected.id ? boundedGeometry(item, field, value, content) : item));

  return <div ref={rootRef} className="moodboard-editor freeform-board-editor" data-mobile={ctx.mobile || undefined} onKeyDown={keyDown} onPaste={event => {
    if (typing(event.target)) return;
    const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); addFiles(files); return; }
    const text = event.clipboardData.getData("text/plain").trim(); if (!text) return; event.preventDefault();
    const result = normalizeImageUrl(text); if (/^https:\/\//i.test(text) && result.ok) addUrl(text, result.url); else add("text", text);
  }}>
    <div className="moodboard-toolbar" aria-label={tr("moodboard.moodboardToolbar")}>
      <button type="button" className="w98-btn" onClick={() => add("text")}>{tr("moodboard.text")}</button>
      <button type="button" className="w98-btn" onClick={() => add("color")}>{tr("moodboard.colorBlock2")}</button>
      <FileUploadButton multiple accept="image/*" className="w98-btn" onFiles={addFiles}>{tr("moodboard.image2")}</FileUploadButton>
      <button ref={urlTrigger} type="button" className="w98-btn" aria-label={tr("imageInput.addUrlImage")} aria-expanded={panel === "url"} onClick={() => setPanel(panel === "url" ? null : "url")}>URL</button>
      <label>{tr("moodboard.background")} <input aria-label={tr("moodboard.canvasBackgroundColor")} type="color" value={content.background} onChange={event => update(current => ({ ...current, content: { ...current.content, background: event.target.value } }))} /></label>
      <button type="button" className="w98-btn moodboard-export" onClick={() => void exportPng()}>{tr("moodboard.exportPng")}</button>
    </div>
    <InlineErrorBanner message={error} onClose={() => setError("")} />
    <UploadProgressList tasks={media.tasks} onRetry={media.retry} onDismiss={media.dismiss} />
    <PopoverPanel open={panel === "url"} triggerRef={urlTrigger} scopeRef={rootRef} onClose={() => setPanel(null)} label={tr("imageInput.addUrlImage")} className="moodboard-source-panel"><ImageUrlInput visibleLabel raw="" label={tr("imageInput.addUrlImage")} placeholder="https://" onCommit={addUrl} /></PopoverPanel>
    <FileDropZone ref={workspaceRef} className="moodboard-workspace" tabIndex={-1} accept="image" maxBytes={maxBytes} multiple onFiles={addFiles} onError={setError} overlayText={tr("moodboard.inline.dropImages")} onPointerDownCapture={commitGeometry} onPointerDown={event => { if (event.target === event.currentTarget) { setSelection([]); setEditing(null); setPanel(null); } }}>
      <div ref={stageRef} className="moodboard-stage editing" aria-label={tr("moodboard.moodboardCanvas")} style={{ width: content.width, height: content.height, background: content.background, left: layout.x, top: layout.y, transform: `scale(${layout.scale})` }} onPointerDown={event => { if (event.target === event.currentTarget) { setSelection([]); setEditing(null); setPanel(null); } }}>
        {orderedElements(content.elements).map(item => <div key={item.id} role="button" tabIndex={0} data-moodboard-id={item.id} aria-label={tr("moodboard.select", { v1: label(item) })} aria-pressed={selection.includes(item.id)} className={`moodboard-element ${item.kind}${selection.includes(item.id) ? " selected" : ""}${item.locked ? " locked" : ""}`} style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: item.zOrder, background: item.kind === "color" ? item.color : undefined, outlineWidth: 1 / layout.scale }} onPointerDown={event => begin(event, item)} onFocus={event => { if (event.target === event.currentTarget) setSelection(previous => previous.includes(item.id) ? previous : [item.id]); }} onDoubleClick={() => { if (item.kind === "text") startText(item); else if (item.kind === "image" && !item.locked) { setSelection([item.id]); replaceRef.current?.click(); } }}>
          {item.kind === "image" ? item.src ? <FallbackImage src={item.src} alt={item.alt} className="moodboard-image" /> : <span className="moodboard-placeholder">{tr("moodboard.image")}</span> : item.kind === "color" ? <span className="sr-only">{label(item)}</span> : editing === item.id ? <InlineTextArea ref={textRef} aria-label={tr("moodboard.text")} maxLength={5000} value={item.content} className="moodboard-inline-text" style={{ color: item.color, fontSize: item.fontSize, textAlign: item.align }} onPointerDown={event => event.stopPropagation()} onValueChange={value => patch(item.id, { content: value }, `moodboard-text-${textSession.current}`)} onBlur={() => finishText(item.id, false)} onKeyDown={event => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); finishText(item.id, true); } }} /> : <span className="moodboard-text" style={{ color: item.color, fontSize: item.fontSize, textAlign: item.align }}>{item.content}</span>}
        </div>)}
      </div>
      {toolbarRect && !editing && <div className={`moodboard-selection-box${selected?.locked ? " locked" : ""}`} style={{ left: toolbarRect.x, top: toolbarRect.y, width: toolbarRect.width, height: toolbarRect.height }}>{selected && !selected.locked && handles.map(handle => <button key={handle} type="button" tabIndex={-1} className={`moodboard-handle handle-${handle}`} aria-label={tr("moodboard.inline.resize", { handle })} onPointerDown={event => begin(event, selected, handle)} />)}</div>}
      {guides.x !== null && <div className="moodboard-guide vertical" style={{ left: layout.x + guides.x * layout.scale, top: layout.y, height: content.height * layout.scale }} />}
      {guides.y !== null && <div className="moodboard-guide horizontal" style={{ top: layout.y + guides.y * layout.scale, left: layout.x, width: content.width * layout.scale }} />}
      {toolbarRect && <FloatingSelectionBar rect={toolbarRect} containerRef={workspaceRef} hidden={dragging || !!editing} label={tr("moodboard.selectedObjectProperties")} className="moodboard-floating" mobile={ctx.mobile}>
        {selected?.kind === "text" && <><label><span className="sr-only">{tr("moodboard.textColor")}</span><input aria-label={tr("moodboard.textColor")} type="color" value={selected.color} onChange={event => patch(selected.id, { color: event.target.value })} /></label><button type="button" aria-label={tr("moodboard.inline.smallerText")} onClick={() => patch(selected.id, { fontSize: Math.max(10, selected.fontSize - 4) })}>−</button><span>{selected.fontSize}</span><button type="button" aria-label={tr("moodboard.inline.largerText")} onClick={() => patch(selected.id, { fontSize: Math.min(160, selected.fontSize + 4) })}>+</button>{(["left", "center", "right"] as const).map(align => <button type="button" key={align} aria-label={tr(align === "left" ? "document.alignLeft" : align === "center" ? "document.center" : "document.alignRight")} aria-pressed={selected.align === align} onClick={() => patch(selected.id, { align })}>{align === "left" ? "⇤" : align === "center" ? "↔" : "⇥"}</button>)}</>}
        {selected?.kind === "color" && <input aria-label={tr("moodboard.blockColor")} type="color" value={selected.color} onChange={event => patch(selected.id, { color: event.target.value })} />}
        {selected?.kind === "image" && <><button type="button" disabled={selected.locked} onClick={() => replaceRef.current?.click()}>{tr("moodboard.inline.replaceImage")}</button><button type="button" ref={imageTrigger} aria-expanded={panel === "image"} onClick={() => setPanel(panel === "image" ? null : "image")}>{tr("moodboard.imageDescription")}</button></>}
        {selected ? <><button type="button" disabled={orderedElements(content.elements)[0]?.id === selected.id} onClick={() => reorder("backward")}>{tr("moodboard.sendBackward")}</button><button type="button" disabled={orderedElements(content.elements).at(-1)?.id === selected.id} onClick={() => reorder("front")}>{tr("moodboard.bringToFront")}</button><button type="button" aria-pressed={selected.locked} onClick={() => patch(selected.id, { locked: !selected.locked })}>{tr(selected.locked ? "moodboard.unlock" : "moodboard.lock")}</button></> : <span>{tr("moodboard.inline.selectedCount", { count: selectedElements.length })}</span>}
        <button type="button" onClick={duplicate}>{tr("moodboard.duplicate")}</button><button type="button" onClick={remove}>{tr("links.delete")}</button>
      </FloatingSelectionBar>}
    </FileDropZone>
    <input hidden ref={replaceRef} type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file && selected?.kind === "image" && !selected.locked) upload(file, selected.id, true); event.target.value = ""; }} />
    <PopoverPanel open={panel === "geometry" && !!selected} triggerRef={geometryTrigger} scopeRef={rootRef} shouldCloseOnOutside={target => !target.closest(".moodboard-floating")} onClose={() => { commitGeometry(); setPanel(null); }} label={tr("moodboard.selectedObjectProperties")} className="moodboard-properties-panel">
      {selected && <fieldset ref={geometryRef} className="moodboard-geometry" key={selected.id} disabled={selected.locked}><legend>{te("rightPanel.layout")} · px</legend>{(["x", "y", "width", "height"] as const).map(field => <GeometryInput key={field} label={field === "x" ? "X" : field === "y" ? "Y" : te(field === "width" ? "rightPanel.w" : "rightPanel.h")} value={selected[field]} {...geometryRange(selected, field, content)} disabled={selected.locked} commit={value => setGeometry(field, value)} />)}</fieldset>}
    </PopoverPanel>
    <PopoverPanel open={panel === "image" && selected?.kind === "image"} triggerRef={imageTrigger} scopeRef={rootRef} onClose={() => setPanel(null)} label={tr("moodboard.imageDescription")} className="moodboard-properties-panel">
      {selected?.kind === "image" && <><label>{tr("moodboard.imageDescription")}<input maxLength={300} value={selected.alt} onChange={event => patch(selected.id, { alt: event.target.value }, `moodboard-alt-${selected.id}`)} /></label><ImageUrlInput key={selected.id} visibleLabel raw={selected.srcUrl} label={tr("document.imageUrl")} placeholder="https://" onEdit={() => media.cancel(`image:${selected.id}`)} onCommit={(srcUrl, src) => patch(selected.id, { srcUrl, src })} /></>}
    </PopoverPanel>
    <EditorStatusBar message={dragging ? tr("moodboard.inline.dragHint") : selected?.locked ? tr("moodboard.inline.lockedHint") : selectedElements.length ? tr("moodboard.inline.selectionHint") : tr("moodboard.inline.emptyHint")} problem={error || status} count={`${content.elements.length}/100`}>
      {selected && <button type="button" ref={geometryTrigger} className="moodboard-geometry-trigger" aria-label={tr("moodboard.inline.preciseGeometry")} aria-expanded={panel === "geometry"} onClick={() => setPanel(panel === "geometry" ? null : "geometry")}>{Math.round(selected.x)}, {Math.round(selected.y)} · {Math.round(selected.width)}×{Math.round(selected.height)}</button>}
    </EditorStatusBar>
  </div>;
}
