import { describe, expect, it } from "vitest";
import { createStarterDocument, duplicateProfile, migrateSiteDocumentV2 } from "@retrodesk/shared";
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
    const sourcePost = draft.document.entities.posts[0];
    if (sourcePost) draft.document.entities.posts.push({ ...structuredClone(sourcePost), id: "post:draft", authorProfileId: hidden.id, visibility: "draft", caption: "private caption" });

    const authorDirectory = buildProfileDirectory(draft.document);
    expect(authorDirectory.map((item) => item.id)).toEqual([entry.id, "profile:published", "profile:draft"]);

    const publicDirectory = buildProfileDirectory(draft.document, true);
    expect(publicDirectory.map((item) => item.id)).toEqual([entry.id, "profile:published"]);
    expect(JSON.stringify(publicDirectory)).not.toContain("private caption");
    expect(JSON.stringify(publicDirectory)).not.toContain("private-avatar.png");
    expect(JSON.stringify(publicDirectory)).not.toContain("private-profile");
  });
});
