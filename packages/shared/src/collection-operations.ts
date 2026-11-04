import {
  CollectionEntityV2Schema,
  parseSiteDocument,
  validateSiteDocumentScope,
  type CollectionEntityV2,
  type Diagnostic,
  type SiteDocumentV2,
  type SiteDocumentV2Input
} from "./site-versioning";

export type CollectionDiagnostic = Diagnostic;
export type CollectionOperationResult =
  | { ok: true; document: SiteDocumentV2Input; collection?: CollectionEntityV2 }
  | { ok: false; code: "invalid"; diagnostics: CollectionDiagnostic[] };

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string; code: string }> }): CollectionDiagnostic[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"),
    message: issue.message,
    code: issue.code
  }));
}

function failure(path: (string | number)[], message: string, code: string): CollectionOperationResult & { ok: false } {
  return { ok: false, code: "invalid", diagnostics: [{ path, message, code }] };
}

function documentDiagnostics(document: SiteDocumentV2Input, siteId: string): CollectionDiagnostic[] {
  const parsed = parseSiteDocument(document);
  if (!parsed.ok) return parsed.code === "invalid"
    ? parsed.diagnostics
    : [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }];
  if (parsed.version !== 2) return [{ path: ["schemaVersion"], message: "Collection operations require a v2 document.", code: "unsupported_version" }];
  return validateSiteDocumentScope(parsed.document, siteId);
}

function prepare(document: SiteDocumentV2Input, siteId: string) {
  const parsed = parseSiteDocument(document);
  if (!parsed.ok) {
    const diagnostics = parsed.code === "invalid"
      ? parsed.diagnostics
      : [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }];
    return { ok: false as const, code: "invalid" as const, diagnostics };
  }
  if (parsed.version !== 2) return { ok: false as const, code: "invalid" as const, diagnostics: [{ path: ["schemaVersion"], message: "Collection operations require a v2 document.", code: "unsupported_version" }] };
  const diagnostics = validateSiteDocumentScope(parsed.document, siteId);
  if (diagnostics.length) return { ok: false as const, code: "invalid" as const, diagnostics };
  return { ok: true as const, document: structuredClone(parsed.document) };
}

function finish(document: SiteDocumentV2Input, siteId: string, collectionId?: string): CollectionOperationResult {
  const diagnostics = documentDiagnostics(document, siteId);
  if (diagnostics.length) return { ok: false, code: "invalid", diagnostics };
  const parsed = parseSiteDocument(document);
  if (!parsed.ok || parsed.version !== 2) return failure(["schemaVersion"], "Collection operations require a v2 document.", "unsupported_version");
  const collection = collectionId ? parsed.document.entities.collections.find((item) => item.id === collectionId) : undefined;
  return { ok: true, document: parsed.document, ...(collection ? { collection: structuredClone(collection) } : {}) };
}

function applyCollectionPosts(document: SiteDocumentV2, collectionId: string, postIds: readonly string[], siteId: string): CollectionOperationResult {
  const collection = document.entities.collections.find((item) => item.id === collectionId);
  if (!collection) return failure(["collectionId"], "找不到集合。", "missing");
  const uniquePostIds = [...new Set(postIds)];
  const posts = new Map(document.entities.posts.map((post) => [post.id, post]));
  for (const [index, postId] of uniquePostIds.entries()) {
    const post = posts.get(postId);
    if (!post) return failure(["postIds", index], "找不到貼文。", "missing_ref");
    if (post.siteId !== siteId) return failure(["postIds", index], "貼文不屬於目前網站。", "cross_site");
    if (post.authorProfileId !== collection.ownerProfileId) return failure(["postIds", index], "貼文擁有者與集合不符。", "owner_mismatch");
  }
  collection.postIds = uniquePostIds;
  document.entities.posts = document.entities.posts.map((post) => ({
    ...post,
    collectionIds: uniquePostIds.includes(post.id)
      ? [...new Set([...post.collectionIds.filter((id) => id !== collectionId), collectionId])]
      : post.collectionIds.filter((id) => id !== collectionId)
  }));
  return finish(document, siteId, collectionId);
}

export function createCollection(document: SiteDocumentV2Input, input: Pick<CollectionEntityV2, "id" | "ownerProfileId" | "title"> & Partial<CollectionEntityV2>, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (prepared.document.entities.collections.some((item) => item.id === input.id)) return failure(["id"], "集合 ID 已存在。", "duplicate_id");
  if (!prepared.document.entities.profiles.some((profile) => profile.id === input.ownerProfileId && profile.siteId === options.siteId)) {
    return failure(["ownerProfileId"], "找不到集合擁有者。", "missing_ref");
  }
  const requestedPostIds = input.postIds ?? [];
  const parsed = CollectionEntityV2Schema.safeParse({ kind: "collection", siteId: options.siteId, visibility: "draft", description: "", ...input, postIds: [], ownerProfileId: input.ownerProfileId, id: input.id });
  if (!parsed.success) return { ok: false, code: "invalid", diagnostics: issues(parsed.error) };
  prepared.document.entities.collections.push(parsed.data);
  return requestedPostIds.length
    ? applyCollectionPosts(prepared.document, parsed.data.id, requestedPostIds, options.siteId)
    : finish(prepared.document, options.siteId, parsed.data.id);
}

export function updateCollection(document: SiteDocumentV2Input, collectionId: string, patch: Partial<CollectionEntityV2>, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const index = prepared.document.entities.collections.findIndex((item) => item.id === collectionId);
  if (index < 0) return failure(["collectionId"], "找不到集合。", "missing");
  const current = prepared.document.entities.collections[index];
  const requestedPostIds = patch.postIds;
  const parsed = CollectionEntityV2Schema.safeParse({ ...current, ...patch, kind: "collection", id: collectionId, siteId: options.siteId, ownerProfileId: current.ownerProfileId, postIds: current.postIds });
  if (!parsed.success) return { ok: false, code: "invalid", diagnostics: issues(parsed.error) };
  prepared.document.entities.collections[index] = parsed.data;
  return requestedPostIds
    ? applyCollectionPosts(prepared.document, collectionId, requestedPostIds, options.siteId)
    : finish(prepared.document, options.siteId, collectionId);
}

export function deleteCollection(document: SiteDocumentV2Input, collectionId: string, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (!prepared.document.entities.collections.some((item) => item.id === collectionId)) return failure(["collectionId"], "找不到集合。", "missing");
  prepared.document.entities.collections = prepared.document.entities.collections.filter((item) => item.id !== collectionId);
  prepared.document.entities.posts = prepared.document.entities.posts.map((post) => ({ ...post, collectionIds: post.collectionIds.filter((id) => id !== collectionId) }));
  return finish(prepared.document, options.siteId);
}

export function reorderCollection(document: SiteDocumentV2Input, collectionId: string, direction: -1 | 1, options: { siteId: string }): CollectionOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const list = prepared.document.entities.collections;
  const current = list.find((item) => item.id === collectionId);
  if (!current) return failure(["collectionId"], "找不到集合。", "missing");
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
  return applyCollectionPosts(prepared.document, collectionId, postIds, options.siteId);
}
