import { describe, expect, it } from "vitest";
import { createStarterDocument, makeIgPost } from "../src/site";
import { migrateSiteDocumentV2 } from "../src/site-versioning";
import { addFollow, createActorComment, deleteActorComment, removeFollow, reorderActorComment, setPostNamedLikers, setPostOtherLikeCount, setProfileExtraCounts } from "../src/social-operations";

function fixture() {
  const legacy = createStarterDocument("Social", "classic98", "instagram");
  const instagram = legacy.windows.find((window) => window.type === "instagram");
  if (!instagram || instagram.type !== "instagram") throw new Error("instagram missing");
  instagram.content.images.push(makeIgPost({ id: "p1" }));
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
  const a = migrated.document.entities.profiles[0];
  migrated.document.entities.profiles.push({ ...structuredClone(a), id: "profile:b", handle: "b", username: "b", displayName: "B", name: "B" });
  return migrated.document;
}

describe("fictional social operations", () => {
  it("adds and removes one validated follow without mutating input", () => {
    const source = fixture(), before = structuredClone(source);
    const a = source.entities.profiles[0].id;
    const added = addFollow(source, { fromProfileId: a, toProfileId: "profile:b" }, { siteId: "site-a", id: "follow:1" });
    expect(added.ok).toBe(true); expect(source).toEqual(before);
    if (!added.ok) return;
    expect(addFollow(added.document, { fromProfileId: a, toProfileId: "profile:b" }, { siteId: "site-a", id: "follow:2" })).toMatchObject({ ok: false, diagnostics: [{ code: "duplicate_edge" }] });
    expect(addFollow(source, { fromProfileId: a, toProfileId: a }, { siteId: "site-a", id: "follow:self" })).toMatchObject({ ok: false, diagnostics: [{ code: "self_follow" }] });
    const removed = removeFollow(added.document, "follow:1", { siteId: "site-a" });
    expect(removed.ok && removed.document.entities.followEdges).toEqual([]);
  });

  it("dedupes named likers and persists structured counts", () => {
    const source = fixture(), postId = source.entities.posts[0].id, a = source.entities.profiles[0].id;
    const liked = setPostNamedLikers(source, postId, [a, "profile:b", a], { siteId: "site-a" });
    expect(liked.ok).toBe(true); if (!liked.ok) return;
    expect(liked.document.entities.posts[0].namedLikerIds).toEqual([a, "profile:b"]);
    const counted = setPostOtherLikeCount(liked.document, postId, 8, { siteId: "site-a" });
    expect(counted.ok && counted.document.entities.posts[0].otherLikeCount).toBe(8);
    const profileCount = setProfileExtraCounts(liked.document, "profile:b", { otherFollowerCount: 12 }, { siteId: "site-a" });
    expect(profileCount.ok && profileCount.document.entities.profiles[1].otherFollowerCount).toBe(12);
    expect(setPostNamedLikers(source, postId, ["profile:missing"], { siteId: "site-a" })).toMatchObject({ ok: false, diagnostics: [{ code: "missing_ref" }] });
  });

  it("creates, reorders and deletes profile and legacy comments", () => {
    const source = fixture(), postId = source.entities.posts[0].id, a = source.entities.profiles[0].id;
    const first = createActorComment(source, postId, { authorKind: "profile", authorProfileId: a, text: "A" }, { siteId: "site-a", id: "comment:a" });
    expect(first.ok).toBe(true); if (!first.ok) return;
    const second = createActorComment(first.document, postId, { authorKind: "legacy", legacyAuthorText: "old friend", text: "B" }, { siteId: "site-a", id: "comment:b" });
    expect(second.ok).toBe(true); if (!second.ok) return;
    const reordered = reorderActorComment(second.document, postId, "comment:b", -1, { siteId: "site-a" });
    expect(reordered.ok && reordered.document.entities.posts[0].actorComments.map((item) => item.id)).toEqual(["comment:b", "comment:a"]);
    if (!reordered.ok) return;
    const deleted = deleteActorComment(reordered.document, postId, "comment:a", { siteId: "site-a" });
    expect(deleted.ok && deleted.document.entities.posts[0].actorComments.map((item) => item.id)).toEqual(["comment:b"]);
  });
});
