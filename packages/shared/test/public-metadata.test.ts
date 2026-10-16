import { describe, expect, it } from "vitest";
import { buildPublicMetadata, createStarterDocument, makeIgPost, migrateSiteDocumentV2 } from "../src";

function fixture() {
  const legacy = createStarterDocument("星球 <script>", "classic98", "instagram");
  const instagram = legacy.windows.find((window) => window.type === "instagram");
  if (!instagram || instagram.type !== "instagram") throw new Error("fixture Instagram missing");
  instagram.content.images = [makeIgPost({ title: "第一篇", caption: "公開貼文內容" })];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  const profile = migrated.document.entities.profiles[0];
  const post = migrated.document.entities.posts[0];
  profile.displayName = "貝貝 & 朋友";
  profile.bio = "這是公開角色。";
  profile.avatar = "https://cdn.example.com/avatar.png";
  post.title = "第一篇";
  post.caption = "公開貼文內容";
  post.media[0].src = "https://cdn.example.com/post.png";
  return { document: migrated.document, profile, post };
}

describe("public metadata", () => {
  it("derives canonical OC and post metadata only from the published projection", () => {
    const { document, profile, post } = fixture();
    expect(buildPublicMetadata({ siteId: "site-a", username: "bei bei", siteName: document.siteName, publishedVersion: 7, document, target: { kind: "oc", id: profile.id } })).toMatchObject({
      ok: true,
      metadata: { title: "貝貝 & 朋友 — 星球 <script>", canonicalPath: `/@bei%20bei/oc/${encodeURIComponent(profile.id)}`, image: "https://cdn.example.com/avatar.png", cacheKey: `published:7:oc:${profile.id}` },
    });
    expect(buildPublicMetadata({ siteId: "site-a", username: "beibei", siteName: document.siteName, publishedVersion: 7, document, target: { kind: "post", id: post.id } })).toMatchObject({
      ok: true,
      metadata: { title: "第一篇 — 貝貝 & 朋友", image: "https://cdn.example.com/post.png" },
    });
  });

  it("returns a public 404 for draft or unknown entities and carries the indexing setting", () => {
    const { document, profile } = fixture();
    profile.visibility = "draft";
    expect(buildPublicMetadata({ siteId: "site-a", username: "beibei", siteName: document.siteName, publishedVersion: 1, document, target: { kind: "oc", id: profile.id } })).toEqual({ ok: false, code: "not_found" });
    document.seo.indexing = false;
    expect(buildPublicMetadata({ siteId: "site-a", username: "beibei", siteName: document.siteName, publishedVersion: 1, document })).toMatchObject({ ok: true, metadata: { robots: "noindex,nofollow" } });
  });
});
