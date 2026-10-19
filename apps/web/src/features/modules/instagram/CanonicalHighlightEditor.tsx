import { useId } from "react";
import sourceStyles from "./ImageSourceFields.module.css";
import { translateSystemMessage } from "../../../i18n/systemMessages";
import { useTranslation } from "react-i18next";
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
import { FilePick, ImageUrlField, SafeImg } from "../ui";
import { useIgMedia } from "./useIgMedia";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";

type Props = { props: ModuleProps<"instagram"> };
type Result = { ok: boolean; document?: SiteDocumentV2Input; diagnostics?: Array<{ message: string }> };

export function CanonicalHighlightEditor({ props }: Props) {
  const { t: tr } = useTranslation("instagram");
  const { ctx } = props;
  const profileId = ctx.profileId;
  const highlights = ctx.profileDirectory?.find((entry) => entry.id === profileId)?.highlights ?? [];
  const scope = `${igEditorScope(props)}:highlights`;
  const editorId = useId();
  const [openId, setOpenId] = useIgEditorState<string | null>(scope, highlights[0]?.id ?? null);
  const [query, setQuery] = useIgEditorState(scope, "");
  const [urls, setUrls] = useIgEditorState<Record<string, string>>(scope, {});
  const [error, setError] = useIgEditorState(scope, "");
  const media = useIgMedia(props);
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
      setError(translateSystemMessage(result.diagnostics?.[0]?.message ?? "") || tr("canonicalHighlightEditor.couldntUpdateTheHighlightPlease"));
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
      setError(tr("canonicalHighlightEditor.theHighlightWasDeletedOr"));
      return document;
    }
    return run(addHighlightFrame(document, highlightId, {
      id: `frame:${crypto.randomUUID()}`, src, srcUrl, alt: "", text: "",
    }, { siteId }), document);
  });

  return <fieldset className="w98-fieldset ig-canonical-highlights"><legend>{tr("ig.highlightsCount", { count: highlights.length })}</legend>
    <div className="ie-row">
      <button type="button" className="w98-btn small" onClick={() => {
        const id = `highlight:${crypto.randomUUID()}`;
        mutate((document) => run(createHighlight(document, { id, ownerProfileId: profileId, title: tr("canonicalHighlightEditor.newHighlight") }, { siteId }), document));
        setQuery("");
        setOpenId(id);
      }}>{tr("canonicalHighlightEditor.addHighlight")}</button>
      <span className="w98-hint">{tr("canonicalHighlightEditor.upTo50PagesPer")}</span>
    </div>
    {highlights.length ? <label className="w98-field">
      <span className="w98-hint">{tr("canonicalHighlightEditor.searchHighlights")}</span>
      <input className="w98-input compact" type="search" value={query} placeholder={tr("canonicalHighlightEditor.searchByHighlightTitle")} onChange={(event) => {
        setQuery(event.target.value);
        setOpenId(null);
      }} />
    </label> : null}
    <p className="ig-editor-summary" role="status">{tr("ig.highlightSummary", { matching: matchingHighlights.length, total: highlights.length, published: publishedCount, drafts: highlights.length - publishedCount })}{retainedEditor ? tr("ig.highlightRetained") : ""}</p>
    {query ? <button type="button" className="w98-btn small" onClick={() => setQuery("")}>{tr("canonicalHighlightEditor.clearHighlightSearch")}</button> : null}
    {search ? <p className="w98-hint" id={`${editorId}-order-hint`}>{tr("canonicalHighlightEditor.clearTheSearchToReorder")}</p> : null}
    {error ? <div role="alert" className="ie-error">{error}</div> : null}
    {!highlights.length ? <p className="ig-editor-empty">{tr("canonicalHighlightEditor.noHighlightsYetAddOne")}</p> : !visibleHighlights.length ? <p className="ig-editor-empty">{tr("canonicalHighlightEditor.noHighlightsMatchTheSearch")}</p> : null}
    {visibleHighlights.map((highlight) => {
      const highlightIndex = highlights.findIndex((candidate) => candidate.id === highlight.id);
      const expanded = openId === highlight.id;
      const bodyId = `${editorId}-${highlight.id}`;
      return <article key={highlight.id} className="ig-canonical-post">
        <div className="ig-post-row">
          <span className="ig-thumb round ph">{highlight.coverSrc ? <SafeImg src={highlight.coverSrc} alt={highlight.coverAlt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} aria-controls={expanded ? bodyId : undefined} onClick={() => setOpenId(expanded ? null : highlight.id)}><span>{expanded ? "▾" : "▸"} {highlight.title || tr("canonicalHighlightEditor.untitledHighlight")}</span><small>{tr("ig.highlightMeta", { count: highlight.frames.length, status: highlight.visibility === "published" ? tr("canonicalCollectionEditor.public") : tr("canonicalCollectionEditor.draft") })}</small></button>
          <button type="button" className="mini-btn" aria-label={tr("canonicalHighlightEditor.moveHighlightUp")} aria-describedby={search ? `${editorId}-order-hint` : undefined} disabled={!!search || highlightIndex === 0} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label={tr("canonicalHighlightEditor.moveHighlightDown")} aria-describedby={search ? `${editorId}-order-hint` : undefined} disabled={!!search || highlightIndex === highlights.length - 1} onClick={() => mutate((document) => run(reorderHighlight(document, highlight.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label={tr("ig.deleteHighlight", { title: highlight.title || tr("ig.untitledHighlightShort") })} onClick={() => mutate((document) => run(deleteHighlight(document, highlight.id, { siteId }), document))}>×</button>
        </div>
        {media.taskList("highlight", highlight.id)}
        {expanded ? <div id={bodyId} className="ig-post-body ig-canonical-post-fields">
          <label className="w98-field"><span className="w98-hint">{tr("canonicalHighlightEditor.highlightTitle")}</span><input className="w98-input compact" maxLength={40} value={highlight.title} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { title: event.target.value }, { siteId }), document), `highlight-title-${highlight.id}`)} /></label>
          <label className="check-row"><input type="checkbox" checked={highlight.visibility === "published"} onChange={(event) => mutate((document) => run(updateHighlight(document, highlight.id, { visibility: event.target.checked ? "published" : "draft" }, { siteId }), document))} />{tr("canonicalHighlightEditor.showPublicly")}</label>
          {!highlight.frames.length ? <p className="ig-editor-empty">{tr("canonicalHighlightEditor.noHighlightPagesYetAdd")}</p> : null}
          {highlight.frames.map((frame, frameIndex) => <div key={frame.id} className="ig-highlight-frame-row">
            <span className="ig-thumb sq48 ph">{frame.src ? <SafeImg src={frame.src} alt={frame.alt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
            <div className="ig-col grow">
              <strong>{tr("ig.frameHeading", { n: frameIndex + 1, cover: frameIndex === 0 ? tr("canonicalHighlightEditor.cover") : "" })}</strong>
              <ImageUrlField visibleLabel raw={frame.srcUrl} label={tr("imageControls.highlightPageUrl", { n: frameIndex + 1 })} placeholder={tr("canonicalHighlightEditor.orPasteAnImageUrl")} className="w98-input compact" onCommit={(raw, src) => mutate((document) => run(updateHighlightFrame(document, highlight.id, frame.id, { src, srcUrl: raw }, { siteId }), document))} />
              <input className="w98-input compact" aria-label={tr("canonicalHighlightEditor.altTextForHighlightPage", { v1: frameIndex + 1 })} value={frame.alt} placeholder={tr("canonicalHighlightEditor.altText")} onChange={(event) => mutate((document) => run(updateHighlightFrame(document, highlight.id, frame.id, { alt: event.target.value }, { siteId }), document), `highlight-alt-${frame.id}`)} />
              <textarea className="w98-textarea" rows={2} aria-label={tr("canonicalHighlightEditor.textForHighlightPage", { v1: frameIndex + 1 })} value={frame.text} placeholder={tr("canonicalHighlightEditor.optionalShortText")} onChange={(event) => mutate((document) => run(updateHighlightFrame(document, highlight.id, frame.id, { text: event.target.value }, { siteId }), document), `highlight-text-${frame.id}`)} />
            </div>
            <button type="button" className="mini-btn" aria-label={tr("canonicalHighlightEditor.moveHighlightPageEarlier", { v1: frameIndex + 1 })} disabled={frameIndex === 0} onClick={() => mutate((document) => run(reorderHighlightFrame(document, highlight.id, frame.id, -1, { siteId }), document))}>▲</button>
            <button type="button" className="mini-btn" aria-label={tr("canonicalHighlightEditor.moveHighlightPageLater", { v1: frameIndex + 1 })} disabled={frameIndex === highlight.frames.length - 1} onClick={() => mutate((document) => run(reorderHighlightFrame(document, highlight.id, frame.id, 1, { siteId }), document))}>▼</button>
            <button type="button" className="mini-btn danger" aria-label={tr("canonicalHighlightEditor.deleteHighlightPage", { v1: frameIndex + 1 })} onClick={() => mutate((document) => run(deleteHighlightFrame(document, highlight.id, frame.id, { siteId }), document))}>×</button>
          </div>)}
          {highlight.frames.length < 50 ? <div className="ie-row">
            <fieldset className="ig-upload-control" aria-label={tr("canonicalHighlightEditor.uploadHighlightImages")} disabled={!media.canUpload} aria-busy={media.isPending("highlight", highlight.id)}>
            <FilePick multiple disabled={!media.canUpload} className="w98-btn small" onFiles={(files) => {
              setError("");
              const omitted = media.upload("highlight", highlight.id, files);
              if (omitted) setError(tr("batchMedia.omitted", { count: omitted }));
            }}>{tr("batchMedia.uploadPages")}</FilePick>
            </fieldset>
            <label className={`ig-col grow ${sourceStyles.url}`}><span className="w98-hint">{tr("canonicalHighlightEditor.addHighlightPageImageUrl")}</span><input className="w98-input compact" aria-label={tr("canonicalHighlightEditor.addHighlightPageImageUrl")} value={urls[highlight.id] ?? ""} placeholder={tr("canonicalHighlightEditor.orPasteAnImageUrl")} onChange={(event) => setUrls((current) => ({ ...current, [highlight.id]: event.target.value }))} /></label>
            <button type="button" className="w98-btn small" onClick={() => {
              const raw = urls[highlight.id] ?? "";
              const normalized = normalizeImageUrl(raw);
              if (!normalized.ok) { setError(translateSystemMessage(normalized.reason)); return; }
              addFrame(highlight.id, normalized.url, raw.trim());
              setUrls((current) => ({ ...current, [highlight.id]: "" }));
            }}>{tr("canonicalHighlightEditor.add")}</button>
          </div> : null}
        </div> : null}
      </article>;
    })}
  </fieldset>;
}
