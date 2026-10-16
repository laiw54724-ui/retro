import { useState } from "react";
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

type Props = { props: ModuleProps<"instagram"> };
type Result = { ok: boolean; document?: SiteDocumentV2Input; diagnostics?: Array<{ message: string }> };

export function CanonicalHighlightEditor({ props }: Props) {
  const { ctx } = props;
  const profileId = ctx.profileId;
  const highlights = ctx.profileDirectory?.find((entry) => entry.id === profileId)?.highlights ?? [];
  const [openId, setOpenId] = useState<string | null>(highlights[0]?.id ?? null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
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
  const addFrame = (highlightId: string, src: string, srcUrl: string) => mutate((document) => run(addHighlightFrame(document, highlightId, {
    id: `frame:${crypto.randomUUID()}`, src, srcUrl, alt: "", text: "",
  }, { siteId }), document));
  const uploadFrame = async (highlightId: string, file: File) => {
    setUploading(true);
    try {
      const src = await ctx.upload?.(file, "image");
      if (src) addFrame(highlightId, src, "");
      else setError("圖片上傳失敗，請再試一次。");
    } finally { setUploading(false); }
  };

  return <fieldset className="w98-fieldset ig-canonical-highlights"><legend>精選動態（{highlights.length}）</legend>
    <div className="ie-row">
      <button type="button" className="w98-btn small" onClick={() => {
        const id = `highlight:${crypto.randomUUID()}`;
        mutate((document) => run(createHighlight(document, { id, ownerProfileId: profileId, title: "新精選" }, { siteId }), document));
        setOpenId(id);
      }}>＋ 新增精選</button>
      <span className="w98-hint">每組最多 50 頁；第一頁會自動成為圓形封面。</span>
    </div>
    {error ? <div role="alert" className="ie-error">{error}</div> : null}
    {highlights.map((highlight, highlightIndex) => {
      const expanded = openId === highlight.id;
      return <article key={highlight.id} className="ig-canonical-post">
        <div className="ig-post-row">
          <span className="ig-thumb round ph">{highlight.coverSrc ? <SafeImg src={highlight.coverSrc} alt={highlight.coverAlt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : highlight.id)}><span>{expanded ? "▾" : "▸"} {highlight.title || "（未命名精選）"}</span><small>{highlight.frames.length} 頁 · {highlight.visibility === "published" ? "公開" : "草稿"}</small></button>
          <button type="button" className="mini-btn" aria-label="精選往前" disabled={highlightIndex === 0} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label="精選往後" disabled={highlightIndex === highlights.length - 1} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label="刪除精選" onClick={() => mutate((document) => run(deleteHighlight(document, highlight.id, { siteId }), document))}>×</button>
        </div>
        {expanded ? <div className="ig-post-body ig-canonical-post-fields">
          <label className="w98-field"><span className="w98-hint">精選標題</span><input className="w98-input compact" value={highlight.title} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { title: event.target.value }, { siteId }), document), `highlight-title-${highlight.id}`)} /></label>
          <label className="check-row"><input type="checkbox" checked={highlight.visibility === "published"} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { visibility: event.target.checked ? "published" : "draft" }, { siteId }), document))} />公開顯示</label>
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
            <FilePick className="w98-btn small" onFiles={(files) => { const file = files[0]; if (file) void uploadFrame(highlight.id, file); }}>{uploading ? "上傳中…" : "上傳新一頁"}</FilePick>
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
