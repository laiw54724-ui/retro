import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { MoodboardElement } from "@retrodesk/shared";
import { FilePick, SafeImg } from "../ui";
import type { ModuleProps } from "../types";
import { downloadMoodboardPng, exportMoodboardPng } from "./export";

const newId = () => globalThis.crypto?.randomUUID?.() ?? `board-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const label = (element: MoodboardElement) => element.kind === "text" ? `文字：${element.content || "空白"}` : element.kind === "image" ? `圖片：${element.alt || "未命名"}` : `色塊 ${element.color}`;

function ElementContent({ element }: { element: MoodboardElement }) {
  if (element.kind === "image") return element.src ? <SafeImg src={element.src} alt={element.alt} className="moodboard-image" /> : <span className="moodboard-placeholder">圖片</span>;
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
  const { width, height, background, elements } = window.content;
  return (
    <div className="moodboard-view">
      <div className="moodboard-stage" style={{ aspectRatio: `${width}/${height}`, background }} aria-label="Moodboard 畫布">
        {[...elements].sort((a, b) => a.zOrder - b.zOrder).map((element) => <div key={element.id} data-moodboard-id={element.id} className={`moodboard-element ${element.kind}`} style={geometry(element, width, height)}><ElementContent element={element} /></div>)}
      </div>
      <ul className="sr-only" aria-label="Moodboard 內容">{elements.map((element) => <li key={element.id}>{label(element)}</li>)}</ul>
    </div>
  );
}

export function MoodboardInlineEditor({ window, ctx, update }: ModuleProps<"moodboard">) {
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

  function add(kind: MoodboardElement["kind"]) {
    if (content.elements.length >= 100) { setLimitStatus("Moodboard 已達 100 個物件上限；請先刪除物件再新增。"); return; }
    setLimitStatus("");
    const base = { id: newId(), x: 80, y: 70, width: 240, height: 150, zOrder: topZ + 1, locked: false };
    const element: MoodboardElement = kind === "text"
      ? { ...base, kind, content: "輸入文字", color: "#111111", fontSize: 32, align: "left" }
      : kind === "color" ? { ...base, kind, color: "#f5b7d2" }
      : { ...base, kind, src: null, srcUrl: "", alt: "" };
    setElements((elements) => [...elements, element]); setSelectedId(element.id);
  }
  async function addImage(file: File) {
    if (content.elements.length >= 100) { setLimitStatus("Moodboard 已達 100 個物件上限；請先刪除物件再新增。"); return; }
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
    if (content.elements.length >= 100) { setLimitStatus("Moodboard 已達 100 個物件上限；請先刪除物件再複製。"); return; }
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
    setExportStatus("正在準備 PNG…");
    const result = await exportMoodboardPng(content, stageRef.current);
    if (!result.ok) { setExportStatus(`無法匯出：${result.blocked.join("、")}。請改用已上傳且允許匯出的圖片。`); return; }
    downloadMoodboardPng(result.blob, window.title);
    setExportStatus(`已匯出 ${content.width}×${content.height} PNG`);
  }

  return (
    <div className="moodboard-editor">
      <div className="moodboard-toolbar" aria-label="Moodboard 工具列">
        <button type="button" className="w98-btn" onClick={() => add("text")}>文字</button>
        <button type="button" className="w98-btn" onClick={() => add("color")}>色塊</button>
        <FilePick className="w98-btn" onFiles={(files) => void addImage(files[0])}>圖片…</FilePick>
        <label>背景 <input aria-label="畫布背景色" type="color" value={content.background} onChange={(event) => update((current) => ({ ...current, content: { ...current.content, background: event.target.value } }))} /></label>
        <button type="button" className="w98-btn" onClick={() => void exportPng()}>匯出 PNG</button>
        <span>{content.elements.length}/100</span>
        {limitStatus ? <span role="status" className="moodboard-limit-status">{limitStatus}</span> : null}
        {exportStatus ? <span role="status" className="moodboard-export-status">{exportStatus}</span> : null}
      </div>
      <div className="moodboard-workspace">
        <div ref={stageRef} className="moodboard-stage editing" style={{ aspectRatio: `${content.width}/${content.height}`, background: content.background }} onPointerDown={() => setSelectedId(null)}>
          {[...content.elements].sort((a, b) => a.zOrder - b.zOrder).map((element) => <button key={element.id} type="button" data-moodboard-id={element.id} aria-label={`選取${label(element)}`} aria-pressed={selectedId === element.id} className={`moodboard-element ${element.kind}${selectedId === element.id ? " selected" : ""}${element.locked ? " locked" : ""}`} style={geometry(element, content.width, content.height)} onPointerDown={(event) => pointerDown(event, element)} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><ElementContent element={element} /></button>)}
        </div>
        <aside className="moodboard-inspector" aria-label="選取物件屬性">
          {selected ? <>
            <strong>{label(selected)}</strong>
            {selected.kind === "text" ? <><label>文字<textarea value={selected.content} onChange={(event) => patch(selected.id, { content: event.target.value }, `moodboard-text-${selected.id}`)} /></label><label>文字色<input type="color" value={selected.color} onChange={(event) => patch(selected.id, { color: event.target.value })} /></label><label>字級<input type="number" min="10" max="160" value={selected.fontSize} onChange={(event) => patch(selected.id, { fontSize: clamp(Number(event.target.value), 10, 160) })} /></label></> : null}
            {selected.kind === "color" ? <label>色塊顏色<input type="color" value={selected.color} onChange={(event) => patch(selected.id, { color: event.target.value })} /></label> : null}
            {selected.kind === "image" ? <label>圖片說明<input value={selected.alt} onChange={(event) => patch(selected.id, { alt: event.target.value }, `moodboard-alt-${selected.id}`)} /></label> : null}
            <div className="moodboard-nudge"><button type="button" className="w98-btn" onClick={() => nudge(0, -8)}>↑</button><button type="button" className="w98-btn" onClick={() => nudge(-8, 0)}>←</button><button type="button" className="w98-btn" onClick={() => nudge(8, 0)}>→</button><button type="button" className="w98-btn" onClick={() => nudge(0, 8)}>↓</button></div>
            <div className="moodboard-actions"><button type="button" className="w98-btn" onClick={() => size(-16)}>縮小</button><button type="button" className="w98-btn" onClick={() => size(16)}>放大</button><button type="button" className="w98-btn" onClick={() => patch(selected.id, { zOrder: Math.max(0, selected.zOrder - 1) })}>下移一層</button><button type="button" className="w98-btn" onClick={() => patch(selected.id, { zOrder: topZ + 1 })}>移到最前</button><button type="button" className="w98-btn" aria-pressed={selected.locked} onClick={() => patch(selected.id, { locked: !selected.locked })}>{selected.locked ? "解除鎖定" : "鎖定"}</button><button type="button" className="w98-btn" onClick={() => duplicate(selected)}>複製</button><button type="button" className="w98-btn danger" onClick={() => { setElements((elements) => elements.filter((element) => element.id !== selected.id)); setSelectedId(null); }}>刪除</button></div>
          </> : <p>點選畫布上的物件進行編輯。</p>}
        </aside>
      </div>
    </div>
  );
}
