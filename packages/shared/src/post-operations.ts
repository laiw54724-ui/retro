import {
  PostEntityV2Schema,
  SiteDocumentV2Schema,
  type PostEntityV2,
  type PostMediaV2,
  type SiteDocumentV2Input
} from "./site-versioning";

export type ContentDiagnostic = { path: (string | number)[]; message: string };
export type ContentOperationResult =
  | { ok: true; document: SiteDocumentV2Input; post?: PostEntityV2 }
  | { ok: false; diagnostics: ContentDiagnostic[] };

function prepare(document: SiteDocumentV2Input, siteId: string) {
  const parsed = SiteDocumentV2Schema.safeParse(document);
  if (!parsed.success) return { ok: false as const, diagnostics: parsed.error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), message: issue.message })) };
  const scoped = parsed.data.entities.posts.every((post) => post.siteId === siteId) && parsed.data.entities.profiles.every((profile) => profile.siteId === siteId);
  if (!scoped) return { ok: false as const, diagnostics: [{ path: ["entities"], message: "內容不屬於目前網站。" }] };
  return { ok: true as const, document: structuredClone(parsed.data) };
}

function finish(document: SiteDocumentV2Input, siteId: string, post?: PostEntityV2): ContentOperationResult {
  const checked = SiteDocumentV2Schema.safeParse(document);
  if (!checked.success || checked.data.entities.posts.some((item) => item.siteId !== siteId)) {
    return { ok: false, diagnostics: [{ path: ["entities"], message: "內容更新後的網站資料無效。" }] };
  }
  return { ok: true, document: checked.data, ...(post ? { post: structuredClone(post) } : {}) };
}

function withMediaProjection(post: PostEntityV2, media: PostMediaV2[]): PostEntityV2 {
  const first = media[0];
  return {
    ...post,
    media,
    src: first?.src ?? null,
    srcUrl: first?.srcUrl ?? "",
    extra: media.slice(1).map((item) => ({ id: item.id, src: item.src, srcUrl: item.srcUrl }))
  };
}

export function createPost(document: SiteDocumentV2Input, input: Partial<PostEntityV2> & Pick<PostEntityV2, "id" | "authorProfileId">, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  if (prepared.document.entities.posts.some((post) => post.id === input.id)) return { ok: false, diagnostics: [{ path: ["id"], message: "貼文 ID 已存在。" }] };
  if (!prepared.document.entities.profiles.some((profile) => profile.id === input.authorProfileId)) return { ok: false, diagnostics: [{ path: ["authorProfileId"], message: "找不到貼文作者。" }] };
  const parsed = PostEntityV2Schema.safeParse({ kind: "post", siteId: options.siteId, visibility: "draft", title: "", caption: "", href: "", date: "", location: "", src: null, srcUrl: "", extra: [], comments: [], likes: 0, ...input, media: input.media ?? [] });
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), message: issue.message })) };
  const post = withMediaProjection(parsed.data, parsed.data.media);
  prepared.document.entities.posts.push(post);
  return finish(prepared.document, options.siteId, post);
}

export function updatePost(document: SiteDocumentV2Input, postId: string, patch: Partial<PostEntityV2>, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const index = prepared.document.entities.posts.findIndex((post) => post.id === postId);
  if (index < 0) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  const parsed = PostEntityV2Schema.safeParse({ ...prepared.document.entities.posts[index], ...patch, id: postId, siteId: options.siteId, kind: "post" });
  if (!parsed.success) return { ok: false, diagnostics: parsed.error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), message: issue.message })) };
  const post = patch.media ? withMediaProjection(parsed.data, parsed.data.media) : parsed.data;
  prepared.document.entities.posts[index] = post;
  return finish(prepared.document, options.siteId, post);
}

export function deletePost(document: SiteDocumentV2Input, postId: string, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  prepared.document.entities.posts = prepared.document.entities.posts.filter((post) => post.id !== postId);
  prepared.document.entities.collections = prepared.document.entities.collections.map((collection) => ({ ...collection, postIds: collection.postIds.filter((id) => id !== postId) }));
  return finish(prepared.document, options.siteId);
}

export function reorderPost(document: SiteDocumentV2Input, postId: string, direction: -1 | 1, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const posts = prepared.document.entities.posts;
  const post = posts.find((item) => item.id === postId);
  if (!post) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  const scopedIndices = posts.flatMap((item, index) => item.authorProfileId === post.authorProfileId ? [index] : []);
  const scopedIndex = scopedIndices.findIndex((index) => posts[index].id === postId);
  const nextScopedIndex = scopedIndex + direction;
  if (scopedIndex >= 0 && nextScopedIndex >= 0 && nextScopedIndex < scopedIndices.length) {
    const currentIndex = scopedIndices[scopedIndex];
    const nextIndex = scopedIndices[nextScopedIndex];
    [posts[currentIndex], posts[nextIndex]] = [posts[nextIndex], posts[currentIndex]];
  }
  return finish(prepared.document, options.siteId);
}

export function patchPostMedia(document: SiteDocumentV2Input, postId: string, mediaId: string, patch: Partial<PostMediaV2>, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const post = prepared.document.entities.posts.find((item) => item.id === postId);
  if (!post) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  const media = post.media.map((item) => item.id === mediaId ? { ...item, ...patch } : item);
  return updatePost(prepared.document, postId, { media }, options);
}

export function addPostMedia(document: SiteDocumentV2Input, postId: string, media: PostMediaV2, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const post = prepared.document.entities.posts.find((item) => item.id === postId);
  if (!post) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  if (post.media.some((item) => item.id === media.id)) return { ok: false, diagnostics: [{ path: ["media", "id"], message: "圖片 ID 已存在。" }] };
  if (post.media.length >= 10) return { ok: false, diagnostics: [{ path: ["media"], message: "每則貼文最多 10 張圖片。" }] };
  return updatePost(prepared.document, postId, { media: [...post.media, media] }, options);
}

export function deletePostMedia(document: SiteDocumentV2Input, postId: string, mediaId: string, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const post = prepared.document.entities.posts.find((item) => item.id === postId);
  if (!post) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  return updatePost(prepared.document, postId, { media: post.media.filter((item) => item.id !== mediaId) }, options);
}

export function reorderPostMedia(document: SiteDocumentV2Input, postId: string, mediaId: string, direction: -1 | 1, options: { siteId: string }): ContentOperationResult {
  const prepared = prepare(document, options.siteId);
  if (!prepared.ok) return prepared;
  const post = prepared.document.entities.posts.find((item) => item.id === postId);
  if (!post) return { ok: false, diagnostics: [{ path: ["postId"], message: "找不到貼文。" }] };
  const media = [...post.media];
  const index = media.findIndex((item) => item.id === mediaId), next = index + direction;
  if (index >= 0 && next >= 0 && next < media.length) [media[index], media[next]] = [media[next], media[index]];
  return updatePost(prepared.document, postId, { media }, options);
}
