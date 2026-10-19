/** Incomplete/invalid drafts restore the saved value; only complete integers clamp. */
export function commitNumericDraft(raw: string, value: number, min: number, max: number): number {
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return value;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : value;
}
