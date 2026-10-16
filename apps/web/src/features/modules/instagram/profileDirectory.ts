import { HighlightEntityV2Schema, ProfileEntityV2Schema, type SiteDocumentV2Input, type ProfileEntityV2 } from "@retrodesk/shared";
import type { ProfileDirectoryEntry } from "../types";

/** Read-only adapter from canonical entities to the IG navigation boundary. */
export function buildProfileDirectory(document: SiteDocumentV2Input, publishedOnly = false): ProfileDirectoryEntry[] {
  return document.entities.profiles
    .filter((profile) => !publishedOnly || profile.visibility === "published")
    .flatMap((profile) => {
      const parsed = ProfileEntityV2Schema.safeParse(profile);
      if (!parsed.success) return [];
      const normalizedProfile = parsed.data;
      const legacyProfile = toLegacyProfile(normalizedProfile);
      const posts = document.entities.posts
        .filter((post) => post.siteId === normalizedProfile.siteId && post.authorProfileId === normalizedProfile.id && (!publishedOnly || post.visibility === "published"))
        .map(({ kind: _kind, siteId: _siteId, visibility: _visibility, authorProfileId: _authorProfileId, ...post }) => ({
          ...post, srcUrl: post.srcUrl ?? "", href: post.href ?? "", location: post.location ?? "", date: post.date ?? "", likes: post.likes ?? 0, comments: post.comments ?? [], extra: (post.extra ?? []).map((extra) => ({ ...extra, srcUrl: extra.srcUrl ?? "" }))
        }));
      const highlights = (document.entities.highlights ?? []).flatMap((highlight) => {
        const parsedHighlight = HighlightEntityV2Schema.safeParse(highlight);
        if (!parsedHighlight.success || parsedHighlight.data.siteId !== normalizedProfile.siteId || parsedHighlight.data.ownerProfileId !== normalizedProfile.id || (publishedOnly && parsedHighlight.data.visibility !== "published")) return [];
        return [parsedHighlight.data];
      });
      return [{ id: normalizedProfile.id, siteId: normalizedProfile.siteId, profile: legacyProfile, posts, highlights, themeOverride: normalizedProfile.themeOverride }];
    });
}

function toLegacyProfile(profile: ProfileEntityV2): ProfileDirectoryEntry["profile"] {
  const { kind: _kind, id: _id, siteId: _siteId, visibility: _visibility, handle: _handle, displayName: _displayName, pronouns: _pronouns, customFields: _customFields, worldTags: _worldTags, themeOverride: _themeOverride, legacyUsernameLabel: _legacyUsernameLabel, legacyFollowersLabel: _legacyFollowersLabel, legacyFollowingLabel: _legacyFollowingLabel, ...legacy } = profile;
  return { ...legacy, username: profile.handle ?? profile.username, name: profile.displayName ?? profile.name };
}
