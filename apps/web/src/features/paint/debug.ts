import { PaintEngine, DEFAULT_SIZE, MAX_WIDTH, MAX_HEIGHT, type PaintOptions, type PaintTool } from "./engine";
import { PaintPointerController } from "./pointer";
import "./debug.css";

const root = document.querySelector<HTMLDivElement>("#paint-debug-root")!;
root.innerHTML = `
  <h1>Paint W5a debug fixture</h1>
  <p>Local canvas engine only. Changes live in this tab; Export PNG downloads a local file.</p>
  <div class="controls" id="tools" aria-label="Drawing tools"></div>
  <div class="controls">
    <label>Brush <select id="size"><option>1</option><option>2</option><option>4</option><option>8</option><option>16</option></select></label>
    <label>Color <input id="color" type="color" value="#212121"></label>
    <label><input id="filled" type="checkbox"> Filled shape</label>
    <label>Zoom <select id="zoom"><option value="0.5">50%</option><option value="1" selected>100%</option><option value="2">200%</option><option value="4">400%</option></select></label>
  </div>
  <div class="controls">
    <button id="undo" type="button">Undo</button><button id="redo" type="button">Redo</button>
    <button id="clear" type="button">Clear</button>
    <label>Width <input id="width" type="number" min="1" max="${MAX_WIDTH}" value="${DEFAULT_SIZE.width}"></label>
    <label>Height <input id="height" type="number" min="1" max="${MAX_HEIGHT}" value="${DEFAULT_SIZE.height}"></label>
    <button id="new" type="button">New canvas</button><button id="export" type="button">Export PNG</button>
  </div>
  <div class="viewport"><canvas id="canvas" tabindex="0" aria-label="Paint canvas"></canvas></div>
  <div id="status" role="status"></div>`;

const get = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
const canvas = get<HTMLCanvasElement>("canvas");
const engine = new PaintEngine(canvas);
const color = get<HTMLInputElement>("color");
const size = get<HTMLSelectElement>("size");
const filled = get<HTMLInputElement>("filled");
const zoom = get<HTMLSelectElement>("zoom");
const status = get<HTMLDivElement>("status");
let tool: PaintTool = "pencil";
let note = "Ready";

const tools: PaintTool[] = ["pencil", "eraser", "line", "rectangle", "ellipse", "picker"];
const toolBar = get<HTMLDivElement>("tools");
for (const name of tools) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = `tool-${name}`;
  button.textContent = name[0].toUpperCase() + name.slice(1);
  button.setAttribute("aria-pressed", String(tool === name));
  button.addEventListener("click", () => {
    tool = name;
    for (const item of toolBar.querySelectorAll("button")) item.setAttribute("aria-pressed", String(item === button));
    update();
  });
  toolBar.append(button);
}

function update(): void {
  get<HTMLButtonElement>("undo").disabled = !engine.canUndo;
  get<HTMLButtonElement>("redo").disabled = !engine.canRedo;
  status.textContent = `${note} · ${engine.width}×${engine.height} · ${tool} · ${engine.dirty ? "Unsaved" : "Clean"} · history ${engine.historyBytes} bytes`;
}

const controller = new PaintPointerController(engine,
  (): PaintOptions => ({ tool, size: Number(size.value) as PaintOptions["size"], color: color.value, filled: filled.checked }),
  picked => {
    if (picked) { color.value = picked; note = `Picked ${picked}`; }
    update();
  });

zoom.addEventListener("change", () => { engine.setDisplay(Number(zoom.value), window.devicePixelRatio || 1); update(); });
get<HTMLButtonElement>("undo").addEventListener("click", () => { engine.undo(); update(); });
get<HTMLButtonElement>("redo").addEventListener("click", () => { engine.redo(); update(); });
get<HTMLButtonElement>("clear").addEventListener("click", () => {
  if (engine.dirty && !window.confirm("Discard unsaved changes by clearing the canvas?")) return;
  engine.clear(); note = "Canvas cleared"; update();
});
get<HTMLButtonElement>("new").addEventListener("click", () => {
  if (engine.dirty && !window.confirm("Discard unsaved changes and create a new canvas?")) return;
  try {
    engine.newCanvas(Number(get<HTMLInputElement>("width").value), Number(get<HTMLInputElement>("height").value));
    note = "New canvas";
  } catch (error) { note = error instanceof Error ? error.message : "Invalid size"; }
  update();
});
get<HTMLButtonElement>("export").addEventListener("click", async () => {
  try {
    const blob = await engine.exportPng();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paint-${engine.width}x${engine.height}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    note = `Exported ${blob.size} bytes locally`;
  } catch (error) { note = error instanceof Error ? error.message : "Export failed"; }
  update();
});
document.addEventListener("keydown", event => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" ||
      event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement) return;
  event.preventDefault();
  if (event.shiftKey) engine.redo(); else engine.undo();
  update();
});
window.addEventListener("resize", () => engine.setDisplay(Number(zoom.value), window.devicePixelRatio || 1));
window.addEventListener("beforeunload", event => { if (engine.dirty) event.preventDefault(); });
update();

// Deliberately scoped to this debug page; browser tests inspect exact bitmap pixels and allocations.
Object.assign(window, { paintDebug: { engine, controller } });
