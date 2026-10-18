import { useId } from "react";
import {
  createCollection,
  deleteCollection,
  reorderCollection,
  setCollectionPosts,
  updateCollection,
  type CollectionEntityV2,
  type SiteDocumentV2Input,
} from "@retrodesk/shared";
import type { ModuleProps } from "../types";
import { igEditorScope, useIgEditorState } from "./useIgEditorState";

type Props = { props: ModuleProps<"instagram"> };
type Result = {
  ok: boolean;
  document?: SiteDocumentV2Input;
  diagnostics?: Array<{ message: string }>;
};

export function CanonicalCollectionEditor({ props }: Props) {
  const { ctx } = props;
  const ownerId = ctx.profileId;
  const collections = (ctx.collections ?? []).filter(
    (collection) => collection.ownerProfileId === ownerId,
  );
  const posts = (ctx.posts ?? []).filter(
    (post) => post.authorProfileId === ownerId,
  );
  const scope = `${igEditorScope(props)}:collections`;
  const editorId = useId();
  const [openId, setOpenId] = useIgEditorState<string | null>(scope, collections[0]?.id ?? null);
  const [query, setQuery] = useIgEditorState(scope, "");
  const [postQueries, setPostQueries] = useIgEditorState<Record<string, string>>(scope, {});
  const [error, setError] = useIgEditorState(scope, "");
  const search = query.normalize("NFKC").trim().toLowerCase();
  const matches = (collection: CollectionEntityV2) => `${collection.title} ${collection.description}`.normalize("NFKC").toLowerCase().includes(search);
  const matchingCollections = collections.filter(matches);
  // An open collection stays mounted while its title/description is being edited.
  const visibleCollections = collections.filter((collection) => matches(collection) || collection.id === openId);
  const retainedEditor = visibleCollections.length > matchingCollections.length;
  const publishedCount = collections.filter((collection) => collection.visibility === "published").length;
  const postsById = new Map(posts.map((post) => [post.id, post]));

  if (!ctx.updateContent || !ctx.siteId || !ownerId) return null;
  const siteId = ctx.siteId;
  const run = (result: Result, fallback: SiteDocumentV2Input) => {
    if (!result.ok || !result.document) {
      setError(result.diagnostics?.[0]?.message ?? "合集更新失敗，請再試一次。");
      return fallback;
    }
    return result.document;
  };
  const mutate = (
    recipe: (document: SiteDocumentV2Input) => SiteDocumentV2Input,
    historyKey?: string,
  ) => {
    setError("");
    ctx.updateContent?.(recipe, historyKey);
  };
  const patchCollection = (
    collection: CollectionEntityV2,
    patch: Partial<CollectionEntityV2>,
    historyKey?: string,
  ) => mutate(
    (document) => run(updateCollection(document, collection.id, patch, { siteId }), document),
    historyKey,
  );
  const setPosts = (collection: CollectionEntityV2, postIds: string[]) => mutate(
    (document) => run(setCollectionPosts(document, collection.id, postIds, { siteId }), document),
  );

  return (
    <fieldset className="w98-fieldset ig-canonical-collections">
      <legend>合集（{collections.length}）</legend>
      <div className="ie-row">
        <button
          type="button"
          className="w98-btn small"
          onClick={() => {
            const id = `collection:${crypto.randomUUID()}`;
            mutate((document) => run(createCollection(document, {
              id,
              ownerProfileId: ownerId,
              title: "新合集",
            }, { siteId }), document));
            setQuery("");
            setOpenId(id);
          }}
        >＋ 新增合集</button>
        <span className="w98-hint">同一篇貼文可放入多個合集，不會複製圖片。</span>
      </div>
      {collections.length ? <label className="w98-field">
        <span className="w98-hint">搜尋合集</span>
        <input className="w98-input compact" type="search" value={query} placeholder="依合集標題或說明搜尋" onChange={(event) => {
          setQuery(event.target.value);
          setOpenId(null);
        }} />
      </label> : null}
      <p className="ig-editor-summary" role="status">符合搜尋 {matchingCollections.length} / {collections.length} 組 · 公開 {publishedCount} · 草稿 {collections.length - publishedCount}{retainedEditor ? "。正在編輯的合集仍保留顯示。" : ""}</p>
      {query ? <button type="button" className="w98-btn small" onClick={() => setQuery("")}>清除合集搜尋</button> : null}
      {search ? <p className="w98-hint" id={`${editorId}-order-hint`}>清除搜尋後可調整完整合集順序。</p> : null}
      {error ? <div role="alert" className="ie-error">{error}</div> : null}
      {!collections.length ? <p className="ig-editor-empty">尚未建立合集。依作品系列、世界觀或故事篇章整理這個角色的貼文。</p> : !visibleCollections.length ? <p className="ig-editor-empty">沒有符合搜尋的合集，請換個關鍵字。</p> : null}
      {visibleCollections.map((collection) => {
        const collectionIndex = collections.findIndex((candidate) => candidate.id === collection.id);
        const expanded = openId === collection.id;
        const bodyId = `${editorId}-${collection.id}`;
        const selectedPosts = expanded ? collection.postIds.flatMap((postId) => {
          const post = postsById.get(postId);
          return post ? [post] : [];
        }) : [];
        const selectedIds = new Set(collection.postIds);
        const orderedPosts = expanded ? [
          ...selectedPosts,
          ...posts.filter((post) => !selectedIds.has(post.id)),
        ] : [];
        const postQuery = postQueries[collection.id] ?? "";
        const postSearch = postQuery.normalize("NFKC").trim().toLowerCase();
        // Filtering affects presentation only. Membership/order actions below always use
        // the complete canonical postIds, including selected posts hidden by this search.
        const visiblePosts = orderedPosts.filter((post) => `${post.title} ${post.caption}`.normalize("NFKC").toLowerCase().includes(postSearch));
        const selectedPublished = selectedPosts.filter((post) => post.visibility === "published").length;
        const selectedDrafts = selectedPosts.filter((post) => post.visibility === "draft").length;
        return (
          <article key={collection.id} className="ig-canonical-post">
            <div className="ig-post-row">
              <button
                type="button"
                className="ig-post-toggle"
                aria-expanded={expanded}
                aria-controls={expanded ? bodyId : undefined}
                onClick={() => setOpenId(expanded ? null : collection.id)}
              >
                <span>{expanded ? "▾" : "▸"} {collection.title || "（未命名合集）"}</span>
                <small>{collection.postIds.length} 篇 · {collection.visibility === "published" ? "公開" : "草稿"}</small>
              </button>
              <button
                type="button"
                className="mini-btn"
                aria-label="合集往前"
                aria-describedby={search ? `${editorId}-order-hint` : undefined}
                disabled={!!search || collectionIndex === 0}
                onClick={() => mutate((document) => run(reorderCollection(document, collection.id, -1, { siteId }), document))}
              >▲</button>
              <button
                type="button"
                className="mini-btn"
                aria-label="合集往後"
                aria-describedby={search ? `${editorId}-order-hint` : undefined}
                disabled={!!search || collectionIndex === collections.length - 1}
                onClick={() => mutate((document) => run(reorderCollection(document, collection.id, 1, { siteId }), document))}
              >▼</button>
              <button
                type="button"
                className="mini-btn danger"
                aria-label={`刪除合集 ${collection.title}`}
                onClick={() => {
                  if (!window.confirm(`確定刪除合集「${collection.title}」？貼文本身會保留。`)) return;
                  mutate((document) => run(deleteCollection(document, collection.id, { siteId }), document));
                }}
              >×</button>
            </div>
            {expanded ? (
              <div id={bodyId} className="ig-post-body ig-canonical-collection-fields">
                <label className="w98-field">
                  <span className="w98-hint">合集標題</span>
                  <input
                    className="w98-input compact"
                    aria-label="合集標題"
                    maxLength={120}
                    value={collection.title}
                    onChange={(event) => patchCollection(collection, { title: event.target.value }, `collection-title-${collection.id}`)}
                  />
                </label>
                <label className="w98-field">
                  <span className="w98-hint">合集說明</span>
                  <textarea
                    className="w98-textarea"
                    aria-label="合集說明"
                    rows={2}
                    maxLength={1000}
                    value={collection.description}
                    onChange={(event) => patchCollection(collection, { description: event.target.value }, `collection-description-${collection.id}`)}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    aria-label="公開合集"
                    checked={collection.visibility === "published"}
                    onChange={(event) => patchCollection(collection, { visibility: event.target.checked ? "published" : "draft" })}
                  />公開合集
                </label>
                <strong>收錄與排序</strong>
                {postSearch ? <p className="w98-hint">排序依完整收錄順序，包含搜尋結果外的已收錄貼文。</p> : null}
                <p className="ig-editor-summary" role="status">已收錄 {collection.postIds.length} 篇（公開 {selectedPublished} · 草稿 {selectedDrafts}）</p>
                <p className="w98-hint">搜尋只改變下方清單；已收錄貼文與順序會保留。草稿貼文不會出現在公開合集。</p>
                {posts.length ? <>
                  <label className="w98-field">
                    <span className="w98-hint">搜尋合集貼文</span>
                    <input
                      className="w98-input compact"
                      type="search"
                      value={postQuery}
                      placeholder="依貼文標題或內容搜尋"
                      onChange={(event) => setPostQueries((current) => ({ ...current, [collection.id]: event.target.value }))}
                    />
                  </label>
                  <div className="ie-row">
                    <span className="ig-editor-summary" role="status">顯示 {visiblePosts.length} / {orderedPosts.length} 篇可收錄貼文</span>
                    {postQuery ? <button type="button" className="w98-btn small" onClick={() => setPostQueries((current) => ({ ...current, [collection.id]: "" }))}>清除合集貼文搜尋</button> : null}
                  </div>
                </> : null}
                {visiblePosts.length ? (
                  <div className="ig-collection-post-list" role="group" aria-label="合集貼文選擇">
                    {visiblePosts.map((post) => {
                      const selectedIndex = collection.postIds.indexOf(post.id);
                      const selected = selectedIndex >= 0;
                      return (
                        <div
                          key={post.id}
                          className="ig-collection-post-row"
                          data-order={selected ? selectedIndex + 1 : 0}
                        >
                          <label className="check-row grow">
                            <input
                              type="checkbox"
                              aria-label={`收錄 ${post.title || "無標題貼文"}`}
                              aria-describedby={`${bodyId}-visibility-${post.id}`}
                              checked={selected}
                              onChange={(event) => setPosts(
                                collection,
                                event.target.checked
                                  ? [...collection.postIds, post.id]
                                  : collection.postIds.filter((id) => id !== post.id),
                              )}
                            />
                            <span className="ig-collection-post-copy">
                              <span>{selected ? `${selectedIndex + 1}. ` : ""}{post.title || "（無標題）"}</span>
                              {post.caption ? <small>{post.caption}</small> : null}
                            </span>
                          </label>
                          <small id={`${bodyId}-visibility-${post.id}`} className="ig-editor-badge" data-visibility={post.visibility}>{post.visibility === "published" ? "公開" : "草稿"}</small>
                          {selected ? <>
                            <button
                              type="button"
                              className="mini-btn"
                              aria-label={`合集貼文 ${post.title || "無標題"} 往前`}
                              disabled={selectedIndex === 0}
                              onClick={() => {
                                const next = [...collection.postIds];
                                [next[selectedIndex - 1], next[selectedIndex]] = [next[selectedIndex], next[selectedIndex - 1]];
                                setPosts(collection, next);
                              }}
                            >▲</button>
                            <button
                              type="button"
                              className="mini-btn"
                              aria-label={`合集貼文 ${post.title || "無標題"} 往後`}
                              disabled={selectedIndex === collection.postIds.length - 1}
                              onClick={() => {
                                const next = [...collection.postIds];
                                [next[selectedIndex], next[selectedIndex + 1]] = [next[selectedIndex + 1], next[selectedIndex]];
                                setPosts(collection, next);
                              }}
                            >▼</button>
                          </> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="ig-editor-empty">{posts.length ? "沒有符合搜尋的貼文。已收錄的貼文仍保留在合集，可以清除搜尋再查看。" : "先建立這個角色的貼文，再加入合集。"}</p>}
              </div>
            ) : null}
          </article>
        );
      })}
    </fieldset>
  );
}
