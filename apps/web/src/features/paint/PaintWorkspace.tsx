import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DEFAULT_SIZE, PaintEngine, type PaintOptions, type PaintPoint, type PaintTool } from "./engine";
import { PaintPointerController } from "./pointer";
import { nextKeyboardCursor } from "./keyboardCursor";
import { englishPaintLabels, type PaintLabels } from "./operationLabels";
import styles from "./PaintWorkspace.module.css";

const TOOLS: PaintTool[] = ["pencil", "eraser", "line", "rectangle", "ellipse", "picker"];
const SIZES: PaintOptions["size"][] = [1, 2, 4, 8, 16];
const SWATCHES = ["#000000", "#ffffff", "#e03020", "#ef8d28", "#f3d542", "#38a858", "#208fbe", "#314eb1", "#8b55bc", "#ce5b98", "#73604c", "#808080"];
const CANVAS_PRESETS = [
  { width: 640, height: 480 },
  { width: 320, height: 240 },
  { width: 1024, height: 768 }
] as const;

type EngineStatus = { canUndo: boolean; canRedo: boolean; dirty: boolean; width: number; height: number };
const initialStatus: EngineStatus = { canUndo: false, canRedo: false, dirty: false, ...DEFAULT_SIZE };

export type PaintWorkspaceProps = {
  labels?: PaintLabels;
  initialSize?: { width: number; height: number };
  /** The engine remains owned by this host. Useful for later import/save adapters and isolated tests. */
  onEngineReady?: (engine: PaintEngine | null) => void;
};

/** Local operation UI. No document, asset, or site-save channel is present. */
export function PaintWorkspace({ labels = englishPaintLabels, initialSize = DEFAULT_SIZE, onEngineReady }: PaintWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PaintEngine | null>(null);
  const readyRef = useRef(onEngineReady);
  readyRef.current = onEngineReady;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [tool, setTool] = useState<PaintTool>("pencil");
  const [size, setSize] = useState<PaintOptions["size"]>(2);
  const [color, setColor] = useState("#000000");
  const [filled, setFilled] = useState(false);
  const [zoom, setZoom] = useState(() => typeof window !== "undefined" && window.innerWidth <= 430 ? 0.5 : 1);
  const [preset, setPreset] = useState(`${initialSize.width}x${initialSize.height}`);
  const [status, setStatus] = useState<EngineStatus>(initialStatus);
  const [notice, setNotice] = useState(labels.ready);
  const [keyboardCursor, setKeyboardCursor] = useState<PaintPoint | null>(null);
  const cursorRef = useRef<PaintPoint>({ x: 0, y: 0 });
  const keyboardDrawing = useRef(false);
  const optionsRef = useRef<PaintOptions>({ tool, size, color, filled });
  optionsRef.current = { tool, size, color, filled };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const helpId = useId();
  const statusId = useId();

  const sync = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setStatus({ canUndo: engine.canUndo, canRedo: engine.canRedo, dirty: engine.dirty, width: engine.width, height: engine.height });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PaintEngine(canvas, initialSize.width, initialSize.height);
    engineRef.current = engine;
    engine.setDisplay(zoomRef.current, window.devicePixelRatio || 1);
    cursorRef.current = { x: Math.floor(engine.width / 2), y: Math.floor(engine.height / 2) };
    const controller = new PaintPointerController(engine, () => optionsRef.current, (picked) => {
      if (picked) { setColor(picked); setNotice(labelsRef.current.picked(picked)); }
      sync();
    });
    const resize = () => engine.setDisplay(zoomRef.current, window.devicePixelRatio || 1);
    window.addEventListener("resize", resize);
    readyRef.current?.(engine);
    sync();
    return () => {
      controller.dispose();
      window.removeEventListener("resize", resize);
      readyRef.current?.(null);
      engineRef.current = null;
    };
    // The initial dimensions are read once; canvas replacement uses New canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishKeyboardStroke = (cancel: boolean) => {
    const engine = engineRef.current;
    if (!engine || !keyboardDrawing.current) return;
    if (cancel) engine.cancel(); else engine.end();
    keyboardDrawing.current = false;
    sync();
  };

  const undo = () => { finishKeyboardStroke(true); engineRef.current?.undo(); sync(); };
  const redo = () => { finishKeyboardStroke(true); engineRef.current?.redo(); sync(); };
  const clear = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if ((engine.dirty || engine.active) && !window.confirm(labels.clearConfirm)) return;
    finishKeyboardStroke(true);
    if (engine.clear()) setNotice(labels.cleared);
    sync();
  };
  const newCanvas = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if ((engine.dirty || engine.active) && !window.confirm(labels.newConfirm)) return;
    const [width, height] = preset.split("x").map(Number);
    finishKeyboardStroke(true);
    engine.newCanvas(width, height);
    cursorRef.current = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
    setKeyboardCursor(null);
    setNotice(labels.newReady);
    sync();
  };
  const exportPng = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    finishKeyboardStroke(false);
    try {
      const blob = await engine.exportPng();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `paint-${engine.width}x${engine.height}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(labels.exported);
    } catch {
      setNotice(labels.exportFailed);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable;
    const command = event.metaKey || event.ctrlKey;
    if (command && !editable) {
      const key = event.key.toLowerCase();
      if (key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (key === "y") { event.preventDefault(); redo(); return; }
      if (key === "e") { event.preventDefault(); void exportPng(); return; }
    }
    if (target !== canvasRef.current || command || event.altKey) return;
    const engine = engineRef.current;
    if (!engine) return;
    const current = cursorRef.current;
    const next = nextKeyboardCursor(current, event.key, event.shiftKey, engine.width, engine.height);
    if (next) {
      event.preventDefault();
      cursorRef.current = next;
      setKeyboardCursor(next);
      if (keyboardDrawing.current) engine.move(next);
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); finishKeyboardStroke(true); return; }
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    setKeyboardCursor(current);
    if (tool === "picker") {
      const picked = engine.pick(current);
      if (picked) { setColor(picked); setNotice(labels.picked(picked)); }
    } else if (keyboardDrawing.current) {
      finishKeyboardStroke(false);
    } else {
      engine.begin(current, optionsRef.current);
      keyboardDrawing.current = true;
    }
    sync();
  };

  const announcement = `${notice} · ${status.width}×${status.height} · ${labels.tool[tool]} · ${zoom * 100}% · ${status.dirty ? labels.changed : labels.clean}` +
    (keyboardCursor ? ` · ${labels.cursor(keyboardCursor.x, keyboardCursor.y)}${keyboardDrawing.current ? ` · ${labels.drawing}` : ""}` : "");

  return <section className={styles.workspace} aria-label={labels.title} onKeyDown={onKeyDown}>
    <div className={styles.commandBar}>
      <label>{labels.canvasSize}<select value={preset} onChange={(event) => setPreset(event.target.value)}>
        {!CANVAS_PRESETS.some((item) => `${item.width}x${item.height}` === preset) ? <option value={preset}>{preset.replace("x", " × ")}</option> : null}
        {CANVAS_PRESETS.map((item) => <option key={`${item.width}x${item.height}`} value={`${item.width}x${item.height}`}>{item.width} × {item.height}</option>)}
      </select></label>
      <button type="button" onClick={newCanvas}>{labels.newCanvas}</button>
      <button type="button" onClick={undo} disabled={!status.canUndo} aria-keyshortcuts="Control+Z Meta+Z">{labels.undo}</button>
      <button type="button" onClick={redo} disabled={!status.canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">{labels.redo}</button>
      <button type="button" onClick={clear}>{labels.clear}</button>
      <button type="button" onClick={() => void exportPng()} aria-keyshortcuts="Control+E Meta+E">{labels.exportPng}</button>
    </div>
    <div className={styles.body}>
      <div className={styles.toolBar} role="toolbar" aria-label={labels.tools} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {TOOLS.map((item) => <button key={item} type="button" aria-pressed={tool === item} onClick={() => {
          finishKeyboardStroke(true); setTool(item);
        }}>{labels.tool[item]}</button>)}
      </div>
      <div className={styles.center}>
        <div className={styles.settings}>
          <label>{labels.brushSize}<select value={size} onChange={(event) => setSize(Number(event.target.value) as PaintOptions["size"])}>
            {SIZES.map((value) => <option key={value} value={value}>{value} px</option>)}
          </select></label>
          <label>{labels.color}<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          <label><input type="checkbox" checked={filled} disabled={tool !== "rectangle" && tool !== "ellipse"} onChange={(event) => setFilled(event.target.checked)} />{labels.filled}</label>
          <label>{labels.zoom}<select value={zoom} onChange={(event) => {
            const value = Number(event.target.value);
            setZoom(value);
            engineRef.current?.setDisplay(value, window.devicePixelRatio || 1);
          }}><option value={0.5}>50%</option><option value={1}>100%</option><option value={2}>200%</option><option value={4}>400%</option></select></label>
        </div>
        <p id={helpId} className={styles.help}>{labels.keyboardHelp}</p>
        <div className={styles.viewport}>
          <div className={styles.canvasStage} style={{ width: status.width * zoom, height: status.height * zoom }}>
            <canvas ref={canvasRef} tabIndex={0} aria-label={labels.title} aria-describedby={`${helpId} ${statusId}`}
              onBlur={() => { finishKeyboardStroke(true); setKeyboardCursor(null); }}
              onPointerDownCapture={() => { finishKeyboardStroke(true); setKeyboardCursor(null); }} />
            {keyboardCursor ? <span className={styles.keyboardCursor} style={{ left: (keyboardCursor.x + .5) * zoom, top: (keyboardCursor.y + .5) * zoom }} aria-hidden="true" /> : null}
          </div>
        </div>
        <div className={styles.palette} role="group" aria-label={labels.palette}>
          {SWATCHES.map((swatch) => <button key={swatch} type="button" className={styles.swatch} style={{ backgroundColor: swatch }}
            aria-label={labels.swatch(swatch)} aria-pressed={color.toLowerCase() === swatch} onClick={() => setColor(swatch)} />)}
        </div>
      </div>
    </div>
    <p id={statusId} className={styles.status} role="status" aria-live="polite">{announcement}</p>
    <p className={styles.localOnly}>{labels.localOnly}</p>
  </section>;
}
