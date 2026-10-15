import { describe, expect, it } from "vitest";
import { createStarterDocument } from "../src/site";
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

  it("is deterministic and rejects invalid or unsupported versions", () => {
    const draft = v2();
    expect(projectPublicSiteDocument(draft, "site-a")).toEqual(projectPublicSiteDocument(draft, "site-a"));
    expect(projectPublicSiteDocument({ schemaVersion: 99 }, "site-a")).toMatchObject({ ok: false, code: "unsupported_version" });
    expect(projectPublicSiteDocument({ schemaVersion: 2 }, "site-a")).toMatchObject({ ok: false, code: "invalid" });
  });
});
