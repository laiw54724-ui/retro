import { useRef, type PointerEvent } from "react";
import type { ImageCrop } from "@retrodesk/shared";
import { AvatarImage, DEFAULT_CROP } from "../../components/AvatarImage";
import { RetroButton } from "../../components/RetroButton";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Drag to reposition, slider to zoom. Non-destructive: only stores x/y/zoom. */
export function CropEditor({ src, crop = DEFAULT_CROP, onChange }: { src: string; crop?: ImageCrop; onChange: (crop: ImageCrop) => void }) {
  const drag = useRef<{ startX: number; startY: number; x: number; y: number; size: number } | null>(null);

  function down(event: PointerEvent<HTMLDivElement>) {
    const size = event.currentTarget.clientWidth;
    drag.current = { startX: event.clientX, startY: event.clientY, x: crop.x, y: crop.y, size };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) return;
    // Dragging right moves the picture right, i.e. shows more of its left side.
    const dx = ((event.clientX - start.startX) / start.size) * 100;
    const dy = ((event.clientY - start.startY) / start.size) * 100;
    onChange({ ...crop, x: Math.round(clamp(start.x - dx, 0, 100)), y: Math.round(clamp(start.y - dy, 0, 100)) });
  }

  return (
    <div className="crop-editor">
      <div className="crop-frame" onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <AvatarImage src={src} crop={crop} />
      </div>
      <small>拖曳調整位置，用滑桿縮放。</small>
      <label className="crop-zoom">縮放
        <input type="range" min={1} max={4} step={0.05} value={crop.zoom} onChange={(event) => onChange({ ...crop, zoom: Number(event.target.value) })} />
      </label>
      <RetroButton type="button" onClick={() => onChange(DEFAULT_CROP)}>重設位置</RetroButton>
    </div>
  );
}
