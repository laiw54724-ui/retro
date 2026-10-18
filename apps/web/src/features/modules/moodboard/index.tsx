import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { i18n } from "../../../i18n";
import { useTranslation } from "react-i18next";
import type { MoodboardElement } from "@retrodesk/shared";
import { FilePick, SafeImg } from "../ui";
import type { ModuleProps } from "../types";
import { downloadMoodboardPng, exportMoodboardPng } from "./export";
import { boundedGeometry, clamp, geometryRange, orderedElements, reorderElement, type GeometryField } from "./editing";
import { GeometryInput } from "./GeometryInput";
import "./moodboard.css";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const label = (element: MoodboardElement) => element.kind === "text" ? i18n.t("modules:moodboard.textLabel", { content: element.content || i18n.t("modules:moodboard.blank") }) : element.kind === "image" ? i18n.t("modules:moodboard.imageLabel", { alt: element.alt || i18n.t("modules:moodboard.untitled") }) : i18n.t("modules:moodboard.colorBlock", { color: element.color });

function ElementContent({ element }: { element: MoodboardElement }) {
  const { t: tr } = useTranslation("modules");
  if (element.kind === "image") return element.src ? <SafeImg src={element.src} alt={element.alt} className="moodboard-image" /> : <span className="moodboard-placeholder">{tr("moodboard.image")}</span>;
  if (element.kind === "color") return <span className="sr-only">{label(element)}</span>;
  return <span className="moodboard-text" style={{ color: element.color, fontSize: `${element.fontSize}px`, textAlign: element.align }}>{element.content}</span>;
}

function geometry(element: MoodboardElement, width: number, height: number) {
  return {
    left: `${element.x / width * 100}%`, top: `${element.y / height * 100}%`,
    width: `${element.width / width * 100}%`, height: `${element.height / height * 100}%`,
    zIndex: element.zOrder, background: element.kind === "color" ? element.color : undefined
  };
}

export function MoodboardView({ window }: ModuleProps<"moodboard">) {
  const { t: tr } = useTranslation("modules");
  const { width, height, background, elements } = window.content;
  return (
    <div className="moodboard-view">
      <div className="moodboard-stage" style={{ aspectRatio: `${width}/${height}`, background }} aria-label={tr("moodboard.moodboardCanvas")}>
        {orderedElements(elements).map((element) => <div key={element.id} data-moodboard-id={element.id} className={`moodboard-element ${element.kind}`} style={geometry(element, width, height)}><ElementContent element={element} /></div>)}
      </div>
      <ul className="sr-only" aria-label={tr("moodboard.moodboardContent")}>{elements.map((element) => <li key={element.id}>{label(element)}</li>)}</ul>
    </div>
  );
}

export function MoodboardInlineEditor({ window, ctx, update }: ModuleProps<"moodboard">) {
  const { t: tr } = useTranslation("modules");
  const { t: te } = useTranslation("editor");
  const [selectedId, setSelectedId] = useState<string | null>(window.content.elements[0]?.id ?? null);
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const [limitStatus, setLimitStatus] = useState("");
  const content = window.content;
  const selected = content.elements.find((element) => element.id === selectedId) ?? null;
  const setElements = (recipe: (elements: MoodboardElement[]) => MoodboardElement[], historyKey?: string) => update((current) => ({ ...current, content: { ...current.content, elements: recipe(current.content.elements) } }), historyKey);
  const patch = (id: string, change: Partial<MoodboardElement>, key?: string) => setElements((elements) => elements.map((element) => element.id === id ? { ...element, ...change } as MoodboardElement : element), key);
  const topZ = Math.max(0, ...content.elements.map((element) => element.zOrder));

  function setGeometry(field: GeometryField, value: number) {
    if (!selected) return;
    setElements((elements) => elements.map((element) => element.id === selected.id ? boundedGeometry(element, field, value, content) : element));
  }
  function reorder(action: "backward" | "front") {
    if (selected) setElements((elements) => reorderElement(elements, selected.id, action));
  }

  function add(kind: MoodboardElement["kind"]) {
    if (content.elements.length >= 100) { setLimitStatus(tr("moodboard.theMoodboardHasReachedIts")); return; }
    setLimitStatus("");
    const base = { id: newId(), x: 80, y: 70, width: 240, height: 150, zOrder: topZ + 1, locked: false };
    const element: MoodboardElement = kind === "text"
      ? { ...base, kind, content: tr("moodboard.enterText"), color: "#111111", fontSize: 32, align: "left" }
      : kind === "color" ? { ...base, kind, color: "#f5b7d2" }
      : { ...base, kind, src: null, srcUrl: "", alt: "" };
    setElements((elements) => [...elements, element]); setSelectedId(element.id);
  }
  async function addImage(file: File) {
    if (content.elements.length >= 100) { setLimitStatus(tr("moodboard.theMoodboardHasReachedIts")); return; }
    setLimitStatus("");
    const stored = await ctx.upload?.(file, "image");
    if (!stored) return;
    const element: MoodboardElement = { id: newId(), kind: "image", x: 80, y: 70, width: 280, height: 210, zOrder: topZ + 1, locked: false, src: stored, srcUrl: "", alt: file.name.replace(/\.[^.]+$/, "") };
    setElements((elements) => [...elements, element]); setSelectedId(element.id);
  }
  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>, element: MoodboardElement) {
    event.stopPropagation(); setSelectedId(element.id);
    if (element.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: element.id, startX: event.clientX, startY: event.clientY, x: element.x, y: element.y };
  }
  function pointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const stage = event.currentTarget.parentElement?.getBoundingClientRect();
    const element = content.elements.find((item) => item.id === active.id);
    if (!stage || !element) return;
    const x = clamp(active.x + (event.clientX - active.startX) * content.width / stage.width, 0, content.width - element.width);
    const y = clamp(active.y + (event.clientY - active.startY) * content.height / stage.height, 0, content.height - element.height);
    patch(active.id, { x: Math.round(x), y: Math.round(y) }, `moodboard-drag-${active.id}`);
  }
  function duplicate(element: MoodboardElement) {
    if (content.elements.length >= 100) { setLimitStatus(tr("moodboard.theMoodboardHasReachedIts2")); return; }
    setLimitStatus("");
    const next = { ...element, id: newId(), x: clamp(element.x + 24, 0, content.width - element.width), y: clamp(element.y + 24, 0, content.height - element.height), zOrder: topZ + 1 };
    setElements((elements) => [...elements, next]); setSelectedId(next.id);
  }
  function nudge(dx: number, dy: number) {
    if (!selected || selected.locked) return;
    patch(selected.id, { x: clamp(selected.x + dx, 0, content.width - selected.width), y: clamp(selected.y + dy, 0, content.height - selected.height) });
  }
  function size(delta: number) {
    if (!selected || selected.locked) return;
    patch(selected.id, { width: clamp(selected.width + delta, 24, content.width - selected.x), height: clamp(selected.height + delta, 24, content.height - selected.y) });
  }
  async function exportPng() {
    if (!stageRef.current) return;
    setExportStatus(tr("moodboard.preparingPng"));
    const result = await exportMoodboardPng(content, stageRef.current);
    if (!result.ok) { setExportStatus(tr("moodboard.cantExportUseImagesThat", { v1: result.blocked.join("、") })); return; }
    downloadMoodboardPng(result.blob, window.title);
    setExportStatus(tr("moodboard.exportedAPng", { width: content.width, height: content.height }));
  }

  return (
    <div className="moodboard-editor">
      <div className="moodboard-toolbar" aria-label={tr("moodboard.moodboardToolbar")}>
        <button type="button" className="w98-btn" onClick={() => add("text")}>{tr("moodboard.text")}</button>
        <button type="button" className="w98-btn" onClick={() => add("color")}>{tr("moodboard.colorBlock2")}</button>
        <FilePick className="w98-btn" onFiles={(files) => void addImage(files[0])}>{tr("moodboard.image2")}</FilePick>
        <label>{tr("moodboard.background")} <input aria-label={tr("moodboard.canvasBackgroundColor")} type="color" value={content.background} onChange={(event) => update((current) => ({ ...current, content: { ...current.content, background: event.target.value } }))} /></label>
        <button type="button" className="w98-btn" onClick={() => void exportPng()}>{tr("moodboard.exportPng")}</button>
        <span>{content.elements.length}/100</span>
        {limitStatus ? <span role="status" className="moodboard-limit-status">{limitStatus}</span> : null}
        {exportStatus ? <span role="status" className="moodboard-export-status">{exportStatus}</span> : null}
      </div>
      <div className="moodboard-workspace">
        <div ref={stageRef} className="moodboard-stage editing" style={{ aspectRatio: `${content.width}/${content.height}`, background: content.background }} onPointerDown={() => setSelectedId(null)}>
          {orderedElements(content.elements).map((element) => <button key={element.id} type="button" data-moodboard-id={element.id} aria-label={tr("moodboard.select", { v1: label(element) })} aria-pressed={selectedId === element.id} className={`moodboard-element ${element.kind}${selectedId === element.id ? " selected" : ""}${element.locked ? " locked" : ""}`} style={geometry(element, content.width, content.height)} onClick={() => setSelectedId(element.id)} onPointerDown={(event) => pointerDown(event, element)} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><ElementContent element={element} /></button>)}
        </div>
        <div className="moodboard-sidebar">
          <section className="moodboard-layers">
            <strong>{tr("moodboard.moodboardContent")}</strong>
            <ol aria-label={tr("moodboard.moodboardContent")}>
              {orderedElements(content.elements).reverse().map((element, index) => <li key={element.id}>
                <button type="button" className="w98-btn moodboard-layer" aria-label={label(element)} aria-pressed={selectedId === element.id} onClick={() => setSelectedId(element.id)}>
                  <span className="moodboard-layer-rank" aria-hidden="true">{content.elements.length - index}</span>
                  <span className="moodboard-layer-name">{label(element)}</span>
                  {element.locked ? <span role="img" aria-label={tr("moodboard.lock")}>🔒</span> : null}
                </button>
              </li>)}
            </ol>
          </section>
          <aside className="moodboard-inspector" aria-label={tr("moodboard.selectedObjectProperties")}>
            {selected ? <>
              <strong>{label(selected)}</strong>
              <fieldset className="moodboard-geometry" key={selected.id} disabled={selected.locked}>
                <legend>{te("rightPanel.layout")} · px</legend>
                {(["x", "y", "width", "height"] as const).map((field) => <GeometryInput key={field}
                  label={field === "x" ? "X" : field === "y" ? "Y" : te(field === "width" ? "rightPanel.w" : "rightPanel.h")}
                  value={selected[field]} {...geometryRange(selected, field, content)} disabled={selected.locked} commit={(value) => setGeometry(field, value)} />)}
              </fieldset>
              {selected.kind === "text" ? <><label>{tr("moodboard.text")}<textarea value={selected.content} onChange={(event) => patch(selected.id, { content: event.target.value }, `moodboard-text-${selected.id}`)} /></label><label>{tr("moodboard.textColor")}<input type="color" value={selected.color} onChange={(event) => patch(selected.id, { color: event.target.value })} /></label><label>{tr("moodboard.fontSize")}<input type="number" min="10" max="160" value={selected.fontSize} onChange={(event) => patch(selected.id, { fontSize: clamp(Number(event.target.value), 10, 160) })} /></label></> : null}
              {selected.kind === "text" ? <div className="moodboard-alignment">
                {(["left", "center", "right"] as const).map((align) => <button type="button" key={align} className="w98-btn" aria-label={tr(align === "left" ? "document.alignLeft" : align === "center" ? "document.center" : "document.alignRight")} aria-pressed={selected.align === align} onClick={() => patch(selected.id, { align })}>{align === "left" ? "⇤" : align === "center" ? "↔" : "⇥"}</button>)}
              </div> : null}
              {selected.kind === "color" ? <label>{tr("moodboard.blockColor")}<input type="color" value={selected.color} onChange={(event) => patch(selected.id, { color: event.target.value })} /></label> : null}
              {selected.kind === "image" ? <label>{tr("moodboard.imageDescription")}<input value={selected.alt} onChange={(event) => patch(selected.id, { alt: event.target.value }, `moodboard-alt-${selected.id}`)} /></label> : null}
              <div className="moodboard-nudge"><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => nudge(0, -8)}>↑</button><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => nudge(-8, 0)}>←</button><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => nudge(8, 0)}>→</button><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => nudge(0, 8)}>↓</button></div>
              <div className="moodboard-actions"><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => size(-16)}>{tr("moodboard.shrink")}</button><button type="button" className="w98-btn" disabled={selected.locked} onClick={() => size(16)}>{tr("moodboard.enlarge")}</button><button type="button" className="w98-btn" disabled={orderedElements(content.elements)[0]?.id === selected.id} onClick={() => reorder("backward")}>{tr("moodboard.sendBackward")}</button><button type="button" className="w98-btn" disabled={orderedElements(content.elements).at(-1)?.id === selected.id} onClick={() => reorder("front")}>{tr("moodboard.bringToFront")}</button><button type="button" className="w98-btn" aria-pressed={selected.locked} onClick={() => patch(selected.id, { locked: !selected.locked })}>{selected.locked ? tr("moodboard.unlock") : tr("moodboard.lock")}</button><button type="button" className="w98-btn" onClick={() => duplicate(selected)}>{tr("moodboard.duplicate")}</button><button type="button" className="w98-btn danger" onClick={() => { setElements((elements) => elements.filter((element) => element.id !== selected.id)); setSelectedId(null); }}>{tr("links.delete")}</button></div>
            </> : <p>{tr("moodboard.clickAnObjectOnThe")}</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}
