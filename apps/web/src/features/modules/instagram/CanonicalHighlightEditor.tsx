import { useId } from "react";
import {
  addHighlightFrame,
  createHighlight,
  deleteHighlight,
  deleteHighlightFrame,
  normalizeImageUrl,
  reorderHighlight,
  reorderHighlightFrame,
  updateHighlight,
  updateHighlightFrame,
  type SiteDocumentV2Input,
} from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { FilePick, SafeImg } from "../ui";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";

type Props = { props: ModuleProps<"instagram"> };
type Result = { ok: boolean; document?: SiteDocumentV2Input; diagnostics?: Array<{ message: string }> };

export function CanonicalHighlightEditor({ props }: Props) {
  const { ctx } = props;
  const profileId = ctx.profileId;
  const highlights = ctx.profileDirectory?.find((entry) => entry.id === profileId)?.highlights ?? [];
  const scope = `${igEditorScope(props)}:highlights`;
  const editorId = useId();
  const [openId, setOpenId] = useIgEditorState<string | null>(scope, highlights[0]?.id ?? null);
  const [query, setQuery] = useIgEditorState(scope, "");
  const [urls, setUrls] = useIgEditorState<Record<string, string>>(scope, {});
  const [error, setError] = useIgEditorState(scope, "");
  const [uploading, setUploading] = useIgEditorState<Record<string, boolean>>(scope, {});
  const search = query.normalize("NFKC").trim().toLowerCase();
  const matches = (title: string) => title.normalize("NFKC").toLowerCase().includes(search);
  const matchingHighlights = highlights.filter((highlight) => matches(highlight.title));
  // Keep an open editor mounted while its title changes, so typing cannot drop focus.
  const visibleHighlights = highlights.filter((highlight) => matches(highlight.title) || highlight.id === openId);
  const retainedEditor = visibleHighlights.length > matchingHighlights.length;
  const publishedCount = highlights.filter((highlight) => highlight.visibility === "published").length;
  if (!ctx.updateContent || !ctx.siteId || !profileId) return null;
  const siteId = ctx.siteId;

  const run = (result: Result, fallback: SiteDocumentV2Input) => {
    if (!result.ok || !result.document) {
      setError(result.diagnostics?.[0]?.message ?? "精選更新失敗，請再試一次。");
      return fallback;
    }
    return result.document;
  };
  const mutate = (recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, key?: string) => {
    setError("");
    ctx.updateContent?.(recipe, key);
  };
  const addFrame = (highlightId: string, src: string, srcUrl: string) => mutate((document) => {
    // A delayed upload must not follow a highlight that was deleted or reassigned.
    const target = document.entities.highlights?.find((highlight) => highlight.id === highlightId);
    if (!target || target.siteId !== siteId || target.ownerProfileId !== profileId) {
      setError("精選已刪除或改指派，未加入這張圖片。");
      return document;
    }
    return run(addHighlightFrame(document, highlightId, {
      id: `frame:${crypto.randomUUID()}`, src, srcUrl, alt: "", text: "",
    }, { siteId }), document);
  });
  const uploadFrame = async (highlightId: string, file: File) => {
    if (uploading[highlightId]) return;
    setError("");
    setUploading((current) => ({ ...current, [highlightId]: true }));
    try {
      const src = await ctx.upload?.(file, "image");
      if (src) addFrame(highlightId, src, "");
      else setError("圖片上傳失敗，請再試一次。");
    } catch {
      setError("圖片上傳失敗，請再試一次。");
    } finally { setUploading((current) => ({ ...current, [highlightId]: false })); }
  };

  return <fieldset className="w98-fieldset ig-canonical-highlights"><legend>精選動態（{highlights.length}）</legend>
    <div className="ie-row">
      <button type="button" className="w98-btn small" onClick={() => {
        const id = `highlight:${crypto.randomUUID()}`;
        mutate((document) => run(createHighlight(document, { id, ownerProfileId: profileId, title: "新精選" }, { siteId }), document));
        setQuery("");
        setOpenId(id);
      }}>＋ 新增精選</button>
      <span className="w98-hint">每組最多 50 頁；第一頁會自動成為圓形封面。</span>
    </div>
    {highlights.length ? <label className="w98-field">
      <span className="w98-hint">搜尋精選</span>
      <input className="w98-input compact" type="search" value={query} placeholder="依精選標題搜尋" onChange={(event) => {
        setQuery(event.target.value);
        setOpenId(null);
      }} />
    </label> : null}
    <p className="ig-editor-summary" role="status">符合搜尋 {matchingHighlights.length} / {highlights.length} 組 · 公開 {publishedCount} · 草稿 {highlights.length - publishedCount}{retainedEditor ? "。正在編輯的精選仍保留顯示。" : ""}</p>
    {query ? <button type="button" className="w98-btn small" onClick={() => setQuery("")}>清除精選搜尋</button> : null}
    {search ? <p className="w98-hint" id={`${editorId}-order-hint`}>清除搜尋後可調整完整精選順序。</p> : null}
    {error ? <div role="alert" className="ie-error">{error}</div> : null}
    {!highlights.length ? <p className="ig-editor-empty">尚未建立精選。新增一組精選，集中展示這個角色的旅程或小故事。</p> : !visibleHighlights.length ? <p className="ig-editor-empty">沒有符合搜尋的精選，請換個標題關鍵字。</p> : null}
    {visibleHighlights.map((highlight) => {
      const highlightIndex = highlights.findIndex((candidate) => candidate.id === highlight.id);
      const expanded = openId === highlight.id;
      const bodyId = `${editorId}-${highlight.id}`;
      return <article key={highlight.id} className="ig-canonical-post">
        <div className="ig-post-row">
          <span className="ig-thumb round ph">{highlight.coverSrc ? <SafeImg src={highlight.coverSrc} alt={highlight.coverAlt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} aria-controls={expanded ? bodyId : undefined} onClick={() => setOpenId(expanded ? null : highlight.id)}><span>{expanded ? "▾" : "▸"} {highlight.title || "（未命名精選）"}</span><small>{highlight.frames.length} / 50 頁 · {highlight.visibility === "published" ? "公開" : "草稿"}</small></button>
          <button type="button" className="mini-btn" aria-label="精選往前" aria-describedby={search ? `${editorId}-order-hint` : undefined} disabled={!!search || highlightIndex === 0} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label="精選往後" aria-describedby={search ? `${editorId}-order-hint` : undefined} disabled={!!search || highlightIndex === highlights.length - 1} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label={`刪除精選 ${highlight.title || "未命名精選"}`} onClick={() => mutate((document) => run(deleteHighlight(document, highlight.id, { siteId }), document))}>×</button>
        </div>
        {expanded ? <div id={bodyId} className="ig-post-body ig-canonical-post-fields">
          <label className="w98-field"><span className="w98-hint">精選標題</span><input className="w98-input compact" maxLength={40} value={highlight.title} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { title: event.target.value }, { siteId }), document), `highlight-title-${highlight.id}`)} /></label>
          <label className="check-row"><input type="checkbox" checked={highlight.visibility === "published"} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { visibility: event.target.checked ? "published" : "draft" }, { siteId }), document))} />公開顯示</label>
          {!highlight.frames.length ? <p className="ig-editor-empty">還沒有精選頁面。加入第一張圖片作為封面，再依故事順序新增頁面。</p> : null}
          {highlight.frames.map((frame, frameIndex) => <div key={frame.id} className="ig-highlight-frame-row">
            <span className="ig-thumb sq48 ph">{frame.src ? <SafeImg src={frame.src} alt={frame.alt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
            <div className="ig-col grow">
              <strong>第 {frameIndex + 1} 頁{frameIndex === 0 ? "（封面）" : ""}</strong>
              <input className="w98-input compact" aria-label={`精選第 ${frameIndex + 1} 頁替代文字`} value={frame.alt} placeholder="替代文字" onChange={(event) => mutate((document) => run(updateHighlightFrame(document, highlight.id, frame.id, { alt: event.target.value }, { siteId }), document), `highlight-alt-${frame.id}`)} />
              <textarea className="w98-textarea" rows={2} aria-label={`精選第 ${frameIndex + 1} 頁文字`} value={frame.text} placeholder="可選的短文字" onChange={(event) => mutate((document) => run(updateHighlightFrame(document, highlight.id, frame.id, { text: event.target.value }, { siteId }), document), `highlight-text-${frame.id}`)} />
            </div>
            <button type="button" className="mini-btn" aria-label={`精選第 ${frameIndex + 1} 頁往前`} disabled={frameIndex === 0} onClick={() => mutate((document) => run(reorderHighlightFrame(document, highlight.id, frame.id, -1, { siteId }), document))}>▲</button>
            <button type="button" className="mini-btn" aria-label={`精選第 ${frameIndex + 1} 頁往後`} disabled={frameIndex === highlight.frames.length - 1} onClick={() => mutate((document) => run(reorderHighlightFrame(document, highlight.id, frame.id, 1, { siteId }), document))}>▼</button>
            <button type="button" className="mini-btn danger" aria-label={`刪除精選第 ${frameIndex + 1} 頁`} onClick={() => mutate((document) => run(deleteHighlightFrame(document, highlight.id, frame.id, { siteId }), document))}>×</button>
          </div>)}
          {highlight.frames.length < 50 ? <div className="ie-row">
            <fieldset className="ig-upload-control" aria-label="精選圖片上傳" disabled={!!uploading[highlight.id] || !ctx.upload} aria-busy={!!uploading[highlight.id]}>
              <FilePick className="w98-btn small" onFiles={(files) => { const file = files[0]; if (file) void uploadFrame(highlight.id, file); }}>{uploading[highlight.id] ? "上傳中…" : "上傳新一頁"}</FilePick>
            </fieldset>
            <input className="w98-input compact grow" aria-label="新增精選頁圖片網址" value={urls[highlight.id] ?? ""} placeholder="或貼上圖片網址" onChange={(event) => setUrls((current) => ({ ...current, [highlight.id]: event.target.value }))} />
            <button type="button" className="w98-btn small" onClick={() => {
              const raw = urls[highlight.id] ?? "";
              const normalized = normalizeImageUrl(raw);
              if (!normalized.ok) { setError(normalized.reason); return; }
              addFrame(highlight.id, normalized.url, raw.trim());
              setUrls((current) => ({ ...current, [highlight.id]: "" }));
            }}>加入</button>
          </div> : null}
        </div> : null}
      </article>;
    })}
  </fieldset>;
}
