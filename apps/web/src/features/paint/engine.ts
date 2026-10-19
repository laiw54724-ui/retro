/** Local-only bitmap engine for Issue 53 W5a. No document or asset dependencies. */
export type PaintTool = "pencil" | "eraser" | "line" | "rectangle" | "ellipse" | "picker";
export type PaintPoint = { x: number; y: number };
export type PaintOptions = { tool: PaintTool; size: 1 | 2 | 4 | 8 | 16; color: string; filled?: boolean };

export const DEFAULT_SIZE = { width: 640, height: 480 } as const;
export const MAX_WIDTH = 1024;
export const MAX_HEIGHT = 768;
export const MAX_PIXELS = MAX_WIDTH * MAX_HEIGHT;
export const HISTORY_LIMIT = 8;
export const MAX_DPR = 2;
/** The decoded source is checked after decode; callers must also cap encoded bytes before decode. */
export const MAX_IMPORT_EDGE = 2048;
export const MAX_IMPORT_PIXELS = 4_194_304;

type Snapshot = { pixels: ImageData; revision: number };
type Gesture = { start: PaintPoint; last: PaintPoint; before: Snapshot; changed: boolean; options: PaintOptions };

export function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_WIDTH || height > MAX_HEIGHT || width * height > MAX_PIXELS) {
    throw new RangeError(`Canvas must be 1–${MAX_WIDTH} × 1–${MAX_HEIGHT}, at most ${MAX_PIXELS} pixels`);
  }
}

export class PaintEngine {
  readonly bitmap: HTMLCanvasElement;
  readonly display: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view: CanvasRenderingContext2D;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private gesture: Gesture | null = null;
  private nextRevision = 0;
  private revision = 0;
  private savedRevision = 0;
  private zoom = 1;
  private dpr = 1;

  constructor(display: HTMLCanvasElement, width: number = DEFAULT_SIZE.width, height: number = DEFAULT_SIZE.height) {
    validateDimensions(width, height);
    const bitmap = document.createElement("canvas");
    const ctx = bitmap.getContext("2d", { willReadFrequently: true });
    const view = display.getContext("2d");
    if (!ctx || !view) throw new Error("Canvas 2D is unavailable");
    this.bitmap = bitmap;
    this.display = display;
    this.ctx = ctx;
    this.view = view;
    bitmap.width = width;
    bitmap.height = height;
    this.setDisplay(1, window.devicePixelRatio || 1);
  }

  get width(): number { return this.bitmap.width; }
  get height(): number { return this.bitmap.height; }
  get dirty(): boolean { return this.revision !== this.savedRevision; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get active(): boolean { return this.gesture !== null; }
  get historyBytes(): number {
    return [...this.undoStack, ...this.redoStack].reduce((sum, state) => sum + state.pixels.data.byteLength, 0);
  }
  get allocationBytes(): number {
    // Exact RGBA backing-store sizes plus retained ImageData. Browser internals may use more.
    return this.width * this.height * 4 + this.display.width * this.display.height * 4 + this.historyBytes +
      (this.gesture ? this.gesture.before.pixels.data.byteLength : 0);
  }

  markSaved(): void { this.savedRevision = this.revision; }

  setDisplay(zoom: number, dpr: number): void {
    if (!Number.isFinite(zoom) || zoom < 0.5 || zoom > 4) throw new RangeError("Zoom must be 0.5–4");
    if (!Number.isFinite(dpr) || dpr <= 0) throw new RangeError("DPR must be positive");
    this.zoom = zoom;
    this.dpr = Math.min(dpr, MAX_DPR);
    this.display.width = Math.ceil(this.width * this.dpr);
    this.display.height = Math.ceil(this.height * this.dpr);
    this.display.style.width = `${this.width * zoom}px`;
    this.display.style.height = `${this.height * zoom}px`;
    this.display.style.imageRendering = "pixelated";
    this.render();
  }

  pointFromClient(clientX: number, clientY: number): PaintPoint | null {
    const rect = this.display.getBoundingClientRect();
    if (!rect.width || !rect.height || clientX < rect.left || clientY < rect.top ||
        clientX >= rect.right || clientY >= rect.bottom) return null;
    return {
      x: Math.min(this.width - 1, Math.floor((clientX - rect.left) * this.width / rect.width)),
      y: Math.min(this.height - 1, Math.floor((clientY - rect.top) * this.height / rect.height))
    };
  }

  begin(point: PaintPoint, options: PaintOptions): string | null {
    if (this.gesture) return null;
    if (options.tool === "picker") return this.pick(point);
    this.assertPoint(point);
    if (![1, 2, 4, 8, 16].includes(options.size) || !/^#[0-9a-fA-F]{6}$/.test(options.color)) {
      throw new TypeError("Invalid brush size or color");
    }
    this.gesture = { start: point, last: point, before: this.snapshot(), changed: false, options: { ...options } };
    if (options.tool === "pencil" || options.tool === "eraser") {
      this.stamp(point, options);
      this.gesture.changed = true;
      this.render();
    }
    return null;
  }

  move(point: PaintPoint): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.assertPoint(point);
    if (gesture.options.tool === "pencil" || gesture.options.tool === "eraser") {
      this.segment(gesture.last, point, gesture.options);
    } else {
      this.restore(gesture.before);
      this.shape(gesture.start, point, gesture.options);
    }
    gesture.last = point;
    gesture.changed = true;
    this.render();
  }

  /** Resume a stroke after the pointer returns from outside without bridging the gap. */
  skipTo(point: PaintPoint): void {
    if (!this.gesture) return;
    this.assertPoint(point);
    this.gesture.last = point;
  }

  /** Ends one pointer gesture as one undo transaction. */
  end(point?: PaintPoint): void {
    const gesture = this.gesture;
    if (!gesture) return;
    if (point) this.move(point);
    if (!gesture.changed && gesture.options.tool !== "pencil" && gesture.options.tool !== "eraser") {
      this.shape(gesture.start, gesture.last, gesture.options);
      gesture.changed = true;
    }
    this.gesture = null;
    if (gesture.changed) {
      this.pushUndo(gesture.before);
      this.redoStack = [];
      this.revision = ++this.nextRevision;
    }
    this.render();
  }

  cancel(): void {
    if (!this.gesture) return;
    this.restore(this.gesture.before);
    this.gesture = null;
    this.render();
  }

  undo(): boolean {
    if (this.gesture || !this.canUndo) return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop()!);
    this.render();
    return true;
  }

  redo(): boolean {
    if (this.gesture || !this.canRedo) return false;
    this.pushUndo(this.snapshot());
    this.restore(this.redoStack.pop()!);
    this.render();
    return true;
  }

  clear(): boolean {
    if (this.gesture) return false;
    const before = this.snapshot();
    if (!before.pixels.data.some((channel, index) => index % 4 === 3 && channel !== 0)) return false;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.pushUndo(before);
    this.redoStack = [];
    this.revision = ++this.nextRevision;
    this.render();
    return true;
  }

  /** Add a source as one undoable, centered contain-fit overlay without changing its original. */
  importImage(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): boolean {
    if (this.gesture) return false;
    if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 ||
        sourceWidth > MAX_IMPORT_EDGE || sourceHeight > MAX_IMPORT_EDGE || sourceWidth * sourceHeight > MAX_IMPORT_PIXELS) {
      throw new RangeError("Image dimensions exceed the Paint import limit");
    }
    const stage = document.createElement("canvas");
    stage.width = this.width;
    stage.height = this.height;
    const staging = stage.getContext("2d", { willReadFrequently: true });
    if (!staging) throw new Error("Canvas 2D is unavailable");
    const scale = Math.min(this.width / sourceWidth, this.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    staging.drawImage(source, (this.width - width) / 2, (this.height - height) / 2, width, height);
    // Readback verifies that an external source has not tainted the stage.
    // A SecurityError happens before the working bitmap or history is changed.
    staging.getImageData(0, 0, this.width, this.height);
    const before = this.snapshot();
    this.ctx.drawImage(stage, 0, 0);
    this.pushUndo(before);
    this.redoStack = [];
    this.revision = ++this.nextRevision;
    this.render();
    return true;
  }

  newCanvas(width: number = DEFAULT_SIZE.width, height: number = DEFAULT_SIZE.height): void {
    validateDimensions(width, height);
    this.cancel();
    this.bitmap.width = width;
    this.bitmap.height = height;
    this.undoStack = [];
    this.redoStack = [];
    this.revision = ++this.nextRevision;
    this.savedRevision = this.revision;
    this.setDisplay(this.zoom, this.dpr);
  }

  pick(point: PaintPoint): string | null {
    this.assertPoint(point);
    const [r, g, b, a] = this.ctx.getImageData(point.x, point.y, 1, 1).data;
    if (!a) return null;
    return `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
  }

  exportPng(): Promise<Blob> {
    if (this.gesture) return Promise.reject(new Error("Finish the active gesture before export"));
    return new Promise((resolve, reject) => this.bitmap.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
  }

  private assertPoint(point: PaintPoint): void {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 ||
        point.x >= this.width || point.y >= this.height) throw new RangeError("Point outside canvas");
  }
  private snapshot(): Snapshot {
    return { pixels: this.ctx.getImageData(0, 0, this.width, this.height), revision: this.revision };
  }
  private restore(snapshot: Snapshot): void {
    this.ctx.putImageData(snapshot.pixels, 0, 0);
    this.revision = snapshot.revision;
  }
  private pushUndo(snapshot: Snapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
  }
  private render(): void {
    this.view.clearRect(0, 0, this.display.width, this.display.height);
    this.view.imageSmoothingEnabled = false;
    this.view.drawImage(this.bitmap, 0, 0, this.display.width, this.display.height);
  }
  private stamp(point: PaintPoint, options: PaintOptions): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = options.tool === "eraser" ? "destination-out" : "source-over";
    this.ctx.fillStyle = options.tool === "eraser" ? "#000000" : options.color;
    this.ctx.fillRect(point.x - Math.floor(options.size / 2), point.y - Math.floor(options.size / 2), options.size, options.size);
    this.ctx.restore();
  }
  private segment(from: PaintPoint, to: PaintPoint, options: PaintOptions): void {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 0; i <= steps; i++) {
      const ratio = steps ? i / steps : 0;
      this.stamp({ x: Math.round(from.x + (to.x - from.x) * ratio), y: Math.round(from.y + (to.y - from.y) * ratio) }, options);
    }
  }
  private shape(from: PaintPoint, to: PaintPoint, options: PaintOptions): void {
    this.ctx.save();
    this.ctx.strokeStyle = options.color;
    this.ctx.fillStyle = options.color;
    this.ctx.lineWidth = options.size;
    const x = Math.min(from.x, to.x) + 0.5;
    const y = Math.min(from.y, to.y) + 0.5;
    const width = Math.abs(to.x - from.x);
    const height = Math.abs(to.y - from.y);
    if (options.tool === "line") {
      this.ctx.beginPath();
      this.ctx.moveTo(from.x + 0.5, from.y + 0.5);
      this.ctx.lineTo(to.x + 0.5, to.y + 0.5);
      this.ctx.stroke();
    } else if (options.tool === "rectangle") {
      if (options.filled) this.ctx.fillRect(x, y, Math.max(1, width), Math.max(1, height));
      else this.ctx.strokeRect(x, y, Math.max(1, width), Math.max(1, height));
    } else if (options.tool === "ellipse") {
      this.ctx.beginPath();
      this.ctx.ellipse(x + width / 2, y + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
      if (options.filled) this.ctx.fill(); else this.ctx.stroke();
    }
    this.ctx.restore();
  }
}
