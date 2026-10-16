import { useEffect, useState } from "react";
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
  const [openId, setOpenId] = useState<string | null>(
    collections[0]?.id ?? null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (openId && !collections.some((collection) => collection.id === openId)) {
      setOpenId(collections[0]?.id ?? null);
    }
  }, [collections, openId]);

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
            setOpenId(id);
          }}
        >＋ 新增合集</button>
        <span className="w98-hint">同一篇貼文可放入多個合集，不會複製圖片。</span>
      </div>
      {error ? <div role="alert" className="ie-error">{error}</div> : null}
      {collections.map((collection, collectionIndex) => {
        const expanded = openId === collection.id;
        const selectedPosts = collection.postIds.flatMap((postId) => {
          const post = posts.find((candidate) => candidate.id === postId);
          return post ? [post] : [];
        });
        const selectedIds = new Set(selectedPosts.map((post) => post.id));
        const orderedPosts = [
          ...selectedPosts,
          ...posts.filter((post) => !selectedIds.has(post.id)),
        ];
        return (
          <article key={collection.id} className="ig-canonical-post">
            <div className="ig-post-row">
              <button
                type="button"
                className="ig-post-toggle"
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : collection.id)}
              >
                <span>{expanded ? "▾" : "▸"} {collection.title || "（未命名合集）"}</span>
                <small>{collection.postIds.length} 篇 · {collection.visibility === "published" ? "公開" : "草稿"}</small>
              </button>
              <button
                type="button"
                className="mini-btn"
                aria-label="合集往前"
                disabled={collectionIndex === 0}
                onClick={() => mutate((document) => run(reorderCollection(document, collection.id, -1, { siteId }), document))}
              >▲</button>
              <button
                type="button"
                className="mini-btn"
                aria-label="合集往後"
                disabled={collectionIndex === collections.length - 1}
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
              <div className="ig-post-body ig-canonical-collection-fields">
                <label className="w98-field">
                  <span className="w98-hint">合集標題</span>
                  <input
                    className="w98-input compact"
                    aria-label="合集標題"
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
                <strong>收錄與排序（{collection.postIds.length}）</strong>
                {orderedPosts.length ? (
                  <div className="ig-collection-post-list">
                    {orderedPosts.map((post) => {
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
                              checked={selected}
                              onChange={(event) => setPosts(
                                collection,
                                event.target.checked
                                  ? [...collection.postIds, post.id]
                                  : collection.postIds.filter((id) => id !== post.id),
                              )}
                            />
                            <span>{selected ? `${selectedIndex + 1}. ` : ""}{post.title || "（無標題）"}</span>
                          </label>
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
                ) : <p className="w98-hint">先建立這個角色的貼文，再加入合集。</p>}
              </div>
            ) : null}
          </article>
        );
      })}
    </fieldset>
  );
}
