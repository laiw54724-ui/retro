import {
  CollectionEntityV2Schema,
  SiteDocumentV2Schema,
  type CollectionEntityV2,
  type SiteDocumentV2Input
} from "./site-versioning";

export type CollectionDiagnostic = { path: (string | number)[]; message: string };
export type CollectionOperationResult =
  | { ok: true; document: SiteDocumentV2Input; collection?: CollectionEntityV2 }
  | { ok: false; diagnostics: CollectionDiagnostic[] };

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): CollectionDiagnostic[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"),
    message: issue.message
  }));
}

function prepare(document: SiteDocumentV2Input, siteId: string) {
  const parsed = SiteDocumentV2Schema.safeParse(document);
  if (!parsed.success) return { ok: false as const, diagnostics: issues(parsed.error) };
  const scoped = [...parsed.data.entities.profiles, ...parsed.data.entities.posts, ...parsed.data.entities.collections]
    .every((entity) => entity.siteId === siteId);
  if (!scoped) return { ok: false as const, diagnostics: [{ path: ["entities"], message: "內容不屬於目前網站。" }] };
  return { ok: true as const, document: structuredClone(parsed.data) };
}

function finish(document: SiteDocumentV2Input, siteId: string, collection?: CollectionEntityV2): CollectionOperationResult {
  const parsed = SiteDocumentV2Schema.safeParse(document);
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  if (parsed.data.entities.collections.some((item) => item.siteId !== siteId)) {
    return { ok: false, diagnostics: [{ path: ["entities", "collections"], message: "集合更新後的網站資料無效。" }] };
  }
  return { ok: true, document: parsed.data, ...(collection ? { collection: structuredClone(collection) } : {}) };
}

export function createCollection(document: SiteDocumentV2Input, input: Pick<CollectionEntityV2, "id" | "ownerProfileId" | "title"> & Partial<CollectionEntityV2>, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (prepared.document.entities.collections.some((item) => item.id === input.id)) return { ok: false, diagnostics: [{ path: ["id"], message: "集合 ID 已存在。" }] };
  if (!prepared.document.entities.profiles.some((profile) => profile.id === input.ownerProfileId && profile.siteId === options.siteId)) {
    return { ok: false, diagnostics: [{ path: ["ownerProfileId"], message: "找不到集合擁有者。" }] };
  }
  const parsed = CollectionEntityV2Schema.safeParse({ kind: "collection", siteId: options.siteId, visibility: "draft", description: "", postIds: [], ...input, ownerProfileId: input.ownerProfileId, id: input.id });
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  prepared.document.entities.collections.push(parsed.data);
  return finish(prepared.document, options.siteId, parsed.data);
}

export function updateCollection(document: SiteDocumentV2Input, collectionId: string, patch: Partial<CollectionEntityV2>, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const index = prepared.document.entities.collections.findIndex((item) => item.id === collectionId);
  if (index < 0) return { ok: false, diagnostics: [{ path: ["collectionId"], message: "找不到集合。" }] };
  const current = prepared.document.entities.collections[index];
  const parsed = CollectionEntityV2Schema.safeParse({ ...current, ...patch, kind: "collection", id: collectionId, siteId: options.siteId, ownerProfileId: current.ownerProfileId });
  if (!parsed.success) return { ok: false, diagnostics: issues(parsed.error) };
  prepared.document.entities.collections[index] = parsed.data;
  return finish(prepared.document, options.siteId, parsed.data);
}

export function deleteCollection(document: SiteDocumentV2Input, collectionId: string, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (!prepared.document.entities.collections.some((item) => item.id === collectionId)) return { ok: false, diagnostics: [{ path: ["collectionId"], message: "找不到集合。" }] };
  prepared.document.entities.collections = prepared.document.entities.collections.filter((item) => item.id !== collectionId);
  prepared.document.entities.posts = prepared.document.entities.posts.map((post) => ({ ...post, collectionIds: post.collectionIds.filter((id) => id !== collectionId) }));
  return finish(prepared.document, options.siteId);
}

export function reorderCollection(document: SiteDocumentV2Input, collectionId: string, direction: -1 | 1, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const list = prepared.document.entities.collections;
  const current = list.find((item) => item.id === collectionId);
  if (!current) return { ok: false, diagnostics: [{ path: ["collectionId"], message: "找不到集合。" }] };
  const scopedIndices = list.flatMap((item, index) => item.ownerProfileId === current.ownerProfileId && item.siteId === options.siteId ? [index] : []);
  const scopedIndex = scopedIndices.findIndex((index) => list[index].id === collectionId);
  const nextScopedIndex = scopedIndex + direction;
  if (scopedIndex >= 0 && nextScopedIndex >= 0 && nextScopedIndex < scopedIndices.length) {
    const index = scopedIndices[scopedIndex], next = scopedIndices[nextScopedIndex];
    [list[index], list[next]] = [list[next], list[index]];
  }
  return finish(prepared.document, options.siteId);
}

export function setCollectionPosts(document: SiteDocumentV2Input, collectionId: string, postIds: string[], options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const collection = prepared.document.entities.collections.find((item) => item.id === collectionId);
  if (!collection) return { ok: false, diagnostics: [{ path: ["collectionId"], message: "找不到集合。" }] };
  const uniquePostIds = [...new Set(postIds)];
  const posts = new Map(prepared.document.entities.posts.map((post) => [post.id, post]));
  for (const postId of uniquePostIds) {
    const post = posts.get(postId);
    if (!post) return { ok: false, diagnostics: [{ path: ["postIds"], message: "找不到貼文。" }] };
    if (post.siteId !== options.siteId) return { ok: false, diagnostics: [{ path: ["postIds"], message: "貼文不屬於目前網站。" }] };
    if (post.authorProfileId !== collection.ownerProfileId) return { ok: false, diagnostics: [{ path: ["postIds"], message: "貼文擁有者與集合不符。" }] };
  }
  collection.postIds = uniquePostIds;
  prepared.document.entities.posts = prepared.document.entities.posts.map((post) => ({
    ...post,
    collectionIds: uniquePostIds.includes(post.id)
      ? [...new Set([...post.collectionIds.filter((id) => id !== collectionId), collectionId])]
      : post.collectionIds.filter((id) => id !== collectionId)
  }));
  return finish(prepared.document, options.siteId, collection);
}
