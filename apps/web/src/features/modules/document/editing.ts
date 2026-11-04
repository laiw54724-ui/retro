import { makeBlock, type DocumentBlock, type DocumentBlockKind } from "@retrodesk/shared";

export const MAX_BLOCKS = 100;
export const textLimit = (kind: DocumentBlockKind) => kind === "heading" || kind === "link" ? 500 : kind === "button" ? 200 : 10_000;
export function emptyBlock(kind: DocumentBlockKind): DocumentBlock {
  const block = makeBlock(kind);
  return "text" in block ? { ...block, text: "" } : block;
}
export function convertBlock(block: DocumentBlock, kind: "heading" | "text" | "list"): DocumentBlock | null {
  if (!("text" in block) || block.text.length > textLimit(kind)) return null;
  return { ...emptyBlock(kind), id: block.id, text: block.text } as DocumentBlock;
}
export function moveBlock(blocks: DocumentBlock[], id: string, target: string | null, after: boolean) {
  const item = blocks.find((block) => block.id === id);
  if (!item || id === target || (target && !blocks.some((block) => block.id === target))) return blocks;
  const rest = blocks.filter((block) => block.id !== id);
  const index = target ? rest.findIndex((block) => block.id === target) + Number(after) : rest.length;
  return [...rest.slice(0, index), item, ...rest.slice(index)];
}
export function splitBlock(blocks: DocumentBlock[], id: string, start: number, end: number, next: DocumentBlock) {
  const index = blocks.findIndex((block) => block.id === id);
  const block = blocks[index];
  if (blocks.length >= MAX_BLOCKS || !block || (block.kind !== "text" && block.kind !== "heading") || next.kind !== "text") return blocks;
  return [...blocks.slice(0, index), { ...block, text: block.text.slice(0, start) }, { ...next, text: block.text.slice(end) }, ...blocks.slice(index + 1)];
}
