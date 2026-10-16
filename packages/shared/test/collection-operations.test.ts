import { describe, expect, it } from "vitest";
import { createStarterDocument } from "../src/site";
import { createProfile, migrateSiteDocumentV2 } from "../src/site-versioning";
import { createPost } from "../src/post-operations";
import { createCollection, deleteCollection, reorderCollection, setCollectionPosts, updateCollection } from "../src/collection-operations";

function starter() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Desk", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  return migrated.document;
}

function addPost(document: ReturnType<typeof starter>, id: string, authorProfileId: string) {
  const result = createPost(document, { id, authorProfileId, title: id }, { siteId: "site-a" });
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.document;
}

function addCollection(document: ReturnType<typeof starter>, id: string, ownerProfileId: string) {
  const result = createCollection(document, { id, ownerProfileId, title: id }, { siteId: "site-a" });
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.document;
}

function addProfile(document: ReturnType<typeof starter>, id: string, handle: string) {
  const result = createProfile(document, { handle, displayName: handle, name: handle }, { siteId: "site-a", id });
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
  return result.document;
}

describe("canonical collection operations", () => {
  it("creates, updates, and validates a complete v2 collection", () => {
    const base = starter();
    const owner = base.entities.profiles[0].id;
    const created = createCollection(base, { id: "collection-a", ownerProfileId: owner, title: "A" }, { siteId: "site-a" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.document.entities.collections[0]).toMatchObject({ id: "collection-a", ownerProfileId: owner, postIds: [] });
    expect(base.entities.collections).toEqual([]);
    const updated = updateCollection(created.document, "collection-a", { description: "Description" }, { siteId: "site-a" });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.collection?.description).toBe("Description");
  });

  it("sets ordered, deduplicated posts and synchronizes both sides", () => {
    let document = starter();
    const owner = document.entities.profiles[0].id;
    document = addPost(document, "post-1", owner);
    document = addPost(document, "post-2", owner);
    document = addCollection(document, "collection-a", owner);
    const input = ["post-2", "post-1", "post-2"];
    const result = setCollectionPosts(document, "collection-a", input, { siteId: "site-a" });
    expect(result.ok).toBe(true);
    expect(input).toEqual(["post-2", "post-1", "post-2"]);
    if (!result.ok) return;
    expect(result.document.entities.collections[0].postIds).toEqual(["post-2", "post-1"]);
    expect(result.document.entities.posts.map((post) => post.collectionIds)).toEqual([["collection-a"], ["collection-a"]]);
  });

  it("rejects missing, cross-site, and owner-mismatched references without mutation", () => {
    let document = starter();
    const owner = document.entities.profiles[0].id;
    const otherOwner = "other-owner";
    document = addPost(document, "post-1", owner);
    document = addCollection(document, "collection-a", owner);
    const before = structuredClone(document);
    const missing = setCollectionPosts(document, "collection-a", ["missing"], { siteId: "site-a" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe("missing_ref");
    const mismatch = setCollectionPosts(document, "collection-a", ["post-1"], { siteId: "site-b" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.diagnostics[0]?.code).toBe("cross_site");
    let withForeign = addProfile(document, otherOwner, "other");
    withForeign = addPost(withForeign, "post-foreign", otherOwner);
    const ownerMismatch = setCollectionPosts(withForeign, "collection-a", ["post-foreign"], { siteId: "site-a" });
    expect(ownerMismatch.ok).toBe(false);
    if (!ownerMismatch.ok) expect(ownerMismatch.diagnostics[0]?.code).toBe("owner_mismatch");
    expect(document).toEqual(before);
  });

  it("rejects semantic-invalid inputs and validates create/update post membership", () => {
    let document = starter();
    const owner = document.entities.profiles[0].id;
    const duplicateProfile = structuredClone(document.entities.profiles[0]);
    const duplicate = { ...document, entities: { ...document.entities, profiles: [...document.entities.profiles, duplicateProfile] } };
    const rejected = createCollection(duplicate, { id: "collection-a", ownerProfileId: owner, title: "A" }, { siteId: "site-a" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics.some((item) => item.code === "duplicate_id")).toBe(true);

    const missingOwner = { ...document, entities: { ...document.entities, collections: [{ kind: "collection" as const, id: "bad", siteId: "site-a", ownerProfileId: "missing", visibility: "draft" as const, title: "Bad", description: "", postIds: [] }] } };
    const invalidInput = deleteCollection(missingOwner, "bad", { siteId: "site-a" });
    expect(invalidInput.ok).toBe(false);
    if (!invalidInput.ok) expect(invalidInput.diagnostics.some((item) => item.code === "missing_ref")).toBe(true);

    const missingPostOnCreate = createCollection(document, { id: "collection-a", ownerProfileId: owner, title: "A", postIds: ["missing"] }, { siteId: "site-a" });
    expect(missingPostOnCreate.ok).toBe(false);
    if (!missingPostOnCreate.ok) expect(missingPostOnCreate.diagnostics[0]?.code).toBe("missing_ref");

    document = addPost(document, "post-1", owner);
    document = addCollection(document, "collection-a", owner);
    const missingPostOnUpdate = updateCollection(document, "collection-a", { postIds: ["missing"] }, { siteId: "site-a" });
    expect(missingPostOnUpdate.ok).toBe(false);
    if (!missingPostOnUpdate.ok) expect(missingPostOnUpdate.diagnostics[0]?.code).toBe("missing_ref");
  });

  it("reorders only among collections owned by the same profile and deletes reverse refs", () => {
    let document = starter();
    const owner = document.entities.profiles[0].id;
    const otherOwner = "other-owner";
    document = addProfile(document, otherOwner, "other");
    document = addPost(document, "post-1", owner);
    document = addCollection(document, "collection-a", owner);
    document = addCollection(document, "collection-b", owner);
    document = { ...document, entities: { ...document.entities, collections: [...document.entities.collections, { kind: "collection", id: "collection-c", siteId: "site-a", ownerProfileId: otherOwner, visibility: "draft", title: "collection-c", description: "", postIds: [] }] } };
    const assigned = setCollectionPosts(document, "collection-a", ["post-1"], { siteId: "site-a" });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    const reordered = reorderCollection(assigned.document, "collection-a", 1, { siteId: "site-a" });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.document.entities.collections.map((collection) => collection.id)).toEqual(["collection-b", "collection-a", "collection-c"]);
    const deleted = deleteCollection(reordered.document, "collection-a", { siteId: "site-a" });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.entities.collections.map((collection) => collection.id)).toEqual(["collection-b", "collection-c"]);
    expect(deleted.document.entities.posts[0].collectionIds).toEqual([]);
  });
});
