import { describe, expect, it } from "vitest";
import { createStarterDocument, makeIgPost } from "../src/site";
import { migrateSiteDocumentV2 } from "../src/site-versioning";
import { postSocial, socialCounts } from "../src/social-selectors";

describe("fictional social selectors", () => {
  it("keeps legacy labels opaque and derives structured counts from same-site actors", () => {
    const migrated = migrateSiteDocumentV2(createStarterDocument("Social", "classic98", "instagram"), { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
    const document = migrated.document;
    const a = document.entities.profiles[0];
    a.legacyFollowersLabel = "1.2K";
    a.legacyFollowingLabel = "";
    const b = { ...structuredClone(a), id: "profile:b", handle: "b", username: "b", displayName: "B", name: "B", otherFollowerCount: 4, otherFollowingCount: 2 };
    document.entities.profiles.push(b);
    document.entities.followEdges.push({ kind: "follow", id: "follow:a-b", siteId: "site-a", fromProfileId: a.id, toProfileId: b.id });
    expect(socialCounts(document, a.id)).toEqual({ followerIds: [], followingIds: [b.id], followers: null, following: null });
    expect(socialCounts(document, b.id)).toEqual({ followerIds: [a.id], followingIds: [], followers: 5, following: 2 });
    expect(a.legacyFollowersLabel).toBe("1.2K");
    expect(a.legacyFollowingLabel).toBe("");
  });

  it("dedupes post actors and adds only explicit extra likes", () => {
    const legacy = createStarterDocument("Social", "classic98", "instagram");
    const instagram = legacy.windows.find((window) => window.type === "instagram");
    if (!instagram || instagram.type !== "instagram") throw new Error("instagram fixture missing");
    instagram.content.images.push(makeIgPost({ id: "post:legacy" }));
    const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
    const document = migrated.document;
    const profile = document.entities.profiles[0];
    const post = document.entities.posts[0];
    post.namedLikerIds = [profile.id, profile.id];
    post.otherLikeCount = 7;
    post.actorComments = [{ id: "comment:1", authorKind: "profile", authorProfileId: profile.id, text: "hi" }];
    expect(postSocial(document, post.id)).toEqual({ namedLikerIds: [profile.id], totalLikes: 8, actorComments: post.actorComments });
  });
});
