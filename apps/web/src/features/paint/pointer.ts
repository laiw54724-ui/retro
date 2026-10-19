import { PaintEngine, type PaintOptions } from "./engine";

/** Captures one primary pointer; cancellation restores the pre-gesture bitmap. */
export class PaintPointerController {
  private pointerId: number | null = null;
  private outside = false;

  constructor(
    private readonly engine: PaintEngine,
    private readonly options: () => PaintOptions,
    private readonly onCommit: (pickedColor: string | null) => void
  ) {
    engine.display.style.touchAction = "none";
    engine.display.addEventListener("pointerdown", this.down);
    engine.display.addEventListener("pointermove", this.move);
    engine.display.addEventListener("pointerup", this.up);
    engine.display.addEventListener("pointercancel", this.cancel);
    engine.display.addEventListener("lostpointercapture", this.cancel);
  }

  dispose(): void {
    this.cancel();
    const canvas = this.engine.display;
    canvas.removeEventListener("pointerdown", this.down);
    canvas.removeEventListener("pointermove", this.move);
    canvas.removeEventListener("pointerup", this.up);
    canvas.removeEventListener("pointercancel", this.cancel);
    canvas.removeEventListener("lostpointercapture", this.cancel);
  }

  private down = (event: PointerEvent): void => {
    if (this.pointerId !== null || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    const point = this.engine.pointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const options = this.options();
    const picked = this.engine.begin(point, options);
    if (options.tool === "picker") {
      this.onCommit(picked);
      return;
    }
    this.pointerId = event.pointerId;
    this.outside = false;
    this.engine.display.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const point = this.engine.pointFromClient(event.clientX, event.clientY);
    if (!point) {
      this.outside = true;
      return;
    }
    if (this.outside) this.engine.skipTo(point);
    else this.engine.move(point);
    this.outside = false;
    event.preventDefault();
  };

  private up = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const point = this.engine.pointFromClient(event.clientX, event.clientY);
    this.engine.end(this.outside ? undefined : point ?? undefined);
    this.pointerId = null;
    this.outside = false;
    if (this.engine.display.hasPointerCapture(event.pointerId)) this.engine.display.releasePointerCapture(event.pointerId);
    this.onCommit(null);
    event.preventDefault();
  };

  private cancel = (): void => {
    if (this.pointerId === null) return;
    const id = this.pointerId;
    this.pointerId = null;
    this.outside = false;
    this.engine.cancel();
    if (this.engine.display.hasPointerCapture(id)) this.engine.display.releasePointerCapture(id);
    this.onCommit(null);
  };
}
