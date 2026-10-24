/** Legacy counts are fictional labels, never numbers to parse or rewrite. */
export function followCountLabel(total: number | null | undefined, legacy: string, namedCount: number): number | string {
  if (total != null) return total;
  if (!legacy || legacy === "0") return namedCount;
  return namedCount ? `${legacy} + ${namedCount}` : legacy;
}
