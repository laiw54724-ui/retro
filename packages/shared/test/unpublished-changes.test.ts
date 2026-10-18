import { describe, expect, it } from "vitest";
import { createStarterDocument, makeIgPost } from "../src/site";
import {
  hasUnpublishedChanges,
  migrateSiteDocumentV2,
  projectV2ToLegacyDocument,
  sameDocumentContent,
  type SiteDocumentV2Input
} from "../src/site-versioning";

function baseline(): SiteDocumentV2Input {
  const legacy = createStarterDocument("Publish state", "classic98", "instagram");
  const ig = legacy.windows.find((window) => window.type === "instagram");
  if (!ig || ig.type !== "instagram") throw new Error("starter has no Instagram window");
  ig.content.images = [makeIgPost({ title: "Post", caption: "Caption" })];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  return migrated.document;
}

function decide(draft: SiteDocumentV2Input, published: SiteDocumentV2Input) {
  const draftLegacy = projectV2ToLegacyDocument(draft);
  const publishedLegacy = projectV2ToLegacyDocument(published);
  if (!draftLegacy.ok || !publishedLegacy.ok) throw new Error("projection failed");
  return { draftLegacy: draftLegacy.document, publishedLegacy: publishedLegacy.document, draftCanonical: draft, publishedCanonical: published };
}

/** Canonical-only edits: the lossy legacy projection cannot see any of them (this was the #41 bug). */
const canonicalOnly: Array<[string, (document: SiteDocumentV2Input) => void]> = [
  ["custom fields", (d) => { d.entities.profiles[0].customFields = [{ key: "Role", value: "Guard" }]; }],
  ["pronouns", (d) => { d.entities.profiles[0].pronouns = "they/them"; }],
  ["world tags", (d) => { d.entities.profiles[0].worldTags = ["snow"]; }],
  ["character theme", (d) => { d.entities.profiles[0].themeOverride = { accent: "#ff00aa", background: "#123456" }; }],
  ["profile visibility", (d) => { d.entities.profiles[0].visibility = "draft"; }],
  ["post pin", (d) => { d.entities.posts[0].pinned = true; }],
  ["post world date", (d) => { d.entities.posts[0].worldDateLabel = "Year 3"; }],
  ["post visibility", (d) => { d.entities.posts[0].visibility = "draft"; }],
  ["collection", (d) => { d.entities.collections = [{ kind: "collection", id: "collection:a", siteId: "site-1", ownerProfileId: d.entities.profiles[0].id, visibility: "published", title: "Snow", description: "", postIds: [] }]; }],
  ["social metadata", (d) => { d.entities.posts[0].otherLikeCount = 999; }],
  ["follow edge", (d) => { d.entities.followEdges = [{ kind: "follow", id: "follow:a", siteId: "site-1", fromProfileId: d.entities.profiles[0].id, toProfileId: d.entities.profiles[0].id }]; }],
  ["SEO indexing", (d) => { d.seo = { indexing: false }; }]
];

describe("hasUnpublishedChanges", () => {
  it("is false for an identical snapshot and true when never published", () => {
    const document = baseline();
    expect(hasUnpublishedChanges(decide(structuredClone(document), document))).toBe(false);
    expect(hasUnpublishedChanges({ draftLegacy: {}, publishedLegacy: null })).toBe(true);
  });

  it.each(canonicalOnly)("sees a %s edit that the legacy projection misses", (_name, mutate) => {
    const published = baseline();
    const draft = structuredClone(published);
    mutate(draft);
    const input = decide(draft, published);
    // original failure: comparing only the legacy projection reports "no changes"
    expect(sameDocumentContent(input.draftLegacy, input.publishedLegacy)).toBe(true);
    // fixed behaviour: the canonical comparison reports the edit
    expect(hasUnpublishedChanges(input)).toBe(true);
  });

  it("returns to in-sync when the edit is undone", () => {
    const published = baseline();
    const draft = structuredClone(published);
    draft.entities.profiles[0].pronouns = "they/them";
    expect(hasUnpublishedChanges(decide(draft, published))).toBe(true);
    draft.entities.profiles[0].pronouns = published.entities.profiles[0].pronouns;
    expect(hasUnpublishedChanges(decide(draft, published))).toBe(false);
  });

  it("ignores key order and undefined members (a stored jsonb copy reorders keys)", () => {
    const published = baseline();
    const reordered = JSON.parse(JSON.stringify(published, (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)) as SiteDocumentV2Input;
    const draft = structuredClone(published) as Record<string, unknown>;
    draft.explicitlyUndefined = undefined;
    expect(hasUnpublishedChanges({ ...decide(draft as SiteDocumentV2Input, reordered), draftCanonical: draft, publishedCanonical: reordered })).toBe(false);
  });

  it("falls back to the legacy projection when no canonical pair exists (v1 published copy)", () => {
    const published = baseline();
    const draft = structuredClone(published);
    const same = decide(draft, published);
    expect(hasUnpublishedChanges({ ...same, publishedCanonical: null })).toBe(false);
    draft.siteName = "Renamed";
    const renamed = decide(draft, published);
    expect(hasUnpublishedChanges({ ...renamed, publishedCanonical: null })).toBe(true);
  });
});
