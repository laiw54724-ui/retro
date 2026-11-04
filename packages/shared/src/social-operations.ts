import {
  ActorCommentV2Schema,
  FollowEdgeV2Schema,
  parseSiteDocument,
  validateSiteDocumentScope,
  type ActorCommentV2,
  type Diagnostic,
  type FollowEdgeV2,
  type SiteDocumentV2,
  type SiteDocumentV2Input
} from "./site-versioning";

export type SocialOperationResult =
  | { ok: true; document: SiteDocumentV2Input; edge?: FollowEdgeV2; comment?: ActorCommentV2 }
  | { ok: false; code: "invalid"; diagnostics: Diagnostic[] };

const fail = (path: (string | number)[], message: string, code: string): SocialOperationResult & { ok: false } => ({ ok: false, code: "invalid", diagnostics: [{ path, message, code }] });
const zodIssues = (error: { issues: Array<{ path: PropertyKey[]; message: string; code: string }> }): Diagnostic[] => error.issues.map((issue) => ({ path: issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number"), message: issue.message, code: issue.code }));

function prepare(document: SiteDocumentV2Input, siteId: string) {
  const parsed = parseSiteDocument(document);
  if (!parsed.ok) return { ok: false as const, code: "invalid" as const, diagnostics: parsed.code === "invalid" ? parsed.diagnostics : [{ path: ["schemaVersion"], message: `Unsupported document version: ${parsed.version}`, code: "unsupported_version" }] };
  if (parsed.version !== 2) return { ok: false as const, code: "invalid" as const, diagnostics: [{ path: ["schemaVersion"], message: "Social operations require a v2 document", code: "unsupported_version" }] };
  const diagnostics = validateSiteDocumentScope(parsed.document, siteId);
  return diagnostics.length ? { ok: false as const, code: "invalid" as const, diagnostics } : { ok: true as const, document: structuredClone(parsed.document) };
}

function finish(document: SiteDocumentV2, siteId: string, extra: Pick<Extract<SocialOperationResult, { ok: true }>, "edge" | "comment"> = {}): SocialOperationResult {
  const parsed = parseSiteDocument(document);
  if (!parsed.ok || parsed.version !== 2) return { ok: false, code: "invalid", diagnostics: !parsed.ok && parsed.code === "invalid" ? parsed.diagnostics : [{ path: ["schemaVersion"], message: "Invalid social document", code: "invalid" }] };
  const scope = validateSiteDocumentScope(parsed.document, siteId);
  return scope.length ? { ok: false, code: "invalid", diagnostics: scope } : { ok: true, document: parsed.document, ...extra };
}

function profile(document: SiteDocumentV2, id: string, siteId: string) { return document.entities.profiles.find((item) => item.id === id && item.siteId === siteId); }
function post(document: SiteDocumentV2, id: string, siteId: string) { return document.entities.posts.find((item) => item.id === id && item.siteId === siteId); }

export function addFollow(document: SiteDocumentV2Input, input: { fromProfileId: string; toProfileId: string }, options: { siteId: string; id: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  if (input.fromProfileId === input.toProfileId) return fail(["toProfileId"], "角色不能追蹤自己。", "self_follow");
  if (!profile(prepared.document, input.fromProfileId, options.siteId) || !profile(prepared.document, input.toProfileId, options.siteId)) return fail(["profileId"], "找不到同網站角色。", "missing_ref");
  if (prepared.document.entities.followEdges.some((edge) => edge.id === options.id)) return fail(["id"], "追蹤 ID 已存在。", "duplicate_id");
  if (prepared.document.entities.followEdges.some((edge) => edge.fromProfileId === input.fromProfileId && edge.toProfileId === input.toProfileId)) return fail(["toProfileId"], "角色已追蹤。", "duplicate_edge");
  const parsed = FollowEdgeV2Schema.safeParse({ kind: "follow", id: options.id, siteId: options.siteId, ...input });
  if (!parsed.success) return { ok: false, code: "invalid", diagnostics: zodIssues(parsed.error) };
  prepared.document.entities.followEdges.push(parsed.data);
  return finish(prepared.document, options.siteId, { edge: structuredClone(parsed.data) });
}

export function removeFollow(document: SiteDocumentV2Input, edgeId: string, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const edge = prepared.document.entities.followEdges.find((item) => item.id === edgeId && item.siteId === options.siteId);
  if (!edge) return fail(["edgeId"], "找不到追蹤關係。", "missing");
  prepared.document.entities.followEdges = prepared.document.entities.followEdges.filter((item) => item.id !== edgeId);
  return finish(prepared.document, options.siteId);
}

export function setProfileExtraCounts(document: SiteDocumentV2Input, profileId: string, patch: { otherFollowerCount?: number | null; otherFollowingCount?: number | null }, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = profile(prepared.document, profileId, options.siteId); if (!target) return fail(["profileId"], "找不到角色。", "missing");
  Object.assign(target, patch);
  return finish(prepared.document, options.siteId);
}

export function setPostNamedLikers(document: SiteDocumentV2Input, postId: string, profileIds: string[], options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  const ids = [...new Set(profileIds)];
  if (ids.some((id) => !profile(prepared.document, id, options.siteId))) return fail(["profileIds"], "喜歡者必須是同網站角色。", "missing_ref");
  target.namedLikerIds = ids;
  return finish(prepared.document, options.siteId);
}

export function setPostOtherLikeCount(document: SiteDocumentV2Input, postId: string, count: number, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  target.otherLikeCount = count;
  return finish(prepared.document, options.siteId);
}

export function createActorComment(document: SiteDocumentV2Input, postId: string, input: { authorKind: "profile"; authorProfileId: string; text: string } | { authorKind: "legacy"; legacyAuthorText: string; text: string }, options: { siteId: string; id: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  const parsed = ActorCommentV2Schema.safeParse({ id: options.id, ...input });
  if (!parsed.success) return { ok: false, code: "invalid", diagnostics: zodIssues(parsed.error) };
  if (parsed.data.authorKind === "profile" && !profile(prepared.document, parsed.data.authorProfileId, options.siteId)) return fail(["authorProfileId"], "留言作者必須是同網站角色。", "missing_ref");
  if (target.actorComments.some((comment) => comment.id === options.id)) return fail(["id"], "留言 ID 已存在。", "duplicate_id");
  target.actorComments.push(parsed.data);
  return finish(prepared.document, options.siteId, { comment: structuredClone(parsed.data) });
}

export function updateActorComment(document: SiteDocumentV2Input, postId: string, commentId: string, comment: ActorCommentV2, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  const index = target.actorComments.findIndex((item) => item.id === commentId); if (index < 0) return fail(["commentId"], "找不到留言。", "missing");
  const parsed = ActorCommentV2Schema.safeParse({ ...comment, id: commentId }); if (!parsed.success) return { ok: false, code: "invalid", diagnostics: zodIssues(parsed.error) };
  if (parsed.data.authorKind === "profile" && !profile(prepared.document, parsed.data.authorProfileId, options.siteId)) return fail(["authorProfileId"], "留言作者必須是同網站角色。", "missing_ref");
  target.actorComments[index] = parsed.data;
  return finish(prepared.document, options.siteId, { comment: structuredClone(parsed.data) });
}

export function deleteActorComment(document: SiteDocumentV2Input, postId: string, commentId: string, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  if (!target.actorComments.some((item) => item.id === commentId)) return fail(["commentId"], "找不到留言。", "missing");
  target.actorComments = target.actorComments.filter((item) => item.id !== commentId);
  return finish(prepared.document, options.siteId);
}

export function reorderActorComment(document: SiteDocumentV2Input, postId: string, commentId: string, direction: -1 | 1, options: { siteId: string }): SocialOperationResult {
  const prepared = prepare(document, options.siteId); if (!prepared.ok) return prepared;
  const target = post(prepared.document, postId, options.siteId); if (!target) return fail(["postId"], "找不到貼文。", "missing");
  const index = target.actorComments.findIndex((item) => item.id === commentId), next = index + direction;
  if (index < 0) return fail(["commentId"], "找不到留言。", "missing");
  if (next >= 0 && next < target.actorComments.length) [target.actorComments[index], target.actorComments[next]] = [target.actorComments[next], target.actorComments[index]];
  return finish(prepared.document, options.siteId);
}
