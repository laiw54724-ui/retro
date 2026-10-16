import { describe, expect, it } from "vitest";
import { createStarterDocument } from "../src/site";
import { migrateSiteDocumentV2 } from "../src/site-versioning";
import { addPostMedia, createPost, deletePost, deletePostMedia, patchPostMedia, reorderPost, reorderPostMedia } from "../src/post-operations";

function starter() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Desk", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  return migrated.document;
}

function addPost(document: ReturnType<typeof starter>, id: string, authorProfileId: string) {
  const result = createPost(document, {
    id,
    authorProfileId,
    title: id,
    media: [{ id: `${id}-media-1`, src: "https://example.com/one.png", srcUrl: "https://example.com/one.png", alt: "one" }]
  }, { siteId: "site-a" });
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.document;
}

describe("canonical post operations", () => {
  it("keeps canonical media order and legacy projection fields in sync", () => {
    const base = starter();
    const authorId = base.entities.profiles[0].id;
    const withPost = addPost(base, "post-a", authorId);
    const added = addPostMedia(withPost, "post-a", { id: "media-2", src: "https://example.com/two.png", srcUrl: "", alt: "two" }, { siteId: "site-a" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const reordered = reorderPostMedia(added.document, "post-a", "media-2", -1, { siteId: "site-a" });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    let post = reordered.document.entities.posts.find((item) => item.id === "post-a")!;
    expect(post.media.map((item) => item.id)).toEqual(["media-2", "post-a-media-1"]);
    expect(post.src).toBe("https://example.com/two.png");
    expect(post.extra).toEqual([{ id: "post-a-media-1", src: "https://example.com/one.png", srcUrl: "https://example.com/one.png" }]);

    const patched = patchPostMedia(reordered.document, "post-a", "media-2", { alt: "cover", src: "https://example.com/cover.png", crop: { x: 24, y: 68, zoom: 1.75 } }, { siteId: "site-a" });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    post = patched.document.entities.posts.find((item) => item.id === "post-a")!;
    expect(post.media[0].alt).toBe("cover");
    expect(post.media[0].crop).toEqual({ x: 24, y: 68, zoom: 1.75 });
    expect(post.src).toBe("https://example.com/cover.png");

    const deleted = deletePostMedia(patched.document, "post-a", "media-2", { siteId: "site-a" });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    post = deleted.document.entities.posts.find((item) => item.id === "post-a")!;
    expect(post.media).toHaveLength(1);
    expect(post.src).toBe("https://example.com/one.png");
  });

  it("reorders within one author and prunes collection references on delete", () => {
    let document = starter();
    const authorA = document.entities.profiles[0].id;
    document = addPost(document, "post-a1", authorA);
    const duplicateProfile = { ...document.entities.profiles[0], id: "profile-b", handle: "profile-b", username: "profile-b" };
    document = { ...document, entities: { ...document.entities, profiles: [...document.entities.profiles, duplicateProfile] } };
    document = addPost(document, "post-b1", "profile-b");
    document = addPost(document, "post-a2", authorA);
    const reordered = reorderPost(document, "post-a1", 1, { siteId: "site-a" });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.document.entities.posts.map((post) => post.id)).toEqual(["post-a2", "post-b1", "post-a1"]);

    reordered.document.entities.collections.push({ kind: "collection", id: "collection-a", siteId: "site-a", ownerProfileId: authorA, visibility: "draft", title: "A", description: "", postIds: ["post-a1", "post-a2"] });
    const deleted = deletePost(reordered.document, "post-a1", { siteId: "site-a" });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.entities.collections[0].postIds).toEqual(["post-a2"]);
  });
});
