import {
  HighlightEntityV2Schema,
  HighlightFrameV2Schema,
  SiteDocumentV2Schema,
  type HighlightEntityV2,
  type HighlightFrameV2,
  type SiteDocumentV2Input
} from "./site-versioning";

export type HighlightDiagnostic = { path: (string | number)[]; message: string };
export type HighlightOperationResult =
  | { ok: true; document: SiteDocumentV2Input; highlight?: HighlightEntityV2 }
  | { ok: false; diagnostics: HighlightDiagnostic[] };

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): HighlightDiagnostic[] {
  return error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), message: issue.message }));
}

function prepare(document: SiteDocumentV2Input, siteId: string) {
  const parsed = SiteDocumentV2Schema.safeParse(document);
  if (!parsed.success) return { ok: false as const, diagnostics: issues(parsed.error) };
  const scoped = [...parsed.data.entities.profiles, ...parsed.data.entities.highlights, ...parsed.data.entities.collections].every((entity) => entity.siteId === siteId);
  if (!scoped) return { ok: false as const, diagnostics: [{ path: ["entities"], message: "內容不屬於目前網站。" }] };
  return { ok: true as const, document: structuredClone(parsed.data) };
}

function finish(document: SiteDocumentV2Input, siteId: string, highlight?: HighlightEntityV2): HighlightOperationResult {
  const parsed = SiteDocumentV2Schema.safeParse(document);
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  if (parsed.data.entities.highlights.some((item) => item.siteId !== siteId)) return { ok: false, diagnostics: [{ path: ["entities", "highlights"], message: "精選更新後的網站資料無效。" }] };
  return { ok: true, document: parsed.data, ...(highlight ? { highlight: structuredClone(highlight) } : {}) };
}

function syncCover(highlight: HighlightEntityV2): HighlightEntityV2 {
  const first = highlight.frames[0];
  if (!first) return highlight;
  return { ...highlight, coverSrc: first.src, coverSrcUrl: first.srcUrl, coverAlt: first.alt, coverCrop: first.crop };
}

export function createHighlight(document: SiteDocumentV2Input, input: Pick<HighlightEntityV2, "id" | "ownerProfileId" | "title"> & Partial<HighlightEntityV2>, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (prepared.document.entities.highlights.some((item) => item.id === input.id)) return { ok: false, diagnostics: [{ path: ["id"], message: "精選 ID 已存在。" }] };
  if (!prepared.document.entities.profiles.some((item) => item.id === input.ownerProfileId && item.siteId === options.siteId)) return { ok: false, diagnostics: [{ path: ["ownerProfileId"], message: "找不到精選擁有者。" }] };
  const parsed = HighlightEntityV2Schema.safeParse({ kind: "highlight", siteId: options.siteId, visibility: "draft", ...input, coverSrc: input.coverSrc ?? null, frames: input.frames ?? [] });
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  const highlight = syncCover(parsed.data);
  prepared.document.entities.highlights.push(highlight);
  return finish(prepared.document, options.siteId, highlight);
}

export function updateHighlight(document: SiteDocumentV2Input, highlightId: string, patch: Partial<HighlightEntityV2>, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const index = prepared.document.entities.highlights.findIndex((item) => item.id === highlightId);
  if (index < 0) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  const parsed = HighlightEntityV2Schema.safeParse({ ...prepared.document.entities.highlights[index], ...patch, kind: "highlight", id: highlightId, siteId: options.siteId });
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  const highlight = syncCover(parsed.data);
  prepared.document.entities.highlights[index] = highlight;
  return finish(prepared.document, options.siteId, highlight);
}

export function deleteHighlight(document: SiteDocumentV2Input, highlightId: string, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  prepared.document.entities.highlights = prepared.document.entities.highlights.filter((item) => item.id !== highlightId);
  return finish(prepared.document, options.siteId);
}

export function reorderHighlight(document: SiteDocumentV2Input, highlightId: string, direction: -1 | 1, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const list = prepared.document.entities.highlights;
  const highlight = list.find((item) => item.id === highlightId);
  if (!highlight) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  const scopedIndices = list.flatMap((item, index) => item.ownerProfileId === highlight.ownerProfileId ? [index] : []);
  const scopedIndex = scopedIndices.findIndex((index) => list[index].id === highlightId), nextScopedIndex = scopedIndex + direction;
  if (scopedIndex >= 0 && nextScopedIndex >= 0 && nextScopedIndex < scopedIndices.length) {
    const index = scopedIndices[scopedIndex], next = scopedIndices[nextScopedIndex];
    [list[index], list[next]] = [list[next], list[index]];
  }
  return finish(prepared.document, options.siteId);
}

export function addHighlightFrame(document: SiteDocumentV2Input, highlightId: string, frame: HighlightFrameV2, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const current = prepared.document.entities.highlights.find((item) => item.id === highlightId);
  if (!current) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  if (current.frames.length >= 50) return { ok: false, diagnostics: [{ path: ["frames"], message: "每個精選最多 50 個畫面。" }] };
  if (current.frames.some((item) => item.id === frame.id)) return { ok: false, diagnostics: [{ path: ["frames", "id"], message: "畫面 ID 已存在。" }] };
  const checked = HighlightFrameV2Schema.safeParse(frame);
  if (!checked.success) return { ok: false, diagnostics: issues(checked.error) };
  return updateHighlight(prepared.document, highlightId, { frames: [...current.frames, checked.data] }, options);
}

export function updateHighlightFrame(document: SiteDocumentV2Input, highlightId: string, frameId: string, patch: Partial<HighlightFrameV2>, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const current = prepared.document.entities.highlights.find((item) => item.id === highlightId);
  if (!current) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  if (!current.frames.some((item) => item.id === frameId)) return { ok: false, diagnostics: [{ path: ["frameId"], message: "找不到畫面。" }] };
  return updateHighlight(prepared.document, highlightId, { frames: current.frames.map((item) => item.id === frameId ? { ...item, ...patch } : item) }, options);
}

export function deleteHighlightFrame(document: SiteDocumentV2Input, highlightId: string, frameId: string, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const current = prepared.document.entities.highlights.find((item) => item.id === highlightId);
  if (!current) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  return updateHighlight(prepared.document, highlightId, { frames: current.frames.filter((item) => item.id !== frameId) }, options);
}

export function reorderHighlightFrame(document: SiteDocumentV2Input, highlightId: string, frameId: string, direction: -1 | 1, options: { siteId: string }): HighlightOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const current = prepared.document.entities.highlights.find((item) => item.id === highlightId);
  if (!current) return { ok: false, diagnostics: [{ path: ["highlightId"], message: "找不到精選。" }] };
  const frames = [...current.frames], index = frames.findIndex((item) => item.id === frameId), next = index + direction;
  if (index >= 0 && next >= 0 && next < frames.length) [frames[index], frames[next]] = [frames[next], frames[index]];
  return updateHighlight(prepared.document, highlightId, { frames }, options);
}
