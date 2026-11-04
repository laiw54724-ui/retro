import type { ActorCommentV2, SiteDocumentV2Input } from "./site-versioning";

const unique = (ids: string[]) => ids.filter((id, index) => ids.indexOf(id) === index);

export function socialCounts(document: SiteDocumentV2Input, profileId: string) {
  const profile = document.entities.profiles.find((item) => item.id === profileId);
  if (!profile) return { followerIds: [], followingIds: [], followers: null, following: null };
  const valid = new Set(document.entities.profiles.filter((item) => item.siteId === profile.siteId).map((item) => item.id));
  const edges = document.entities.followEdges ?? [];
  const followerIds = unique(edges.filter((edge) => edge.siteId === profile.siteId && edge.toProfileId === profileId && valid.has(edge.fromProfileId)).map((edge) => edge.fromProfileId));
  const followingIds = unique(edges.filter((edge) => edge.siteId === profile.siteId && edge.fromProfileId === profileId && valid.has(edge.toProfileId)).map((edge) => edge.toProfileId));
  return {
    followerIds,
    followingIds,
    followers: profile.otherFollowerCount === null || profile.otherFollowerCount === undefined ? null : followerIds.length + profile.otherFollowerCount,
    following: profile.otherFollowingCount === null || profile.otherFollowingCount === undefined ? null : followingIds.length + profile.otherFollowingCount
  };
}

export function postSocial(document: SiteDocumentV2Input, postId: string): { namedLikerIds: string[]; totalLikes: number; actorComments: ActorCommentV2[] } {
  const post = document.entities.posts.find((item) => item.id === postId);
  if (!post) return { namedLikerIds: [], totalLikes: 0, actorComments: [] };
  const valid = new Set(document.entities.profiles.filter((item) => item.siteId === post.siteId).map((item) => item.id));
  const namedLikerIds = unique((post.namedLikerIds ?? []).filter((id) => valid.has(id)));
  const actorComments = (post.actorComments ?? []).filter((comment) => comment.authorKind === "legacy" || valid.has(comment.authorProfileId));
  return { namedLikerIds, totalLikes: namedLikerIds.length + (post.otherLikeCount ?? 0), actorComments };
}
