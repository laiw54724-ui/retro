import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow } from "../src/site";
import { migrateSiteDocumentV2 } from "../src/site-versioning";
import { projectPublicSiteDocument } from "../src/public-projection";

function v2() {
  const draft = createStarterDocument("Projection", "classic98", "instagram");
  const migrated = migrateSiteDocumentV2(draft, { siteId: "site-a" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  const profile = migrated.document.entities.profiles[0];
  const post = migrated.document.entities.posts[0] ?? {
    kind: "post" as const, id: "post-1", siteId: "site-a", visibility: "published" as const,
    authorProfileId: profile.id, src: "https://example.com/p.jpg", title: "Post", caption: "Caption", srcUrl: "https://example.com/private.jpg", href: "",
    location: "", date: "", likes: 0, comments: [], extra: []
  };
  return { ...migrated.document, entities: { ...migrated.document.entities, posts: [post] } };
}

describe("public site projection", () => {
  it("keeps v1 documents compatible and does not mutate input", () => {
    const draft = createStarterDocument("Legacy", "classic98", "blank");
    const before = structuredClone(draft);
    const result = projectPublicSiteDocument(draft, "site-a");
    expect(result).toMatchObject({ ok: true, version: 1, document: draft });
    expect(draft).toEqual(before);
  });

  it("removes private profiles/posts, their Instagram windows, and dead window links", () => {
    const draft = v2();
    const profile = draft.entities.profiles[0];
    const post = draft.entities.posts[0];
    profile.visibility = "draft";
    post.visibility = "draft";
    const result = projectPublicSiteDocument(draft, "site-a");
    expect(result.ok).toBe(true);
    if (!result.ok || result.version !== 2) return;
    expect(result.document.entities.profiles).toEqual([]);
    expect(result.document.entities.posts).toEqual([]);
    expect(result.document.windows.every((window) => window.type !== "instagram")).toBe(true);
    expect(JSON.stringify(result.document)).not.toContain(profile.username);
    expect(JSON.stringify(result.document)).not.toContain(post.srcUrl);
  });

  it("filters rich content references transitively", () => {
    const draft = v2();
    const profile = draft.entities.profiles[0];
    const post = draft.entities.posts[0];
    if (!profile || !post) throw new Error("fixture missing");
    const hidden = { ...profile, id: "profile-hidden", handle: "hidden", username: "hidden", displayName: "Hidden", name: "Hidden", visibility: "draft" as const, avatarUrl: "https://private/avatar.png", linkUrl: "https://private/profile" };
    draft.entities.profiles.push(hidden);
    profile.highlights = [{ id: "legacy-private-highlight", title: "Private embedded", src: "https://private/embedded.png", srcUrl: "https://private/embedded-raw.png" }];
    post.taggedProfileIds = [profile.id, hidden.id];
    post.media = [{ id: "media-public", src: "https://public/image.png", srcUrl: "https://public/raw.png", alt: "public" }];
    draft.entities.highlights.push({ kind: "highlight", id: "highlight-public", siteId: profile.siteId, ownerProfileId: profile.id, visibility: "draft", title: "Private", coverSrc: "https://private/cover.png", coverSrcUrl: "https://private/cover-raw.png", coverAlt: "", frames: [{ id: "frame-hidden", src: "https://private/frame.png", srcUrl: "https://private/frame-raw.png", alt: "", text: "draft frame" }] });
    draft.entities.collections.push({ kind: "collection", id: "collection-public", siteId: profile.siteId, ownerProfileId: profile.id, visibility: "published", title: "Works", description: "", postIds: [post.id] });
    draft.entities.collections.push({ kind: "collection", id: "collection-hidden-owner", siteId: profile.siteId, ownerProfileId: hidden.id, visibility: "published", title: "Private collection", description: "do not leak", postIds: [post.id] });
    post.collectionIds = ["collection-public", "collection-hidden-owner"];
    post.namedLikerIds = [profile.id, hidden.id];
    post.actorComments = [
      { id: "comment-public", authorKind: "profile", authorProfileId: profile.id, text: "hello" },
      { id: "comment-hidden", authorKind: "profile", authorProfileId: hidden.id, text: "PRIVATE_ACTOR" },
      { id: "comment-legacy", authorKind: "legacy", legacyAuthorText: "old friend", text: "legacy" }
    ];
    draft.entities.followEdges.push(
      { kind: "follow", id: "follow-public", siteId: profile.siteId, fromProfileId: profile.id, toProfileId: hidden.id }
    );
    const result = projectPublicSiteDocument(draft, profile.siteId);
    expect(result.ok).toBe(true);
    if (!result.ok || result.version !== 2) return;
    expect(result.document.entities.profiles.some((item) => item.id === hidden.id)).toBe(false);
    expect(result.document.entities.posts[0]?.taggedProfileIds).toEqual([profile.id]);
    expect(JSON.stringify(result.document)).not.toContain("private/avatar.png");
    expect(JSON.stringify(result.document)).not.toContain("private/frame.png");
    expect(result.document.entities.highlights).toEqual([]);
    expect(result.document.entities.profiles[0]?.highlights).toEqual([]);
    expect(result.document.entities.posts[0]?.collectionIds).toEqual(["collection-public"]);
    expect(result.document.entities.collections[0]?.postIds).toEqual([post.id]);
    expect(JSON.stringify(result.document)).not.toContain("Private collection");
    expect(JSON.stringify(result.document)).not.toContain("private/embedded.png");
    expect(result.document.entities.posts[0]?.namedLikerIds).toEqual([profile.id]);
    expect(result.document.entities.posts[0]?.actorComments.map((comment) => comment.id)).toEqual(["comment-public", "comment-legacy"]);
    expect(result.document.entities.followEdges).toEqual([]);
    expect(JSON.stringify(result.document)).not.toContain("PRIVATE_ACTOR");
  });

  it("removes draft Explorer branches and shortcuts to unavailable windows", () => {
    const draft = v2();
    const target = draft.windows.find((window) => window.type !== "instagram");
    const hiddenTarget = draft.windows.find((window) => window.type === "instagram");
    if (!target || !hiddenTarget) throw new Error("target window missing");
    draft.entities.profiles[0].visibility = "draft";
    const explorer = makeWindow("explorer", draft.windows.length);
    if (explorer.type !== "explorer") throw new Error("explorer factory mismatch");
    explorer.id = "explorer-1";
    explorer.title = "World.exe";
    explorer.content = {
        folders: [
          { id: "public-root", parentId: null, name: "Public", order: 0, visibility: "published" },
          { id: "draft-parent", parentId: null, name: "Draft", order: 1, visibility: "draft" },
          { id: "orphan-child", parentId: "draft-parent", name: "Hidden child", order: 0, visibility: "published" }
        ],
        shortcuts: [
          { id: "public-link", parentId: "public-root", label: "Profile", order: 0, visibility: "published", target: { siteId: "site-a", id: target.id, kind: "window" } },
          { id: "hidden-branch-link", parentId: "orphan-child", label: "Hidden", order: 1, visibility: "published", target: { siteId: "site-a", id: target.id, kind: "window" } },
          { id: "removed-window", parentId: null, label: "Hidden profile window", order: 2, visibility: "published", target: { siteId: "site-a", id: hiddenTarget.id, kind: "window" } },
          { id: "removed-profile", parentId: null, label: "Hidden profile", order: 3, visibility: "published", target: { siteId: "site-a", id: draft.entities.profiles[0].id, kind: "profile" } },
          { id: "removed-post", parentId: null, label: "Hidden post", order: 4, visibility: "published", target: { siteId: "site-a", id: draft.entities.posts[0].id, kind: "post" } }
        ]
    };
    draft.windows.push(explorer);
    const result = projectPublicSiteDocument(draft, "site-a");
    expect(result.ok).toBe(true);
    if (!result.ok || result.version !== 2) return;
    const projectedExplorer = result.document.windows.find((window) => window.type === "explorer");
    if (!projectedExplorer || projectedExplorer.type !== "explorer") throw new Error("projected explorer missing");
    expect(projectedExplorer.content.folders.map((folder) => folder.id)).toEqual(["public-root"]);
    expect(projectedExplorer.content.shortcuts.map((shortcut) => shortcut.id)).toEqual(["public-link"]);
  });

  it("is deterministic and rejects invalid or unsupported versions", () => {
    const draft = v2();
    expect(projectPublicSiteDocument(draft, "site-a")).toEqual(projectPublicSiteDocument(draft, "site-a"));
    expect(projectPublicSiteDocument({ schemaVersion: 99 }, "site-a")).toMatchObject({ ok: false, code: "unsupported_version" });
    expect(projectPublicSiteDocument({ schemaVersion: 2 }, "site-a")).toMatchObject({ ok: false, code: "invalid" });
  });
});
