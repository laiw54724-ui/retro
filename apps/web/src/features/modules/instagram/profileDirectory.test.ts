import { describe, expect, it } from "vitest";
import { createPost, createStarterDocument, duplicateProfile, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { buildProfileDirectory } from "./profileDirectory";

describe("Instagram profile directory", () => {
  it("includes unreferenced published profiles and removes draft profiles and posts publicly", () => {
    const migrated = migrateSiteDocumentV2(createStarterDocument("Directory", "classic98", "instagram"), { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
    const entry = migrated.document.entities.profiles[0];
    const published = duplicateProfile(migrated.document, entry.id, { siteId: "site-a", id: "profile:published", handle: "published" });
    if (!published.ok) throw new Error("published profile fixture failed");
    const publicProfile = published.document.entities.profiles.find((profile) => profile.id === "profile:published");
    if (!publicProfile) throw new Error("published profile missing");
    publicProfile.visibility = "published";
    const draft = duplicateProfile(published.document, entry.id, { siteId: "site-a", id: "profile:draft", handle: "draft" });
    if (!draft.ok) throw new Error("draft profile fixture failed");
    const hidden = draft.document.entities.profiles.find((profile) => profile.id === "profile:draft");
    if (!hidden) throw new Error("draft profile missing");
    hidden.visibility = "draft";
    hidden.avatarUrl = "https://example.com/private-avatar.png";
    hidden.linkUrl = "https://example.com/private-profile";
    draft.document.entities.profiles.find((profile) => profile.id === entry.id)!.otherFollowerCount = 2;
    (draft.document.entities.followEdges ??= []).push(
      { kind: "follow", id: "follow:public", siteId: "site-a", fromProfileId: publicProfile.id, toProfileId: entry.id },
      { kind: "follow", id: "follow:draft", siteId: "site-a", fromProfileId: hidden.id, toProfileId: entry.id },
    );
    const sourcePost = draft.document.entities.posts[0];
    if (sourcePost) draft.document.entities.posts.push({ ...structuredClone(sourcePost), id: "post:draft", authorProfileId: hidden.id, visibility: "draft", caption: "private caption" });

    const authorDirectory = buildProfileDirectory(draft.document);
    expect(authorDirectory.map((item) => item.id)).toEqual([entry.id, "profile:published", "profile:draft"]);

    const publicDirectory = buildProfileDirectory(draft.document, true);
    expect(publicDirectory.map((item) => item.id)).toEqual([entry.id, "profile:published"]);
    expect(publicDirectory[0]).toMatchObject({ followerIds: ["profile:published"], followerCount: 3 });
    expect(JSON.stringify(publicDirectory)).not.toContain("private caption");
    expect(JSON.stringify(publicDirectory)).not.toContain("private-avatar.png");
    expect(JSON.stringify(publicDirectory)).not.toContain("private-profile");
  });

  it("projects only published collections and removes draft or dead post references", () => {
    const migrated = migrateSiteDocumentV2(createStarterDocument("Collections", "classic98", "instagram"), { siteId: "site-a" });
    if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
    let document = migrated.document;
    const profile = document.entities.profiles[0];
    if (!profile) throw new Error("fixture profile missing");
    const created = createPost(document, { id: "post:public", authorProfileId: profile.id, title: "Public post" }, { siteId: "site-a" });
    if (!created.ok) throw new Error("fixture post failed");
    document = created.document;
    const publicPost = document.entities.posts[0];
    if (!publicPost) throw new Error("fixture post missing");
    profile.visibility = "published";
    publicPost.visibility = "published";
    const draftPost = { ...structuredClone(publicPost), id: "post:draft", visibility: "draft" as const, caption: "private collection post" };
    document.entities.posts.push(draftPost);
    document.entities.collections = [
      {
        kind: "collection",
        id: "collection:public",
        siteId: "site-a",
        ownerProfileId: profile.id,
        visibility: "published",
        title: "Public collection",
        description: "Visible",
        postIds: [draftPost.id, publicPost.id, "post:missing"],
      },
      {
        kind: "collection",
        id: "collection:draft",
        siteId: "site-a",
        ownerProfileId: profile.id,
        visibility: "draft",
        title: "Secret collection",
        description: "Hidden",
        postIds: [publicPost.id],
      },
    ];

    const directory = buildProfileDirectory(document, true);
    expect(directory[0]?.collections).toEqual([
      expect.objectContaining({ id: "collection:public", postIds: [publicPost.id] }),
    ]);
    expect(JSON.stringify(directory)).not.toContain("private collection post");
    expect(JSON.stringify(directory)).not.toContain("Secret collection");
    expect(JSON.stringify(directory)).not.toContain("post:missing");
  });
});
