import { useState } from "react";

/** A transient draft never enters the persisted document until the user commits it. */
export function GeometryInput({ label, value, min, max, disabled, commit }: {
  label: string; value: number; min: number; max: number; disabled: boolean; commit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function finish() {
    if (draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft))) commit(Number(draft));
    setDraft(null);
  }
  return <label>{label}<input type="number" inputMode="numeric" step="1" min={min} max={max} value={draft ?? value} disabled={disabled}
    onChange={(event) => setDraft(event.target.value)} onBlur={finish}
    onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); finish(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); }
    }} /></label>;
}
