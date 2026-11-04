import { CollectionEntityV2Schema, HighlightEntityV2Schema, PostEntityV2Schema, ProfileEntityV2Schema, socialCounts, type SiteDocumentV2Input, type ProfileEntityV2 } from "@retrodesk/shared";
import type { ProfileDirectoryEntry } from "../types";

/** Read-only adapter from canonical entities to the IG navigation boundary. */
export function buildProfileDirectory(document: SiteDocumentV2Input, publishedOnly = false): ProfileDirectoryEntry[] {
  const visibleProfiles = document.entities.profiles.filter((profile) => !publishedOnly || profile.visibility === "published");
  const visibleProfileIds = new Set(visibleProfiles.map((profile) => profile.id));
  return visibleProfiles
    .flatMap((profile) => {
      const parsed = ProfileEntityV2Schema.safeParse(profile);
      if (!parsed.success) return [];
      const normalizedProfile = parsed.data;
      const legacyProfile = toLegacyProfile(normalizedProfile);
      const posts = document.entities.posts.flatMap((post) => {
        const parsedPost = PostEntityV2Schema.safeParse(post);
        if (!parsedPost.success || parsedPost.data.siteId !== normalizedProfile.siteId || parsedPost.data.authorProfileId !== normalizedProfile.id || (publishedOnly && parsedPost.data.visibility !== "published")) return [];
        const { kind: _kind, siteId: _siteId, visibility: _visibility, authorProfileId: _authorProfileId, ...legacyPost } = parsedPost.data;
        return [{
          ...legacyPost,
          srcUrl: legacyPost.srcUrl ?? "",
          href: legacyPost.href ?? "",
          location: legacyPost.location ?? "",
          date: legacyPost.date ?? "",
          likes: legacyPost.likes ?? 0,
          comments: legacyPost.comments ?? [],
          extra: (legacyPost.extra ?? []).map((extra) => ({ ...extra, srcUrl: extra.srcUrl ?? "" })),
          namedLikerIds: legacyPost.namedLikerIds.filter((id) => visibleProfileIds.has(id)),
          actorComments: legacyPost.actorComments.filter((comment) => comment.authorKind === "legacy" || visibleProfileIds.has(comment.authorProfileId)),
        }];
      });
      const postIds = new Set(posts.map((post) => post.id));
      const highlights = (document.entities.highlights ?? []).flatMap((highlight) => {
        const parsedHighlight = HighlightEntityV2Schema.safeParse(highlight);
        if (!parsedHighlight.success || parsedHighlight.data.siteId !== normalizedProfile.siteId || parsedHighlight.data.ownerProfileId !== normalizedProfile.id || (publishedOnly && parsedHighlight.data.visibility !== "published")) return [];
        return [parsedHighlight.data];
      });
      const collections = (document.entities.collections ?? []).flatMap((collection) => {
        const parsedCollection = CollectionEntityV2Schema.safeParse(collection);
        if (!parsedCollection.success || parsedCollection.data.siteId !== normalizedProfile.siteId || parsedCollection.data.ownerProfileId !== normalizedProfile.id || (publishedOnly && parsedCollection.data.visibility !== "published")) return [];
        return [{ ...parsedCollection.data, postIds: parsedCollection.data.postIds.filter((postId) => postIds.has(postId)) }];
      });
      const counts = socialCounts(document, normalizedProfile.id);
      const followerIds = counts.followerIds.filter((id) => visibleProfileIds.has(id));
      const followingIds = counts.followingIds.filter((id) => visibleProfileIds.has(id));
      const followerCount = normalizedProfile.otherFollowerCount == null ? null : followerIds.length + normalizedProfile.otherFollowerCount;
      const followingCount = normalizedProfile.otherFollowingCount == null ? null : followingIds.length + normalizedProfile.otherFollowingCount;
      return [{ id: normalizedProfile.id, siteId: normalizedProfile.siteId, profile: legacyProfile, posts, highlights, collections, followerIds, followingIds, followerCount, followingCount, legacyFollowerLabel: normalizedProfile.legacyFollowersLabel ?? normalizedProfile.followers, legacyFollowingLabel: normalizedProfile.legacyFollowingLabel ?? normalizedProfile.following, themeOverride: normalizedProfile.themeOverride }];
    });
}

function toLegacyProfile(profile: ProfileEntityV2): ProfileDirectoryEntry["profile"] {
  const { kind: _kind, id: _id, siteId: _siteId, visibility: _visibility, handle: _handle, displayName: _displayName, pronouns: _pronouns, customFields: _customFields, worldTags: _worldTags, themeOverride: _themeOverride, legacyUsernameLabel: _legacyUsernameLabel, legacyFollowersLabel: _legacyFollowersLabel, legacyFollowingLabel: _legacyFollowingLabel, otherFollowerCount: _otherFollowerCount, otherFollowingCount: _otherFollowingCount, ...legacy } = profile;
  return { ...legacy, username: profile.handle ?? profile.username, name: profile.displayName ?? profile.name };
}
