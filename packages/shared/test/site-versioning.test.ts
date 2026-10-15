import { describe, expect, it } from "vitest";
import { createStarterDocument } from "../src/site";
import {
  collectEntityReferrers,
  migrateSiteDocumentV2,
  parseSiteDocument,
  resolveEntityRef,
} from "../src/site-versioning";

function fixture() {
  const d = createStarterDocument("Versioned", "classic98", "instagram");
  d.windows = [
    { id: "doc-1", type: "document", title: "Doc", icon: "x", defaultOpen: true, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 1 }, mobile: { order: 0 } }, content: { blocks: [] } },
    { id: "gallery-1", type: "gallery", title: "Gallery", icon: "x", defaultOpen: false, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 2 }, mobile: { order: 1 } }, content: { columns: 2, images: [] } },
    { id: "links-1", type: "links", title: "Links", icon: "x", defaultOpen: false, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 3 }, mobile: { order: 2 } }, content: { links: [] } },
    { id: "about-1", type: "about", title: "About", icon: "x", defaultOpen: false, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 4 }, mobile: { order: 3 } }, content: { avatar: null, nickname: "A", bio: "", banner: "", quote: "", detailsTitle: "File Details", fields: [], socials: [] } },
    { id: "ig-1", type: "instagram", title: "Instagram", icon: "x", defaultOpen: true, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 5 }, mobile: { order: 4 } }, content: { skin: "modern", profile: { username: "alice", avatar: null, name: "Alice", alt: "", bio: "hi", followers: "1", following: "2", followedBy: "", avatarUrl: "", linkLabel: "", linkUrl: "", dmUrl: "", verified: true, showCounts: true, showHighlights: true, showFollowedBy: true, showLikes: true, allowLikes: true, allowComments: true, highlights: [{ id: "h1", title: "Trip", src: null, srcUrl: "" }] }, images: [{ id: "p1", src: null, title: "P", caption: "C", srcUrl: "", href: "", location: "", date: "", likes: 3, comments: [{ id: "c1", user: "bob", text: "yo" }], extra: [{ id: "e1", src: null, srcUrl: "" }] }] } },
  ];
  return d;
}

describe("versioned site document contract", () => {
  it("parses v1 and v2, and rejects unsupported or malformed versions", () => {
    const v1 = fixture();
    expect(parseSiteDocument(v1)).toMatchObject({ ok: true, version: 1 });
    const v2 = migrateSiteDocumentV2(v1, { siteId: "site-a" });
    expect(v2).toMatchObject({ ok: true, version: 2 });
    expect(parseSiteDocument({ ...v1, schemaVersion: 99 })).toMatchObject({ ok: false, code: "unsupported_version" });
    expect(parseSiteDocument({ schemaVersion: "1" })).toMatchObject({ ok: false, code: "invalid" });
    expect(parseSiteDocument({ schemaVersion: 1, windows: [] })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("migrates Instagram data into typed entities without mutating input", () => {
    const v1 = fixture();
    const before = structuredClone(v1);
    const result = migrateSiteDocumentV2(v1, { siteId: "site-a" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.profiles).toHaveLength(1);
    expect(result.document.posts).toHaveLength(1);
    expect(result.document.profiles[0]).toMatchObject({ id: "profile:ig-1", siteId: "site-a", kind: "profile", visibility: "published", username: "alice" });
    expect(result.document.posts[0]).toMatchObject({ id: "post:ig-1:p1", authorProfileId: "profile:ig-1", comments: [{ id: "c1" }], extra: [{ id: "e1" }] });
    expect(result.document.windows.find((w) => w.id === "ig-1")).toMatchObject({ content: { profileRef: { siteId: "site-a", id: "profile:ig-1", kind: "profile" } } });
    expect(v1).toEqual(before);
    expect(migrateSiteDocumentV2(v1, { siteId: "site-a" })).toEqual(result);
  });

  it("resolves refs and reports referrers and semantic errors", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ref = { siteId: "site-a", id: "profile:ig-1", kind: "profile" as const };
    expect(resolveEntityRef(result.document, ref)).toMatchObject({ ok: true, value: { id: ref.id } });
    expect(resolveEntityRef(result.document, { ...ref, siteId: "other" })).toMatchObject({ ok: false, code: "cross_site" });
    expect(resolveEntityRef(result.document, { ...ref, id: "profile:nope" })).toMatchObject({ ok: false, code: "missing" });
    expect(collectEntityReferrers(result.document, ref)).toEqual([{ kind: "window", windowId: "ig-1" }, { kind: "post", postId: "post:ig-1:p1", field: "authorProfileId" }]);
  });
});
