import { useId } from "react";
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

type Props = { props: ModuleProps<"instagram"> };
type Uploaded = { src: string; name: string };

export function CanonicalPostEditor({ props }: Props) {
  const { ctx } = props;
  const authorId = ctx.profileId;
  const posts = (ctx.posts ?? []).filter((post) => post.authorProfileId === authorId);
  const scope = igEditorScope(props);
  const editorId = useId();
  const [newPostUrl, setNewPostUrl] = useIgEditorState(scope, "");
  const [mediaUrls, setMediaUrls] = useIgEditorState<Record<string, string>>(scope, {});
  const [openId, setOpenId] = useIgEditorState<string | null>(scope, posts[0]?.id ?? null);
  const [error, setError] = useIgEditorState(scope, "");
  const [pendingUploads, setPendingUploads] = useIgEditorState(scope, 0);
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
      setError(result.diagnostics?.[0]?.message ?? "內容更新失敗，請再試一次。");
      return fallback;
    }
    return result.document;
  };
  // Render-bound author/site ids and scoped setters keep late uploads attached
  // to the original character when the user switches profiles mid-upload.
  const uploadFiles = async (files: File[], onUploaded: (items: Uploaded[]) => void) => {
    setError("");
    setPendingUploads((current) => current + 1);
    try {
      const uploaded = await Promise.allSettled(files.map(async (file) => {
        const src = await ctx.upload?.(file, "image");
        return src ? { src, name: file.name } : null;
      }));
      const successful = uploaded.flatMap((item) => item.status === "fulfilled" && item.value ? [item.value] : []);
      if (successful.length) onUploaded(successful);
      if (successful.length !== files.length) setError((current) => [current, `${files.length - successful.length} 張圖片上傳失敗，請重新選擇這些圖片。`].filter(Boolean).join(" "));
    } catch {
      setError("圖片上傳或貼文更新失敗，請再試一次。");
    } finally {
      setPendingUploads((current) => Math.max(0, current - 1));
    }
  };
  const addPostFromMedia = (items: Array<{ src: string; srcUrl: string; alt: string }>, title = "") => {
    if (!items.length) return;
    const id = `post:${crypto.randomUUID()}`;
    mutate((document) => {
      const result = createPost(document, {
        id,
        authorProfileId: authorId,
        title,
        date: new Date().toLocaleDateString("zh-TW"),
        media: items.slice(0, 10).map((item) => ({ id: `media:${crypto.randomUUID()}`, ...item }))
      }, { siteId });
      if (result.ok) {
        setFilters(DEFAULT_POST_EDITOR_FILTERS);
        setOpenId(id);
      }
      return run(result, document);
    });
  };
  const patchPost = (post: PostEntityV2, patch: Partial<PostEntityV2>, key?: string) => mutate(
    (document) => run(updatePost(document, post.id, patch, { siteId }), document),
    key
  );
  const addMediaItems = (post: PostEntityV2, items: Array<{ src: string; srcUrl: string; alt: string }>) => mutate((document) => {
    const target = document.entities.posts.find((candidate) => candidate.id === post.id && candidate.authorProfileId === authorId);
    if (!target) {
      setError("找不到原貼文，圖片尚未加入。");
      return document;
    }
    // Raw v2 input may omit media; the canonical operation applies the [] default.
    const available = Math.max(0, 10 - (target.media?.length ?? 0));
    if (items.length > available) setError("貼文最多可放 10 張圖片，超出的圖片尚未加入。");
    return items.slice(0, available).reduce(
      (next, item) => run(addPostMedia(next, post.id, { id: `media:${crypto.randomUUID()}`, ...item }, { siteId }), next),
      document
    );
  });
  const social = (recipe: (document: SiteDocumentV2Input) => ReturnType<typeof setPostNamedLikers>, key?: string) => mutate((document) => run(recipe(document), document), key);
  const changeComment = (postId: string, comment: ActorCommentV2, key?: string) => social((document) => updateActorComment(document, postId, comment.id, comment, { siteId }), key);

  return <fieldset className="w98-fieldset ig-canonical-posts"><legend>貼文與作品（{posts.length}）</legend>
    <div className="ie-row">
      <FilePick multiple className="w98-btn small" onFiles={async (files) => {
        await uploadFiles(files.slice(0, 10), (uploaded) => addPostFromMedia(uploaded.map((item) => ({ src: item.src, srcUrl: "", alt: "" })), uploaded[0]?.name.replace(/\.[^.]+$/, "") ?? ""));
      }}>{pendingUploads > 0 ? "上傳中…" : "上傳新貼文（最多 10 張）"}</FilePick>
      <input className="w98-input compact grow" aria-label="新貼文圖片網址" value={newPostUrl} onChange={(event) => setNewPostUrl(event.target.value)} placeholder="或貼上圖片網址" />
      <button type="button" className="w98-btn small" onClick={() => {
        const result = normalizeImageUrl(newPostUrl);
        if (!result.ok) { setError(result.reason); return; }
        addPostFromMedia([{ src: result.url, srcUrl: newPostUrl.trim(), alt: "" }]);
        setNewPostUrl("");
      }}>新增</button>
    </div>
    {error ? <div className="ie-error" role="alert">{error}</div> : null}
    <p className="w98-hint">每篇可放 1–10 張圖。展開後可調整順序、替代文字、世界觀日期與公開狀態。</p>
    <div className="ig-post-filters" role="group" aria-label="貼文搜尋與篩選">
      <label className="w98-field"><span className="w98-hint">搜尋貼文</span><input type="search" className="w98-input compact" aria-label="貼文搜尋" value={filters.query} onChange={(event) => changeFilters({ query: event.target.value })} placeholder="標題、內容、地點、日期或替代文字" /></label>
      <div className="ie-row">
        <label className="w98-field"><span className="w98-hint">顯示狀態</span><select className="w98-input compact" aria-label="貼文狀態篩選" value={filters.visibility} onChange={(event) => changeFilters({ visibility: event.target.value as PostEditorFilters["visibility"] })}>
          <option value="all">全部狀態</option><option value="draft">草稿</option><option value="published">公開</option>
        </select></label>
        <label className="check-row"><input type="checkbox" checked={filters.pinnedOnly} onChange={(event) => changeFilters({ pinnedOnly: event.target.checked })} />只看置頂貼文</label>
        <button type="button" className="w98-btn small" disabled={!filtersActive && !filters.query} onClick={clearFilters}>清除貼文篩選</button>
      </div>
    </div>
    <p className="w98-hint ig-post-filter-status" role="status" aria-live="polite">顯示 {matchCount} / {posts.length} 篇{retainedCount ? "；另保留 1 篇正在編輯的貼文。" : "。"}</p>
    {filtersActive ? <p className="w98-hint" id={`${editorId}-order-hint`}>搜尋或篩選中暫停排序，清除篩選後可調整完整貼文順序。</p> : null}
    {!posts.length ? <p className="ig-post-empty w98-hint">這個角色還沒有貼文。上傳圖片或貼上圖片網址，建立第一篇草稿。</p> : matchCount === 0 ? <p className="ig-post-empty w98-hint">沒有符合條件的貼文，可更換關鍵字或清除篩選。</p> : null}
    {rows.map(({ post, authoredIndex, matchesFilters }) => {
      const expanded = openId === post.id;
      return <article key={post.id} className="ig-canonical-post">
        {!matchesFilters ? <p className="ig-post-retained-note w98-hint">這篇貼文已不符合目前篩選，收合後會從清單隱藏。</p> : null}
        <div className="ig-post-row">
          <span className="ig-thumb sq ph">{post.media[0]?.src ? <AvatarImage src={post.media[0].src} crop={post.media[0].crop} alt={post.media[0].alt} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} aria-controls={expanded ? `${editorId}-${post.id}` : undefined} onClick={() => setOpenId(expanded ? null : post.id)}>
            <span>{expanded ? "▾" : "▸"} {post.title || "（無標題）"}</span>
            <small>{post.media.length} 張 · {post.visibility === "published" ? "公開" : "草稿"}{post.pinned ? " · 已置頂" : ""}</small>
          </button>
          <button type="button" className="mini-btn" aria-label="貼文往前" aria-describedby={filtersActive ? `${editorId}-order-hint` : undefined} disabled={filtersActive || authoredIndex === 0} onClick={() => mutate((document) => run(reorderPost(document, post.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label="貼文往後" aria-describedby={filtersActive ? `${editorId}-order-hint` : undefined} disabled={filtersActive || authoredIndex === posts.length - 1} onClick={() => mutate((document) => run(reorderPost(document, post.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label="刪除貼文" onClick={() => mutate((document) => run(deletePost(document, post.id, { siteId }), document))}>×</button>
        </div>
        {expanded ? <div className="ig-post-body ig-canonical-post-fields" id={`${editorId}-${post.id}`}>
          <label className="w98-field"><span className="w98-hint">標題</span><input className="w98-input compact" value={post.title} onChange={(event) => patchPost(post, { title: event.target.value }, `post-title-${post.id}`)} /></label>
          <label className="w98-field"><span className="w98-hint">貼文內容</span><textarea className="w98-textarea" rows={3} value={post.caption} onChange={(event) => patchPost(post, { caption: event.target.value }, `post-caption-${post.id}`)} /></label>
          <div className="ig-trio">
            <label className="w98-field"><span className="w98-hint">地點</span><input className="w98-input compact" value={post.location} onChange={(event) => patchPost(post, { location: event.target.value }, `post-location-${post.id}`)} /></label>
            <label className="w98-field"><span className="w98-hint">顯示日期</span><input className="w98-input compact" value={post.date} onChange={(event) => patchPost(post, { date: event.target.value }, `post-date-${post.id}`)} /></label>
            <label className="w98-field"><span className="w98-hint">世界觀日期</span><input className="w98-input compact" value={post.worldDateLabel} onChange={(event) => patchPost(post, { worldDateLabel: event.target.value }, `post-world-date-${post.id}`)} /></label>
          </div>
          <div className="ie-row">
            <label className="check-row"><input type="checkbox" checked={post.visibility === "published"} onChange={(event) => patchPost(post, { visibility: event.target.checked ? "published" : "draft" })} />公開顯示</label>
            <label className="check-row"><input type="checkbox" checked={post.pinned} onChange={(event) => patchPost(post, { pinned: event.target.checked })} />置頂</label>
          </div>
          <details className="ig-post-social-details"><summary>角色互動（喜歡與留言）</summary>
          <fieldset className="w98-fieldset ig-post-social"><legend>角色世界觀互動</legend>
            <strong>具名喜歡者</strong>
            <div className="ig-social-checks compact">
              {(ctx.profiles ?? []).map((candidate) => <label key={`${post.id}-liker-${candidate.id}`} className="check-row"><input type="checkbox" checked={post.namedLikerIds.includes(candidate.id)} onChange={(event) => social((document) => setPostNamedLikers(document, post.id, event.target.checked ? [...post.namedLikerIds, candidate.id] : post.namedLikerIds.filter((id) => id !== candidate.id), { siteId }))} /><span>{candidate.displayName ?? candidate.name} <small>@{candidate.handle ?? candidate.username}</small></span></label>)}
            </div>
            <label className="w98-field"><span>其他虛構喜歡人數</span><input type="number" min={0} max={1_000_000_000} className="w98-input compact" aria-label="其他虛構喜歡人數" value={post.otherLikeCount} onChange={(event) => social((document) => setPostOtherLikeCount(document, post.id, Math.max(0, Number(event.target.value) || 0), { siteId }), `post-other-likes-${post.id}`)} /></label>
            <strong>角色留言（{post.actorComments.length}）</strong>
            {post.actorComments.map((comment, commentIndex) => <div key={comment.id} className="ig-actor-comment-row">
              <select className="w98-input compact" aria-label={`留言 ${commentIndex + 1} 作者`} value={comment.authorKind === "profile" ? comment.authorProfileId : "__legacy"} onChange={(event) => changeComment(post.id, event.target.value === "__legacy" ? { id: comment.id, authorKind: "legacy", legacyAuthorText: comment.authorKind === "legacy" ? comment.legacyAuthorText : "friend", text: comment.text } : { id: comment.id, authorKind: "profile", authorProfileId: event.target.value, text: comment.text })}>
                {(ctx.profiles ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName ?? candidate.name}</option>)}
                <option value="__legacy">純文字舊角色</option>
              </select>
              {comment.authorKind === "legacy" ? <input className="w98-input compact" aria-label={`留言 ${commentIndex + 1} 舊作者名稱`} value={comment.legacyAuthorText} onChange={(event) => changeComment(post.id, { ...comment, legacyAuthorText: event.target.value }, `comment-author-${comment.id}`)} /> : null}
              <input className="w98-input compact grow" aria-label={`留言 ${commentIndex + 1} 內容`} value={comment.text} onChange={(event) => changeComment(post.id, { ...comment, text: event.target.value }, `comment-text-${comment.id}`)} />
              <button type="button" className="mini-btn" aria-label={`留言 ${commentIndex + 1} 往前`} disabled={commentIndex === 0} onClick={() => social((document) => reorderActorComment(document, post.id, comment.id, -1, { siteId }))}>▲</button>
              <button type="button" className="mini-btn" aria-label={`留言 ${commentIndex + 1} 往後`} disabled={commentIndex === post.actorComments.length - 1} onClick={() => social((document) => reorderActorComment(document, post.id, comment.id, 1, { siteId }))}>▼</button>
              <button type="button" className="mini-btn danger" aria-label={`刪除留言 ${commentIndex + 1}`} onClick={() => social((document) => deleteActorComment(document, post.id, comment.id, { siteId }))}>×</button>
            </div>)}
            <div className="ie-row"><button type="button" className="w98-btn small" onClick={() => social((document) => createActorComment(document, post.id, { authorKind: "profile", authorProfileId: authorId, text: "" }, { siteId, id: `comment:${crypto.randomUUID()}` }))}>＋ 角色留言</button><button type="button" className="w98-btn small" onClick={() => social((document) => createActorComment(document, post.id, { authorKind: "legacy", legacyAuthorText: "friend", text: "" }, { siteId, id: `comment:${crypto.randomUUID()}` }))}>＋ 純文字留言</button></div>
          </fieldset>
          </details>
          <strong>圖片（{post.media.length}/10）</strong>
          {post.media.map((media, mediaIndex) => <div key={media.id} className="ig-media-edit-row">
            <span className="ig-thumb sq48 ph">{media.src ? <AvatarImage src={media.src} crop={media.crop} alt={media.alt} /> : null}</span>
            <div className="ig-col grow">
              <ImageUrlField raw={media.srcUrl} placeholder="圖片網址" label={`圖片 ${mediaIndex + 1} 網址`} className="w98-input compact" onCommit={(raw, src) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { src, srcUrl: raw }, { siteId }), document))} />
              <input className="w98-input compact" aria-label={`圖片 ${mediaIndex + 1} 替代文字`} value={media.alt} placeholder="替代文字（讓圖片更容易理解）" onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { alt: event.target.value }, { siteId }), document), `media-alt-${media.id}`)} />
              <div className="ig-media-crop-controls" role="group" aria-label={`圖片 ${mediaIndex + 1} 縮圖裁切`}>
                <label><span>水平</span><input type="range" min={0} max={100} value={(media.crop ?? DEFAULT_CROP).x} aria-label={`圖片 ${mediaIndex + 1} 水平裁切`} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), x: Number(event.target.value) } }, { siteId }), document), `media-crop-x-${media.id}`)} /></label>
                <label><span>垂直</span><input type="range" min={0} max={100} value={(media.crop ?? DEFAULT_CROP).y} aria-label={`圖片 ${mediaIndex + 1} 垂直裁切`} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), y: Number(event.target.value) } }, { siteId }), document), `media-crop-y-${media.id}`)} /></label>
                <label><span>縮放</span><input type="range" min={1} max={4} step={0.05} value={(media.crop ?? DEFAULT_CROP).zoom} aria-label={`圖片 ${mediaIndex + 1} 縮放`} onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: { ...(media.crop ?? DEFAULT_CROP), zoom: Number(event.target.value) } }, { siteId }), document), `media-crop-zoom-${media.id}`)} /></label>
                <button type="button" className="w98-btn small" aria-label={`重設圖片 ${mediaIndex + 1} 裁切`} onClick={() => mutate((document) => run(patchPostMedia(document, post.id, media.id, { crop: DEFAULT_CROP }, { siteId }), document))}>重設</button>
              </div>
            </div>
            <button type="button" className="mini-btn" aria-label={`圖片 ${mediaIndex + 1} 往前`} disabled={mediaIndex === 0} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, -1, { siteId }), document))}>▲</button>
            <button type="button" className="mini-btn" aria-label={`圖片 ${mediaIndex + 1} 往後`} disabled={mediaIndex === post.media.length - 1} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, 1, { siteId }), document))}>▼</button>
            <button type="button" className="mini-btn danger" aria-label={`刪除圖片 ${mediaIndex + 1}`} onClick={() => mutate((document) => run(deletePostMedia(document, post.id, media.id, { siteId }), document))}>×</button>
          </div>)}
          {post.media.length < 10 ? <>
            <div className="ie-row">
              <FilePick multiple className="w98-btn small" onFiles={async (files) => {
                await uploadFiles(files.slice(0, 10 - post.media.length), (uploaded) => addMediaItems(post, uploaded.map((item) => ({ src: item.src, srcUrl: "", alt: "" }))));
              }}>上傳更多圖片</FilePick>
              <input className="w98-input compact grow" aria-label="新增輪播圖片網址" value={mediaUrls[post.id] ?? ""} onChange={(event) => setMediaUrls((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="或貼上輪播圖片網址" />
              <button type="button" className="w98-btn small" onClick={() => {
                const raw = mediaUrls[post.id] ?? "";
                const result = normalizeImageUrl(raw);
                if (!result.ok) { setError(result.reason); return; }
                addMediaItems(post, [{ src: result.url, srcUrl: raw.trim(), alt: "" }]);
                setMediaUrls((current) => ({ ...current, [post.id]: "" }));
              }}>加入</button>
            </div>
          </> : null}
        </div> : null}
      </article>;
    })}
  </fieldset>;
}
