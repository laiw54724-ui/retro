import { describe, expect, it } from "vitest";
import { collectAssetReferences, createAssetReference, replaceAssetReferences } from "../src/asset-reference";
import { projectPublicSiteDocument } from "../src/public-projection";
import { hasUnpublishedChanges } from "../src/publish-state";
import { createStarterDocument, makeIgPost } from "../src/site";
import { migrateSiteDocumentV2, projectV2ToLegacyDocument, type SiteDocumentV2Input } from "../src/site-versioning";

const SITE = "site-1";
const USERNAME = "demo";
const BASE = "https://assets.example/api/assets";
const MAPPING = { username: USERNAME, trustedAssetBaseUrls: [BASE] };
const AVATAR = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
const MEDIA = "1c2d3e4f-5061-4b7c-9d8e-0f1a2b3c4d5e";

function baseline(): SiteDocumentV2Input {
  const legacy = createStarterDocument("Publish state", "classic98", "instagram");
  const ig = legacy.windows.find((window) => window.type === "instagram");
  if (!ig || ig.type !== "instagram") throw new Error("starter has no Instagram window");
  ig.content.images = [makeIgPost({ title: "Post", caption: "Caption" })];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: SITE });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  // a second published character so relationships between characters can be edited
  migrated.document.entities.profiles.push({ ...structuredClone(migrated.document.entities.profiles[0]), id: "profile:two", handle: "two", displayName: "Two", visibility: "published" });
  return migrated.document;
}

/** Same steps as `POST /sites/:id/publish`: public projection, then asset references become public URLs, stored as jsonb. */
function publishLikeApi(draft: SiteDocumentV2Input, options: { reorderKeys?: boolean } = {}): unknown {
  const projected = projectPublicSiteDocument(draft, SITE);
  if (!projected.ok) throw new Error("draft is not publishable");
  const urls = new Map(collectAssetReferences(projected.document).map((id) => [id, `${BASE}/published/${USERNAME}/assets/${id}.png`]));
  const stored = replaceAssetReferences(projected.document, urls);
  const text = JSON.stringify(stored, options.reorderKeys ? (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value : undefined);
  return JSON.parse(text);
}

function decide(draft: SiteDocumentV2Input, publishedRaw: unknown | null, mapping = MAPPING) {
  const legacy = projectV2ToLegacyDocument(draft);
  if (!legacy.ok) throw new Error("projection failed");
  return hasUnpublishedChanges({ siteId: SITE, assets: mapping, draftLegacy: legacy.document, publishedLegacy: publishedRaw === null ? null : legacy.document, draftCanonical: draft, publishedRaw });
}

/** The legacy projection cannot see these (the original #41 bug): they must be caught by comparing public canonical content. */
const canonicalOnly: Array<[string, (document: SiteDocumentV2Input) => void]> = [
  ["custom fields", (d) => { d.entities.profiles[0].customFields = [{ key: "Role", value: "Guard" }]; }],
  ["pronouns", (d) => { d.entities.profiles[0].pronouns = "they/them"; }],
  ["world tags", (d) => { d.entities.profiles[0].worldTags = ["snow"]; }],
  ["character theme", (d) => { d.entities.profiles[0].themeOverride = { accent: "#ff00aa", background: "#123456" }; }],
  ["post pin", (d) => { d.entities.posts[0].pinned = true; }],
  ["post world date", (d) => { d.entities.posts[0].worldDateLabel = "Year 3"; }],
  ["collection", (d) => { d.entities.collections = [{ kind: "collection", id: "collection:a", siteId: SITE, ownerProfileId: d.entities.profiles[0].id, visibility: "published", title: "Snow", description: "", postIds: [] }]; }],
  ["social metadata", (d) => { d.entities.posts[0].otherLikeCount = 999; }],
  ["follow edge", (d) => { d.entities.followEdges = [{ kind: "follow", id: "follow:a", siteId: SITE, fromProfileId: d.entities.profiles[0].id, toProfileId: d.entities.profiles[1].id }]; }],
  ["SEO indexing", (d) => { d.seo = { indexing: false }; }]
];

describe("publish state compares the same semantics the API publishes", () => {
  it("is in sync right after publishing and when the stored copy reorders keys", () => {
    const draft = baseline();
    expect(decide(draft, publishLikeApi(draft))).toBe(false);
    expect(decide(draft, publishLikeApi(draft, { reorderKeys: true }))).toBe(false);
    expect(decide(draft, null)).toBe(true);
  });

  it.each(canonicalOnly)("sees a %s edit", (_name, mutate) => {
    const draft = baseline();
    const published = publishLikeApi(draft);
    mutate(draft);
    expect(decide(draft, published)).toBe(true);
  });

  it("returns to in-sync when the edit is undone", () => {
    const draft = baseline();
    const published = publishLikeApi(draft);
    draft.entities.profiles[0].pronouns = "they/them";
    expect(decide(draft, published)).toBe(true);
    draft.entities.profiles[0].pronouns = "";
    expect(decide(draft, published)).toBe(false);
  });

  describe("private content is filtered exactly as the API filters it", () => {
    function withPrivateContent(draft: SiteDocumentV2Input) {
      const owner = draft.entities.profiles[0];
      draft.entities.profiles.push({ ...structuredClone(owner), id: "profile:secret", handle: "secret", displayName: "Secret", visibility: "draft" });
      draft.entities.posts.push({ ...structuredClone(draft.entities.posts[0]), id: "post:secret", authorProfileId: "profile:secret", visibility: "draft" });
      draft.entities.posts.push({ ...structuredClone(draft.entities.posts[0]), id: "post:hidden", authorProfileId: owner.id, visibility: "draft" });
      draft.entities.collections = [{ kind: "collection", id: "collection:secret", siteId: SITE, ownerProfileId: "profile:secret", visibility: "draft", title: "Private", description: "", postIds: ["post:secret"] }];
    }

    it("a draft with private characters, posts and collections is in sync with its published projection", () => {
      const draft = baseline();
      withPrivateContent(draft);
      const published = publishLikeApi(draft) as { entities: { profiles: Array<{ id: string }>; posts: Array<{ id: string }>; collections: unknown[] } };
      // sanity: the stored copy really lacks the private content, and comparing the whole draft with it would differ
      expect(published.entities.profiles.map((profile) => profile.id)).not.toContain("profile:secret");
      expect(published.entities.posts.map((post) => post.id)).not.toContain("post:secret");
      expect(published.entities.collections).toHaveLength(0);
      expect(decide(draft, published)).toBe(false);
    });

    it("editing only private content does not mark the public result as changed", () => {
      const draft = baseline();
      withPrivateContent(draft);
      const published = publishLikeApi(draft);
      draft.entities.profiles.find((profile) => profile.id === "profile:secret")!.pronouns = "private";
      draft.entities.posts.find((post) => post.id === "post:hidden")!.pinned = true;
      expect(decide(draft, published)).toBe(false);
    });

    it("making private content public, or hiding public content, is a change", () => {
      const draft = baseline();
      withPrivateContent(draft);
      const published = publishLikeApi(draft);
      draft.entities.posts.find((post) => post.id === "post:hidden")!.visibility = "published";
      expect(decide(draft, published)).toBe(true);
      draft.entities.posts.find((post) => post.id === "post:hidden")!.visibility = "draft";
      expect(decide(draft, published)).toBe(false);
      draft.entities.profiles[0].visibility = "draft";
      expect(decide(draft, published)).toBe(true);
    });
  });

  describe("uploaded assets are published under rewritten URLs", () => {
    function withAssets(draft: SiteDocumentV2Input) {
      draft.entities.profiles[0].avatar = createAssetReference(AVATAR);
      draft.entities.posts[0].media = [{ id: "media:1", src: createAssetReference(MEDIA), srcUrl: "", alt: "", crop: undefined, aspectRatio: undefined } as SiteDocumentV2Input["entities"]["posts"][number]["media"][number]];
    }

    it("a draft that references assets is in sync with the published copy that stores their public URLs", () => {
      const draft = baseline();
      withAssets(draft);
      const published = publishLikeApi(draft);
      expect(JSON.stringify(published)).not.toContain("retro-asset:");
      expect(JSON.stringify(published)).toContain(AVATAR);
      expect(decide(draft, published)).toBe(false);
    });

    it("replacing an asset is a change; keeping it is not", () => {
      const draft = baseline();
      withAssets(draft);
      const published = publishLikeApi(draft);
      draft.entities.profiles[0].avatar = createAssetReference("2d3e4f50-6172-4c8d-ae9f-1a2b3c4d5e6f");
      expect(decide(draft, published)).toBe(true);
    });
  });

  describe("asset URLs are matched only at asset positions, for this site, under a trusted base", () => {
    function withAvatar(draft: SiteDocumentV2Input) { draft.entities.profiles[0].avatar = createAssetReference(AVATAR); }
    const publishedUrl = (base = BASE, username = USERNAME, id = AVATAR, ext = "png") => `${base}/published/${username}/assets/${id}.${ext}`;
    function publishedWithAvatarUrl(draft: SiteDocumentV2Input, url: string) {
      const stored = publishLikeApi(draft) as { entities: { profiles: Array<{ avatar: string | null }> } };
      stored.entities.profiles[0].avatar = url;
      return stored;
    }

    it("accepts the exact URL the API writes for this site, for every published extension", () => {
      for (const ext of ["jpg", "png", "webp", "gif", "mp3", "ogg", "wav"]) {
        const draft = baseline(); withAvatar(draft);
        expect(decide(draft, publishedWithAvatarUrl(draft, publishedUrl(BASE, USERNAME, AVATAR, ext))), ext).toBe(false);
      }
    });

    it("rejects the same path on a different origin", () => {
      const draft = baseline(); withAvatar(draft);
      expect(decide(draft, publishedWithAvatarUrl(draft, publishedUrl("https://evil.example/api/assets")))).toBe(true);
      expect(decide(draft, publishedWithAvatarUrl(draft, `${BASE}.evil.example/published/${USERNAME}/assets/${AVATAR}.png`))).toBe(true);
    });

    it("rejects another site's published asset (different username) and a different asset id", () => {
      const draft = baseline(); withAvatar(draft);
      expect(decide(draft, publishedWithAvatarUrl(draft, publishedUrl(BASE, "someone-else")))).toBe(true);
      expect(decide(draft, publishedWithAvatarUrl(draft, publishedUrl(BASE, USERNAME, MEDIA)))).toBe(true);
    });

    it("rejects look-alike shapes: unknown extension, query string, extra path, draft keys", () => {
      const draft = baseline(); withAvatar(draft);
      for (const url of [publishedUrl(BASE, USERNAME, AVATAR, "svg"), `${publishedUrl()}?x=1`, `${publishedUrl()}/extra`, `${BASE}/draft/users/u/sites/s/${AVATAR}.png`]) {
        expect(decide(draft, publishedWithAvatarUrl(draft, url)), url).toBe(true);
      }
    });

    it("does nothing when the base is not trusted or the username is unknown (conservative: reports a change)", () => {
      const draft = baseline(); withAvatar(draft);
      const published = publishLikeApi(draft);
      expect(decide(draft, published, { username: USERNAME, trustedAssetBaseUrls: [] })).toBe(true);
      expect(decide(draft, published, { username: "", trustedAssetBaseUrls: [BASE] })).toBe(true);
      expect(decide(draft, published, { username: USERNAME, trustedAssetBaseUrls: [`${BASE}/`] })).toBe(false); // trailing slash is tolerated
    });

    it("never rewrites ordinary text or external links, even when they look like published asset URLs", () => {
      const draft = baseline();
      const lookalike = publishedUrl("https://elsewhere.example/api/assets");
      draft.entities.profiles[0].bio = `see ${publishedUrl()}`;
      draft.entities.profiles[0].customFields = [{ key: "Link", value: publishedUrl() }];
      const published = publishLikeApi(draft) as { entities: { profiles: Array<{ bio: string; customFields: Array<{ value: string }> }> } };
      // identical text stays identical...
      expect(decide(draft, published)).toBe(false);
      // ...and text that merely resembles an asset URL is a change when it differs, never "the same asset"
      published.entities.profiles[0].customFields[0].value = lookalike;
      expect(decide(draft, published)).toBe(true);
      const other = publishLikeApi(draft) as typeof published;
      other.entities.profiles[0].bio = `see ${publishedUrl(BASE, USERNAME, MEDIA)}`;
      expect(decide(draft, other)).toBe(true);
    });

    it("a draft that holds a plain URL where the stored copy holds the converted asset is a change (no reverse rewriting)", () => {
      const draft = baseline();
      draft.entities.profiles[0].avatar = publishedUrl(); // an author-pasted URL, not a reference
      const stored = publishLikeApi(draft);
      expect(decide(draft, stored)).toBe(false);
      const withRef = baseline(); withAvatar(withRef);
      expect(decide(withRef, publishLikeApi(draft))).toBe(true);
    });

    it("a reference in an ordinary text field is converted by the API the same way and compares equal at that position", () => {
      const draft = baseline();
      draft.entities.profiles[0].bio = createAssetReference(AVATAR);
      expect(decide(draft, publishLikeApi(draft))).toBe(false);
    });
  });

  describe("old v1 published copy with a v2 draft", () => {
    function v1Published() {
      const legacy = createStarterDocument("Publish state", "classic98", "instagram");
      const ig = legacy.windows.find((window) => window.type === "instagram");
      if (!ig || ig.type !== "instagram") throw new Error("starter has no Instagram window");
      ig.content.images = [makeIgPost({ title: "Post", caption: "Caption" })];
      // legacy highlights live on the profile; the public projection re-issues them with canonical ids
      ig.content.profile.highlights = [{ id: "h1", title: "Trip", src: null, srcUrl: "" }];
      return { legacy, draft: (() => { const migrated = migrateSiteDocumentV2(legacy, { siteId: SITE }); if (!migrated.ok || migrated.version !== 2) throw new Error("migration"); return migrated.document; })() };
    }

    it("an unchanged migrated draft is in sync with the v1 copy it came from", () => {
      const { legacy, draft } = v1Published();
      expect(decide(draft, structuredClone(legacy))).toBe(false);
    });

    it.each(canonicalOnly.filter(([name]) => name !== "follow edge"))("still sees a canonical-only %s edit (does not fall back to the lossy legacy comparison)", (_name, mutate) => {
      const { legacy, draft } = v1Published();
      mutate(draft);
      const result = decide(draft, structuredClone(legacy));
      expect(result).toBe(true);
    });

    it("sees an edit that the legacy projection also shows", () => {
      const { legacy, draft } = v1Published();
      draft.siteName = "Renamed";
      expect(decide(draft, structuredClone(legacy))).toBe(true);
    });
  });

  describe("timestamps and ordering are content", () => {
    it("createdAt/updatedAt are part of the published post, so changing one is a change; equal values are not", () => {
      const draft = baseline();
      draft.entities.posts[0].createdAt = "2026-10-01T00:00:00.000Z";
      draft.entities.posts[0].updatedAt = "2026-10-01T00:00:00.000Z";
      const published = publishLikeApi(draft);
      expect((published as { entities: { posts: Array<{ updatedAt?: string }> } }).entities.posts[0].updatedAt).toBe("2026-10-01T00:00:00.000Z");
      expect(decide(draft, published)).toBe(false);
      draft.entities.posts[0].updatedAt = "2026-10-02T00:00:00.000Z";
      expect(decide(draft, published)).toBe(true);
    });

    it("array order is meaningful and is never sorted away", () => {
      const draft = baseline();
      draft.entities.posts.push({ ...structuredClone(draft.entities.posts[0]), id: "post:second", caption: "Second" });
      const published = publishLikeApi(draft);
      draft.entities.posts.reverse();
      expect(decide(draft, published)).toBe(true);
    });
  });
});
