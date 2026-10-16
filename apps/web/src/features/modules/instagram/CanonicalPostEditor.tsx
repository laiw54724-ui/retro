import { useState } from "react";
import {
  addPostMedia,
  createPost,
  deletePost,
  deletePostMedia,
  normalizeImageUrl,
  patchPostMedia,
  reorderPost,
  reorderPostMedia,
  updatePost,
  type PostEntityV2,
  type SiteDocumentV2Input
} from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { FilePick, ImageUrlField, SafeImg } from "../ui";

type Props = { props: ModuleProps<"instagram"> };
type Uploaded = { src: string; name: string };

export function CanonicalPostEditor({ props }: Props) {
  const { ctx } = props;
  const authorId = ctx.profileId;
  const posts = (ctx.posts ?? []).filter((post) => post.authorProfileId === authorId);
  const [newPostUrl, setNewPostUrl] = useState("");
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(posts[0]?.id ?? null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

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
  const uploadFiles = async (files: File[]): Promise<Uploaded[]> => {
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const src = await ctx.upload?.(file, "image");
        return src ? { src, name: file.name } : null;
      }));
      const successful = uploaded.filter((item): item is Uploaded => !!item);
      if (successful.length !== files.length) setError(`${files.length - successful.length} 張圖片上傳失敗；成功的圖片已保留。`);
      return successful;
    } finally {
      setUploading(false);
    }
  };
  const addPostFromMedia = (items: Array<{ src: string; srcUrl: string; alt: string }>, title = "") => {
    if (!items.length) return;
    const id = `post:${crypto.randomUUID()}`;
    mutate((document) => run(createPost(document, {
      id,
      authorProfileId: authorId,
      title,
      date: new Date().toLocaleDateString("zh-TW"),
      media: items.slice(0, 10).map((item) => ({ id: `media:${crypto.randomUUID()}`, ...item }))
    }, { siteId }), document));
    setOpenId(id);
  };
  const patchPost = (post: PostEntityV2, patch: Partial<PostEntityV2>, key?: string) => mutate(
    (document) => run(updatePost(document, post.id, patch, { siteId }), document),
    key
  );
  const addMediaItems = (post: PostEntityV2, items: Array<{ src: string; srcUrl: string; alt: string }>) => mutate((document) => items.slice(0, Math.max(0, 10 - post.media.length)).reduce(
    (next, item) => run(addPostMedia(next, post.id, { id: `media:${crypto.randomUUID()}`, ...item }, { siteId }), next),
    document
  ));

  return <fieldset className="w98-fieldset ig-canonical-posts"><legend>貼文與作品（{posts.length}）</legend>
    <div className="ie-row">
      <FilePick multiple className="w98-btn small" onFiles={async (files) => {
        const uploaded = await uploadFiles(files.slice(0, 10));
        addPostFromMedia(uploaded.map((item) => ({ src: item.src, srcUrl: "", alt: "" })), uploaded[0]?.name.replace(/\.[^.]+$/, "") ?? "");
      }}>{uploading ? "上傳中…" : "上傳新貼文（最多 10 張）"}</FilePick>
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
    {posts.map((post, postIndex) => {
      const expanded = openId === post.id;
      return <article key={post.id} className="ig-canonical-post">
        <div className="ig-post-row">
          <span className="ig-thumb sq ph">{post.media[0]?.src ? <SafeImg src={post.media[0].src} alt={post.media[0].alt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
          <button type="button" className="ig-post-toggle" aria-expanded={expanded} onClick={() => setOpenId(expanded ? null : post.id)}>
            <span>{expanded ? "▾" : "▸"} {post.title || "（無標題）"}</span>
            <small>{post.media.length} 張 · {post.visibility === "published" ? "公開" : "草稿"}{post.pinned ? " · 已置頂" : ""}</small>
          </button>
          <button type="button" className="mini-btn" aria-label="貼文往前" disabled={postIndex === 0} onClick={() => mutate((document) => run(reorderPost(document, post.id, -1, { siteId }), document))}>▲</button>
          <button type="button" className="mini-btn" aria-label="貼文往後" disabled={postIndex === posts.length - 1} onClick={() => mutate((document) => run(reorderPost(document, post.id, 1, { siteId }), document))}>▼</button>
          <button type="button" className="mini-btn danger" aria-label="刪除貼文" onClick={() => mutate((document) => run(deletePost(document, post.id, { siteId }), document))}>×</button>
        </div>
        {expanded ? <div className="ig-post-body ig-canonical-post-fields">
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
          <strong>圖片（{post.media.length}/10）</strong>
          {post.media.map((media, mediaIndex) => <div key={media.id} className="ig-media-edit-row">
            <span className="ig-thumb sq48 ph">{media.src ? <SafeImg src={media.src} alt={media.alt} compact style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}</span>
            <div className="ig-col grow">
              <ImageUrlField raw={media.srcUrl} placeholder="圖片網址" label={`圖片 ${mediaIndex + 1} 網址`} className="w98-input compact" onCommit={(raw, src) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { src, srcUrl: raw }, { siteId }), document))} />
              <input className="w98-input compact" aria-label={`圖片 ${mediaIndex + 1} 替代文字`} value={media.alt} placeholder="替代文字（讓圖片更容易理解）" onChange={(event) => mutate((document) => run(patchPostMedia(document, post.id, media.id, { alt: event.target.value }, { siteId }), document), `media-alt-${media.id}`)} />
            </div>
            <button type="button" className="mini-btn" aria-label={`圖片 ${mediaIndex + 1} 往前`} disabled={mediaIndex === 0} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, -1, { siteId }), document))}>▲</button>
            <button type="button" className="mini-btn" aria-label={`圖片 ${mediaIndex + 1} 往後`} disabled={mediaIndex === post.media.length - 1} onClick={() => mutate((document) => run(reorderPostMedia(document, post.id, media.id, 1, { siteId }), document))}>▼</button>
            <button type="button" className="mini-btn danger" aria-label={`刪除圖片 ${mediaIndex + 1}`} onClick={() => mutate((document) => run(deletePostMedia(document, post.id, media.id, { siteId }), document))}>×</button>
          </div>)}
          {post.media.length < 10 ? <>
            <div className="ie-row">
              <FilePick multiple className="w98-btn small" onFiles={async (files) => {
                const uploaded = await uploadFiles(files.slice(0, 10 - post.media.length));
                addMediaItems(post, uploaded.map((item) => ({ src: item.src, srcUrl: "", alt: "" })));
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
