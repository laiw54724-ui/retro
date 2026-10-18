import { useId } from "react";
import { useTranslation } from "react-i18next";
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
  const { t: tr } = useTranslation("instagram");
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
      setError(result.diagnostics?.[0]?.message ?? tr("canonicalCollectionEditor.couldntUpdateTheCollectionPlease"));
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
      <legend>{tr("ig.collectionsCount", { count: collections.length })}</legend>
      <div className="ie-row">
        <button
          type="button"
          className="w98-btn small"
          onClick={() => {
            const id = `collection:${crypto.randomUUID()}`;
            mutate((document) => run(createCollection(document, {
              id,
              ownerProfileId: ownerId,
              title: tr("canonicalCollectionEditor.newCollection"),
            }, { siteId }), document));
            setQuery("");
            setOpenId(id);
          }}
        >{tr("canonicalCollectionEditor.addCollection")}</button>
        <span className="w98-hint">{tr("canonicalCollectionEditor.onePostCanBeIn")}</span>
      </div>
      {collections.length ? <label className="w98-field">
        <span className="w98-hint">{tr("canonicalCollectionEditor.searchCollections")}</span>
        <input className="w98-input compact" type="search" value={query} placeholder={tr("canonicalCollectionEditor.searchByCollectionTitleOr")} onChange={(event) => {
          setQuery(event.target.value);
          setOpenId(null);
        }} />
      </label> : null}
      <p className="ig-editor-summary" role="status">{tr("ig.collectionSummary", { matching: matchingCollections.length, total: collections.length, published: publishedCount, drafts: collections.length - publishedCount })}{retainedEditor ? tr("ig.collectionRetained") : ""}</p>
      {query ? <button type="button" className="w98-btn small" onClick={() => setQuery("")}>{tr("canonicalCollectionEditor.clearCollectionSearch")}</button> : null}
      {search ? <p className="w98-hint" id={`${editorId}-order-hint`}>{tr("canonicalCollectionEditor.clearTheSearchToReorder")}</p> : null}
      {error ? <div role="alert" className="ie-error">{error}</div> : null}
      {!collections.length ? <p className="ig-editor-empty">{tr("canonicalCollectionEditor.noCollectionsYetOrganizeThis")}</p> : !visibleCollections.length ? <p className="ig-editor-empty">{tr("canonicalCollectionEditor.noCollectionsMatchTheSearch")}</p> : null}
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
                <span>{expanded ? "▾" : "▸"} {collection.title || tr("canonicalCollectionEditor.untitledCollection")}</span>
                <small>{tr("ig.collectionMeta", { count: collection.postIds.length, status: collection.visibility === "published" ? tr("canonicalCollectionEditor.public") : tr("canonicalCollectionEditor.draft") })}</small>
              </button>
              <button
                type="button"
                className="mini-btn"
                aria-label={tr("canonicalCollectionEditor.moveCollectionUp")}
                aria-describedby={search ? `${editorId}-order-hint` : undefined}
                disabled={!!search || collectionIndex === 0}
                onClick={() => mutate((document) => run(reorderCollection(document, collection.id, -1, { siteId }), document))}
              >▲</button>
              <button
                type="button"
                className="mini-btn"
                aria-label={tr("canonicalCollectionEditor.moveCollectionDown")}
                aria-describedby={search ? `${editorId}-order-hint` : undefined}
                disabled={!!search || collectionIndex === collections.length - 1}
                onClick={() => mutate((document) => run(reorderCollection(document, collection.id, 1, { siteId }), document))}
              >▼</button>
              <button
                type="button"
                className="mini-btn danger"
                aria-label={tr("canonicalCollectionEditor.deleteCollection", { title: collection.title })}
                onClick={() => {
                  if (!window.confirm(tr("canonicalCollectionEditor.deleteTheCollectionThePosts", { title: collection.title }))) return;
                  mutate((document) => run(deleteCollection(document, collection.id, { siteId }), document));
                }}
              >×</button>
            </div>
            {expanded ? (
              <div id={bodyId} className="ig-post-body ig-canonical-collection-fields">
                <label className="w98-field">
                  <span className="w98-hint">{tr("canonicalCollectionEditor.collectionTitle")}</span>
                  <input
                    className="w98-input compact"
                    aria-label={tr("canonicalCollectionEditor.collectionTitle")}
                    maxLength={120}
                    value={collection.title}
                    onChange={(event) => patchCollection(collection, { title: event.target.value }, `collection-title-${collection.id}`)}
                  />
                </label>
                <label className="w98-field">
                  <span className="w98-hint">{tr("canonicalCollectionEditor.collectionDescription")}</span>
                  <textarea
                    className="w98-textarea"
                    aria-label={tr("canonicalCollectionEditor.collectionDescription")}
                    rows={2}
                    maxLength={1000}
                    value={collection.description}
                    onChange={(event) => patchCollection(collection, { description: event.target.value }, `collection-description-${collection.id}`)}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    aria-label={tr("canonicalCollectionEditor.publicCollection")}
                    checked={collection.visibility === "published"}
                    onChange={(event) => patchCollection(collection, { visibility: event.target.checked ? "published" : "draft" })}
                  />{tr("ig.publicCollection")}
                </label>
                <strong>{tr("canonicalCollectionEditor.postsAndOrder")}</strong>
                {postSearch ? <p className="w98-hint">{tr("canonicalCollectionEditor.orderFollowsTheFullList")}</p> : null}
                <p className="ig-editor-summary" role="status">{tr("ig.selectedSummary", { count: collection.postIds.length, published: selectedPublished, drafts: selectedDrafts })}</p>
                <p className="w98-hint">{tr("canonicalCollectionEditor.searchOnlyChangesTheList")}</p>
                {posts.length ? <>
                  <label className="w98-field">
                    <span className="w98-hint">{tr("canonicalCollectionEditor.searchPostsInTheCollection")}</span>
                    <input
                      className="w98-input compact"
                      type="search"
                      value={postQuery}
                      placeholder={tr("canonicalCollectionEditor.searchByPostTitleOr")}
                      onChange={(event) => setPostQueries((current) => ({ ...current, [collection.id]: event.target.value }))}
                    />
                  </label>
                  <div className="ie-row">
                    <span className="ig-editor-summary" role="status">{tr("ig.eligiblePostsShown", { shown: visiblePosts.length, total: orderedPosts.length })}</span>
                    {postQuery ? <button type="button" className="w98-btn small" onClick={() => setPostQueries((current) => ({ ...current, [collection.id]: "" }))}>{tr("canonicalCollectionEditor.clearPostSearchInThe")}</button> : null}
                  </div>
                </> : null}
                {visiblePosts.length ? (
                  <div className="ig-collection-post-list" role="group" aria-label={tr("canonicalCollectionEditor.choosePostsForTheCollection")}>
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
                              aria-label={tr("ig.includePost", { title: post.title || tr("ig.untitledPost") })}
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
                              <span>{selected ? `${selectedIndex + 1}. ` : ""}{post.title || tr("canonicalCollectionEditor.noTitle")}</span>
                              {post.caption ? <small>{post.caption}</small> : null}
                            </span>
                          </label>
                          <small id={`${bodyId}-visibility-${post.id}`} className="ig-editor-badge" data-visibility={post.visibility}>{post.visibility === "published" ? tr("canonicalCollectionEditor.public") : tr("canonicalCollectionEditor.draft")}</small>
                          {selected ? <>
                            <button
                              type="button"
                              className="mini-btn"
                              aria-label={tr("ig.moveCollectionPostUp", { title: post.title || tr("ig.untitledShort") })}
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
                              aria-label={tr("ig.moveCollectionPostDown", { title: post.title || tr("ig.untitledShort") })}
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
                ) : <p className="ig-editor-empty">{posts.length ? tr("canonicalCollectionEditor.noPostsMatchTheSearch") : tr("canonicalCollectionEditor.createPostsForThisCharacter")}</p>}
              </div>
            ) : null}
          </article>
        );
      })}
    </fieldset>
  );
}
