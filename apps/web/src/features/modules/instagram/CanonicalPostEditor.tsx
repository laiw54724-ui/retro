import { useId } from "react";
import sourceStyles from "./ImageSourceFields.module.css";
import { translateSystemMessage } from "../../../i18n/systemMessages";
import { useTranslation } from "react-i18next";
import { useLocaleFormatting } from "../../../i18n/format";
import {
  addPostMedia,
  createActorComment,
  createPost,
  deleteActorComment,
  deletePost,
  deletePostMedia,
  normalizeImageUrl,
  patchPostMedia,
  reorderPost,
  reorderPostMedia,
  reorderActorComment,
  setPostNamedLikers,
  setPostOtherLikeCount,
  updateActorComment,
  updatePost,
  type ActorCommentV2,
  type PostEntityV2,
  type SiteDocumentV2Input
} from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { FilePick, ImageUrlField } from "../ui";
import { AvatarImage, DEFAULT_CROP } from "../../../components/AvatarImage";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";
import { DEFAULT_POST_EDITOR_FILTERS, hasPostEditorFilters, selectPostEditorRows, type PostEditorFilters } from "./postEditorFilters";

import { useIgMedia } from "./useIgMedia";
import { IgDraftInput } from "./IgDraftInput";
import { validateCountDraft } from "./igDraftValidation";

type Props = { props: ModuleProps<"instagram"> };

export function CanonicalPostEditor({ props }: Props) {
  const { t: tr } = useTranslation("instagram");
  const { formatDate } = useLocaleFormatting();
  const { ctx } = props;
  const authorId = ctx.profileId;
  const posts = (ctx.posts ?? []).filter((post) => post.authorProfileId === authorId);
  const scope = igEditorScope(props);
  const editorId = useId();
  const [newPostUrl, setNewPostUrl] = useIgEditorState(scope, "");
  const [mediaUrls, setMediaUrls] = useIgEditorState<Record<string, string>>(scope, {});
  const [openId, setOpenId] = useIgEditorState<string | null>(scope, posts[0]?.id ?? null);
  const [error, setError] = useIgEditorState(scope, "");
  const media = useIgMedia(props);
  const [filters, setFilters] = useIgEditorState<PostEditorFilters>(scope, DEFAULT_POST_EDITOR_FILTERS);
  const { rows, matchCount, retainedCount } = selectPostEditorRows(posts, filters, openId);
  const filtersActive = hasPostEditorFilters(filters);
  const changeFilters = (patch: Partial<PostEditorFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setOpenId(null);
  };
  const clearFilters = () => changeFilters(DEFAULT_POST_EDITOR_FILTERS);

  if (!ctx.updateContent || !authorId || !ctx.siteId) return null;
  const siteId = ctx.siteId;
  const mutate = (recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input, historyKey?: string) => {
    setError("");
    ctx.updateContent?.(recipe, historyKey);
  };
  const run = <T extends { ok: boolean; document?: SiteDocumentV2Input; diagnostics?: Array<{ message: string }> }>(result: T, fallback: SiteDocumentV2Input) => {
    if (!result.ok || !result.document) {
      setError(translateSystemMessage(result.diagnostics?.[0]?.message ?? "") || tr("canonicalPostEditor.couldntUpdateTheContentPlease"));
      return fallback;
    }
    return result.document;
  };
  const addPostFromMedia = (items: Array<{ src: string; srcUrl: string; alt: string }>, title = "") => {
    let created: string | null = null;
    const id = `post:${crypto.randomUUID()}`;
    mutate((document) => {
      const result = createPost(document, {
        id,
        authorProfileId: authorId,
        title,
        date: formatDate(new Date(), { year: "numeric", month: "numeric", day: "numeric" }),
        media: items.slice(0, 10).map((item) => ({ id: `media:${crypto.randomUUID()}`, ...item }))
      }, { siteId });
      if (result.ok) {
        created = id;
        setFilters(DEFAULT_POST_EDITOR_FILTERS);
        setOpenId(id);
      }
      return run(result, document);
    });
    return created;
  };
  const uploadFiles = (postId: string, files: File[]) => {
    setError("");
    const omitted = media.upload("post", postId, files);
    if (omitted) setError(tr("batchMedia.omitted", { count: omitted }));
  };
  const patchPost = (post: PostEntityV2, patch: Partial<PostEntityV2>, key?: string) => mutate(
    (document) => run(updatePost(document, post.id, patch, { siteId }), document),
    key
  );
  const addMediaItems = (post: PostEntityV2, items: Array<{ src: string; srcUrl: string; alt: string }>) => mutate((document) => {
    const target = document.entities.posts.find((candidate) => candidate.id === post.id && candidate.authorProfileId === authorId);
    if (!target) {
      setError(tr("canonicalPostEditor.theOriginalPostWasntFound"));
      return document;
    }
    // Raw v2 input may omit media; the canonical operation applies the [] default.
    const available = Math.max(0, 10 - (target.media?.length ?? 0));
    if (items.length > available) setError(tr("canonicalPostEditor.aPostCanHoldUp"));
    return items.slice(0, available).reduce(
      (next, item) => run(addPostMedia(next, post.id, { id: `media:${crypto.randomUUID()}`, ...item }, { siteId }), next),
      document
    );
  });
  const social = (recipe: (document: SiteDocumentV2Input) => ReturnType<typeof setPostNamedLikers>, key?: string) => mutate((document) => run(recipe(document), document), key);
  const changeComment = (postId: string, comment: ActorCommentV2, key?: string) => social((document) => updateActorComment(document, postId, comment.id, comment, { siteId }), key);

  return <fieldset className="w98-fieldset ig-canonical-posts"><legend>{tr("ig.postsAndWorks", { count: posts.length })}</legend>
    <div className="ie-row">
      <FilePick multiple disabled={!media.canUpload} className="w98-btn small" onFiles={(files) => {
        const id = addPostFromMedia([], files[0].name.replace(/\.[^.]+$/, ""));
        if (id) uploadFiles(id, files);
      }}>{tr("canonicalPostEditor.uploadANewPostUp")}</FilePick>
      <label className={`ig-col grow ${sourceStyles.url}`}><span className="w98-hint">{tr("canonicalPostEditor.newPostImageUrl")}</span><input className="w98-input compact" aria-label={tr("canonicalPostEditor.newPostImageUrl")} value={newPostUrl} onChange={(event) => setNewPostUrl(event.target.value)} placeholder={tr("canonicalHighlightEditor.orPasteAnImageUrl")} /></label>
      <button type="button" className="w98-btn small" onClick={() => {
        const result = normalizeImageUrl(newPostUrl);
        if (!result.ok) { setError(translateSystemMessage(result.reason)); return; }
        addPostFromMedia([{ src: result.url, srcUrl: newPostUrl.trim(), alt: "" }]);
        setNewPostUrl("");
      }}>{tr("canonicalPostEditor.add")}</button>
    </div>
    {error ? <div className="ie-error" role="alert">{error}</div> : null}
    <p className="w98-hint">{tr("canonicalPostEditor.eachPostCanHold1")}</p>
    <p className="w98-hint">{tr("batchMedia.draftHint")}</p>
    <div className="ig-post-filters" role="group" aria-label={tr("canonicalPostEditor.postSearchAndFilters")}>
      <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.searchPosts")}</span><input type="search" className="w98-input compact" aria-label={tr("canonicalPostEditor.searchPosts2")} value={filters.query} onChange={(event) => changeFilters({ query: event.target.value })} placeholder={tr("canonicalPostEditor.titleContentPlaceDateOr")} /></label>
      <div className="ie-row">
        <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.statusFilter")}</span><select className="w98-input compact" aria-label={tr("canonicalPostEditor.filterPostsByStatus")} value={filters.visibility} onChange={(event) => changeFilters({ visibility: event.target.value as PostEditorFilters["visibility"] })}>
          <option value="all">{tr("canonicalPostEditor.allStatuses")}</option><option value="draft">{tr("canonicalCollectionEditor.draft")}</option><option value="published">{tr("canonicalCollectionEditor.public")}</option>
        </select></label>
        <label className="check-row"><input type="checkbox" checked={filters.pinnedOnly} onChange={(event) => changeFilters({ pinnedOnly: event.target.checked })} />{tr("canonicalPostEditor.pinnedPostsOnly")}</label>
        <button type="button" className="w98-btn small" disabled={!filtersActive && !filters.query} onClick={clearFilters}>{tr("canonicalPostEditor.clearPostFilters")}</button>
      </div>
    </div>
    <p className="w98-hint ig-post-filter-status" role="status" aria-live="polite">{retainedCount ? tr("ig.postFilterStatusRetained", { shown: matchCount, total: posts.length }) : tr("ig.postFilterStatus", { shown: matchCount, total: posts.length })}</p>
    {filtersActive ? <p className="w98-hint" id={`${editorId}-order-hint`}>{tr("canonicalPostEditor.reorderingIsPausedWhileSearching")}</p> : null}
    {!posts.length ? <p className="ig-post-empty w98-hint">{tr("canonicalPostEditor.thisCharacterHasNoPosts")}</p> : matchCount === 0 ? <p className="ig-post-empty w98-hint">{tr("canonicalPostEditor.noPostsMatchTryAnother")}</p> : null}
    {rows.map(({ post, authoredIndex, matchesFilters }) => {
      const expanded = openId === post.id;
      const postStatus = post.visibility === "published" ? tr("canonicalCollectionEditor.public") : tr("canonicalCollectionEditor.draft");
      return <article key={post.id} className="ig-canonical-post">
        {!matchesFilters ? <p className="ig-post-retained-note w98-hint">{tr("canonicalPostEditor.thisPostNoLongerMatches")}</p> : null}
        <div className="ig-post-row">
          <span className="ig-thumb sq ph">{post.media[0]?.src ? <AvatarImage src={post.media[0].src} crop={post.media[0].crop} alt={post.media[0].alt} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} aria-controls={expanded ? `${editorId}-${post.id}` : undefined} onClick={() => setOpenId(expanded ? null : post.id)}>
            <span>{expanded ? "▾" : "▸"} {post.title || tr("canonicalCollectionEditor.noTitle")}</span>
            <small>{post.pinned ? tr("ig.postMetaPinned", { count: post.media.length, status: postStatus }) : tr("ig.postMeta", { count: post.media.length, status: postStatus })}</small>
          </button>
          <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.movePostUp")} aria-describedby={filtersActive ? `${editorId}-order-hint` : undefined} disabled={filtersActive || authoredIndex === 0} onClick={() => mutate((document) => run(reorderPost(document, post.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.movePostDown")} aria-describedby={filtersActive ? `${editorId}-order-hint` : undefined} disabled={filtersActive || authoredIndex === posts.length - 1} onClick={() => mutate((document) => run(reorderPost(document, post.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label={tr("canonicalPostEditor.deletePost")} onClick={() => mutate((document) => run(deletePost(document, post.id, { siteId }), document))}>×</button>
        </div>
        {media.taskList("post", post.id)}
        {expanded ? <div className="ig-post-body ig-canonical-post-fields" id={`${editorId}-${post.id}`}>
          <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.heading")}</span><input className="w98-input compact" value={post.title} onChange={(event) => patchPost(post, { title: event.target.value }, `post-title-${post.id}`)} /></label>
          <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.postContent")}</span><textarea className="w98-textarea" rows={3} value={post.caption} onChange={(event) => patchPost(post, { caption: event.target.value }, `post-caption-${post.id}`)} /></label>
          <div className="ig-trio">
            <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.place")}</span><input className="w98-input compact" value={post.location} onChange={(event) => patchPost(post, { location: event.target.value }, `post-location-${post.id}`)} /></label>
            <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.displayDate")}</span><input className="w98-input compact" value={post.date} onChange={(event) => patchPost(post, { date: event.target.value }, `post-date-${post.id}`)} /></label>
            <label className="w98-field"><span className="w98-hint">{tr("canonicalPostEditor.worldDate")}</span><input className="w98-input compact" value={post.worldDateLabel} onChange={(event) => patchPost(post, { worldDateLabel: event.target.value }, `post-world-date-${post.id}`)} /></label>
          </div>
          <div className="ie-row">
            <label className="check-row"><input type="checkbox" checked={post.visibility === "published"} onChange={(event) => patchPost(post, { visibility: event.target.checked ? "published" : "draft" })} />{tr("canonicalHighlightEditor.showPublicly")}</label>
            <label className="check-row"><input type="checkbox" checked={post.pinned} onChange={(event) => patchPost(post, { pinned: event.target.checked })} />{tr("canonicalPostEditor.pin")}</label>
          </div>
          <details className="ig-post-social-details"><summary>{tr("canonicalPostEditor.characterInteractionsLikesAndComments")}</summary>
          <fieldset className="w98-fieldset ig-post-social"><legend>{tr("canonicalPostEditor.characterWorldInteractions")}</legend>
            <strong>{tr("canonicalPostEditor.namedLikers")}</strong>
            <div className="ig-social-checks compact">
              {(ctx.profiles ?? []).map((candidate) => <label key={`${post.id}-liker-${candidate.id}`} className="check-row"><input type="checkbox" checked={post.namedLikerIds.includes(candidate.id)} onChange={(event) => social((document) => setPostNamedLikers(document, post.id, event.target.checked ? [...post.namedLikerIds, candidate.id] : post.namedLikerIds.filter((id) => id !== candidate.id), { siteId }))} /><span>{candidate.displayName ?? candidate.name} <small>@{candidate.handle ?? candidate.username}</small></span></label>)}
            </div>
            <label className="w98-field"><span>{tr("canonicalPostEditor.otherFictionalLikeCount")}</span><IgDraftInput draftKey={`${scope}:${post.id}:other-likes`} type="number" min={0} max={1_000_000_000} label={tr("canonicalPostEditor.otherFictionalLikeCount")} value={String(post.otherLikeCount)} validate={validateCountDraft} onCommit={(value) => social((document) => setPostOtherLikeCount(document, post.id, Number(value), { siteId }), `post-other-likes-${post.id}`)} /></label>
            <strong>{tr("ig.actorComments", { count: post.actorComments.length })}</strong>
            {post.actorComments.map((comment, commentIndex) => <div key={comment.id} className="ig-actor-comment-row">
              <select className="w98-input compact" aria-label={tr("canonicalPostEditor.authorOfComment", { v1: commentIndex + 1 })} value={comment.authorKind === "profile" ? comment.authorProfileId : "__legacy"} onChange={(event) => changeComment(post.id, event.target.value === "__legacy" ? { id: comment.id, authorKind: "legacy", legacyAuthorText: comment.authorKind === "legacy" ? comment.legacyAuthorText : "friend", text: comment.text } : { id: comment.id, authorKind: "profile", authorProfileId: event.target.value, text: comment.text })}>
                {(ctx.profiles ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName ?? candidate.name}</option>)}
                <option value="__legacy">{tr("canonicalPostEditor.plainTextLegacyCharacter")}</option>
              </select>
              {comment.authorKind === "legacy" ? <input className="w98-input compact" aria-label={tr("canonicalPostEditor.oldAuthorNameOfComment", { v1: commentIndex + 1 })} value={comment.legacyAuthorText} onChange={(event) => changeComment(post.id, { ...comment, legacyAuthorText: event.target.value }, `comment-author-${comment.id}`)} /> : null}
              <input className="w98-input compact grow" aria-label={tr("canonicalPostEditor.contentOfComment", { v1: commentIndex + 1 })} value={comment.text} onChange={(event) => changeComment(post.id, { ...comment, text: event.target.value }, `comment-text-${comment.id}`)} />
              <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.moveCommentUp", { v1: commentIndex + 1 })} disabled={commentIndex === 0} onClick={() => social((document) => reorderActorComment(document, post.id, comment.id, -1, { siteId }))}>▲</button>
              <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.moveCommentDown", { v1: commentIndex + 1 })} disabled={commentIndex === post.actorComments.length - 1} onClick={() => social((document) => reorderActorComment(document, post.id, comment.id, 1, { siteId }))}>▼</button>
              <button type="button" className="mini-btn danger" aria-label={tr("canonicalPostEditor.deleteComment", { v1: commentIndex + 1 })} onClick={() => social((document) => deleteActorComment(document, post.id, comment.id, { siteId }))}>×</button>
            </div>)}
            <div className="ie-row"><button type="button" className="w98-btn small" onClick={() => social((document) => createActorComment(document, post.id, { authorKind: "profile", authorProfileId: authorId, text: "" }, { siteId, id: `comment:${crypto.randomUUID()}` }))}>{tr("canonicalPostEditor.characterComment")}</button><button type="button" className="w98-btn small" onClick={() => social((document) => createActorComment(document, post.id, { authorKind: "legacy", legacyAuthorText: "friend", text: "" }, { siteId, id: `comment:${crypto.randomUUID()}` }))}>{tr("canonicalPostEditor.plainTextComment")}</button></div>
          </fieldset>
          </details>
          <strong>{tr("ig.imagesOfTen", { count: post.media.length })}</strong>
          {post.media.map((media, mediaIndex) => <div key={media.id} className="ig-media-edit-row">
            <span className="ig-thumb sq48 ph">{media.src ? <AvatarImage src={media.src} crop={media.crop} alt={media.alt} /> : null}</span>
            <div className="ig-col grow">
              <ImageUrlField visibleLabel raw={media.srcUrl} placeholder={tr("canonicalPostEditor.imageUrl")} label={tr("canonicalPostEditor.urlOfImage", { v1: mediaIndex + 1 })} className="w98-input compact" onCommit={(raw, src) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { src, srcUrl: raw }, { siteId }), document))} />
              <input className="w98-input compact" aria-label={tr("canonicalPostEditor.altTextOfImage", { v1: mediaIndex + 1 })} value={media.alt} placeholder={tr("canonicalPostEditor.altTextMakesTheImage")} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { alt: event.target.value }, { siteId }), document), `media-alt-${media.id}`)} />
              <div className="ig-media-crop-controls" role="group" aria-label={tr("canonicalPostEditor.thumbnailCropOfImage", { v1: mediaIndex + 1 })}>
                <label><span>{tr("canonicalPostEditor.horizontal")}</span><input type="range" min={0} max={100} value={(media.crop ?? DEFAULT_CROP).x} aria-label={tr("canonicalPostEditor.horizontalCropOfImage", { v1: mediaIndex + 1 })} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), x: Number(event.target.value) } }, { siteId }), document), `media-crop-x-${media.id}`)} /></label>
                <label><span>{tr("canonicalPostEditor.vertical")}</span><input type="range" min={0} max={100} value={(media.crop ?? DEFAULT_CROP).y} aria-label={tr("canonicalPostEditor.verticalCropOfImage", { v1: mediaIndex + 1 })} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), y: Number(event.target.value) } }, { siteId }), document), `media-crop-y-${media.id}`)} /></label>
                <label><span>{tr("canonicalPostEditor.zoom")}</span><input type="range" min={1} max={4} step={0.05} value={(media.crop ?? DEFAULT_CROP).zoom} aria-label={tr("canonicalPostEditor.zoomOfImage", { v1: mediaIndex + 1 })} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), zoom: Number(event.target.value) } }, { siteId }), document), `media-crop-zoom-${media.id}`)} /></label>
                <button type="button" className="w98-btn small" aria-label={tr("canonicalPostEditor.resetCropOfImage", { v1: mediaIndex + 1 })} onClick={() => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: DEFAULT_CROP }, { siteId }), document))}>{tr("canonicalPostEditor.reset")}</button>
              </div>
            </div>
            <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.moveImageEarlier", { v1: mediaIndex + 1 })} disabled={mediaIndex === 0} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, -1, { siteId }), document))}>▲</button>
            <button type="button" className="mini-btn" aria-label={tr("canonicalPostEditor.moveImageLater", { v1: mediaIndex + 1 })} disabled={mediaIndex === post.media.length - 1} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, 1, { siteId }), document))}>▼</button>
            <button type="button" className="mini-btn danger" aria-label={tr("canonicalPostEditor.deleteImage", { v1: mediaIndex + 1 })} onClick={() => mutate((document) => run(deletePostMedia(document, post.id, media.id, { siteId }), document))}>×</button>
          </div>)}
          {post.media.length < 10 ? <>
            <div className="ie-row">
              <FilePick multiple disabled={!media.canUpload} className="w98-btn small" onFiles={(files) => uploadFiles(post.id, files)}>{tr("canonicalPostEditor.uploadMoreImages")}</FilePick>
              <label className={`ig-col grow ${sourceStyles.url}`}><span className="w98-hint">{tr("canonicalPostEditor.addCarouselImageUrl")}</span><input className="w98-input compact" aria-label={tr("canonicalPostEditor.addCarouselImageUrl")} value={mediaUrls[post.id] ?? ""} onChange={(event) => setMediaUrls((current) => ({ ...current, [post.id]: event.target.value }))} placeholder={tr("canonicalPostEditor.orPasteACarouselImage")} /></label>
              <button type="button" className="w98-btn small" onClick={() => {
                const raw = mediaUrls[post.id] ?? "";
                const result = normalizeImageUrl(raw);
                if (!result.ok) { setError(translateSystemMessage(result.reason)); return; }
                addMediaItems(post, [{ src: result.url, srcUrl: raw.trim(), alt: "" }]);
                setMediaUrls((current) => ({ ...current, [post.id]: "" }));
              }}>{tr("canonicalHighlightEditor.add")}</button>
            </div>
          </> : null}
        </div> : null}
      </article>;
    })}
  </fieldset>;
}
