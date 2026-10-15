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
    { id: "doc-1", type: "document", title: "Doc", icon: "x", defaultOpen: true, appearance: { titleFrom: "#112233", titleTo: "#334455", titleGradient: false }, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 1, iconX: 11, iconY: 22 }, mobile: { order: 0 } }, content: { blocks: [{ id: "b1", kind: "heading", text: "Hello" }, { id: "b2", kind: "text", text: "Body", align: "center", bold: true, italic: true }] } },
    { id: "gallery-1", type: "gallery", title: "Gallery", icon: "x", defaultOpen: false, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 2, iconX: 33, iconY: 44 }, mobile: { order: 1 } }, content: { columns: 2, images: [{ id: "g1", src: "https://example.com/g.jpg", title: "G", caption: "Gallery", srcUrl: "https://example.com/raw", href: "https://example.com" }] } },
    { id: "links-1", type: "links", title: "Links", icon: "x", defaultOpen: false, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 3, iconX: 55, iconY: 66 }, mobile: { order: 2 } }, content: { links: [{ id: "l1", label: "Home", icon: "star", color: "#123456", target: "url", url: "https://example.com", windowId: "", iconUrl: "https://example.com/i.png" }] } },
    { id: "about-1", type: "about", title: "About", icon: "x", defaultOpen: false, appearance: { titleFrom: "#445566", titleTo: "#667788", titleGradient: true }, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 4, iconX: 77, iconY: 88 }, mobile: { order: 3 } }, content: { avatar: "https://example.com/avatar.jpg", avatarCrop: { x: 10, y: 20, zoom: 2 }, nickname: "A", bio: "About bio", banner: "Banner", quote: "Quote", detailsTitle: "Details", avatarUrl: "https://example.com/avatar.jpg", fields: [{ id: "f1", key: "Role", value: "Builder" }], socials: [{ id: "s1", label: "Web", url: "https://example.com" }] } },
    { id: "ig-1", type: "instagram", title: "Instagram", icon: "x", defaultOpen: true, layout: { desktop: { x: 1, y: 2, w: 300, h: 200, z: 5, iconX: 99, iconY: 111 }, mobile: { order: 4 } }, content: { skin: "modern", profile: { username: "alice", avatar: "https://example.com/a.jpg", avatarCrop: { x: 3, y: 4, zoom: 3 }, name: "Alice", alt: "Alice alt", bio: "hello bio", followers: "101", following: "202", followedBy: "Bob follows", avatarUrl: "https://example.com/a.jpg", linkLabel: "Site", linkUrl: "https://example.com", dmUrl: "https://example.com/dm", verified: true, showCounts: false, showHighlights: false, showFollowedBy: false, showLikes: false, allowLikes: false, allowComments: false, highlights: [{ id: "h1", title: "Trip", src: "https://example.com/h.jpg", srcUrl: "https://example.com/h-raw" }] }, images: [{ id: "p1", src: "https://example.com/p.jpg", title: "P", caption: "C", srcUrl: "https://example.com/p-raw", href: "https://example.com/p", location: "Paris", date: "2025-01-01", likes: 300, comments: [{ id: "c1", user: "bob", text: "yo" }], extra: [{ id: "e1", src: "https://example.com/e.jpg", srcUrl: "https://example.com/e-raw" }] }] } },
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
    expect(result.document.entities.profiles).toHaveLength(1);
    expect(result.document.entities.posts).toHaveLength(1);
    expect(result.document.entities.profiles[0]).toMatchObject({ id: "profile:ig-1", siteId: "site-a", kind: "profile", visibility: "published", username: "alice" });
    expect(result.document.entities.posts[0]).toMatchObject({ id: "post:ig-1:p1", authorProfileId: "profile:ig-1", comments: [{ id: "c1" }], extra: [{ id: "e1" }] });
    expect(result.document.windows.find((w) => w.id === "ig-1")).toMatchObject({ content: { profileRef: { siteId: "site-a", id: "profile:ig-1", kind: "profile" } } });
    expect(v1).toEqual(before);
    expect(migrateSiteDocumentV2(v1, { siteId: "site-a" })).toEqual(result);
    expect(result.document.siteName).toBe(v1.siteName);
    expect(result.document.theme).toEqual(v1.theme);
    expect(result.document.mobileColumns).toBe(v1.mobileColumns);
    for (const original of v1.windows.filter((w) => w.type !== "instagram")) expect(result.document.windows.find((w) => w.id === original.id)).toEqual(original);
    const originalIg = v1.windows.find((w) => w.id === "ig-1")!;
    const migratedIg = result.document.windows.find((w) => w.id === "ig-1")!;
    expect({ ...migratedIg, content: undefined }).toEqual({ ...originalIg, content: undefined });
    if (originalIg.type === "instagram") {
      const { profile: legacyProfile } = originalIg.content;
      const entity = result.document.entities.profiles[0];
      const { kind, id, siteId, visibility, ...profileFields } = entity;
      expect(profileFields).toEqual(legacyProfile);
      const legacyPost = originalIg.content.images[0];
      const migratedPost = result.document.entities.posts[0];
      const { kind: pk, id: pid, siteId: ps, visibility: pv, authorProfileId, ...postFields } = migratedPost;
      const { id: legacyPostId, ...legacyPostFields } = legacyPost;
      expect(postFields).toEqual(legacyPostFields);
    }
  });

  it("resolves refs and reports referrers and semantic errors", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ref = { siteId: "site-a", id: "profile:ig-1", kind: "profile" as const };
    expect(resolveEntityRef(result.document, { siteId: "site-a", id: "ig-1", kind: "window" }, "site-a")).toMatchObject({ ok: true });
    expect(resolveEntityRef(result.document, ref, "site-a")).toMatchObject({ ok: true, value: { id: ref.id } });
    expect(resolveEntityRef(result.document, { siteId: "site-a", id: "post:ig-1:p1", kind: "post" }, "site-a")).toMatchObject({ ok: true });
    expect(resolveEntityRef(result.document, { ...ref, siteId: "other" }, "site-a")).toMatchObject({ ok: false, reason: "cross_site" });
    expect(resolveEntityRef(result.document, { ...ref, id: "profile:nope" }, "site-a")).toMatchObject({ ok: false, reason: "missing" });
    expect(collectEntityReferrers(result.document, ref, "site-a")).toEqual([{ kind: "window", windowId: "ig-1" }, { kind: "post", postId: "post:ig-1:p1", field: "authorProfileId" }]);
    expect(collectEntityReferrers(result.document, ref, "other")).toEqual([]);
    expect(collectEntityReferrers(result.document, { ...ref, kind: "post" }, "site-a")).toEqual([]);
  });

  it("keeps same legacy post ids unique across Instagram windows and is idempotent", () => {
    const input = fixture();
    const ig = input.windows.find((w) => w.id === "ig-1")!;
    input.windows.push({ ...ig, id: "ig-2", title: "Instagram 2", layout: { ...ig.layout, desktop: { ...ig.layout.desktop, z: 6 }, mobile: { order: 5 } } });
    const first = migrateSiteDocumentV2(input, { siteId: "site-a" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.document.entities.posts.map((p) => p.id)).toEqual(["post:ig-1:p1", "post:ig-2:p1"]);
    expect(migrateSiteDocumentV2(first.document, { siteId: "site-a" })).toEqual(first);
  });

  it("rejects strict v2 nested extras and semantic duplicates/missing refs", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const strictCases: Array<[unknown, string[]]> = [
      [{ ...migrated.document, theme: { ...migrated.document.theme, extra: true } }, ["theme"]],
      [{ ...migrated.document, windows: [{ ...migrated.document.windows[0], layout: { ...migrated.document.windows[0].layout, desktop: { ...migrated.document.windows[0].layout.desktop, extra: 1 } } }] }, ["windows", "0", "layout", "desktop"]],
      [{ ...migrated.document, windows: migrated.document.windows.map((w) => w.id === "ig-1" && w.type === "instagram" ? { ...w, appearance: { titleFrom: "#000000", titleTo: "#000000", titleGradient: true, extra: 1 } } : w) }, ["appearance"]],
      [{ ...migrated.document, entities: { ...migrated.document.entities, profiles: [{ ...migrated.document.entities.profiles[0], avatarCrop: { x: 1, y: 1, zoom: 1, extra: 1 } }] } }, ["avatarCrop"]],
      [{ ...migrated.document, entities: { ...migrated.document.entities, profiles: [{ ...migrated.document.entities.profiles[0], highlights: [{ ...migrated.document.entities.profiles[0].highlights[0], extra: true }] }] } }, ["highlights"]],
      [{ ...migrated.document, entities: { ...migrated.document.entities, posts: [{ ...migrated.document.entities.posts[0], comments: [{ ...migrated.document.entities.posts[0].comments[0], extra: true }] }] } }, ["comments"]],
      [{ ...migrated.document, entities: { ...migrated.document.entities, posts: [{ ...migrated.document.entities.posts[0], extra: [{ ...migrated.document.entities.posts[0].extra[0], extra: true }] }] } }, ["extra"]],
    ];
    for (const [value, path] of strictCases) {
      const parsed = parseSiteDocument(value);
      expect(parsed).toMatchObject({ ok: false, code: "invalid" });
      if (!parsed.ok && parsed.code === "invalid") expect(parsed.diagnostics.some((d) => path.every((part) => d.path.map(String).includes(part)))).toBe(true);
    }
    expect(parseSiteDocument({ ...migrated.document, windows: [...migrated.document.windows, migrated.document.windows[0]] })).toMatchObject({ ok: false, code: "invalid" });
    expect(parseSiteDocument({ ...migrated.document, entities: { ...migrated.document.entities, posts: [{ ...migrated.document.entities.posts[0], authorProfileId: "missing" }] } })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("reports duplicate legacy windows and accepts an empty v2 site", () => {
    const input = fixture();
    input.windows.push(input.windows[0]);
    expect(migrateSiteDocumentV2(input, { siteId: "site-a" })).toMatchObject({ ok: false, code: "invalid" });
    const empty = { ...fixture(), windows: [], entities: { profiles: [], posts: [] }, schemaVersion: 2 };
    expect(parseSiteDocument(empty)).toMatchObject({ ok: true, version: 2 });
  });

  it("reports semantic duplicate and cross-site diagnostics with stable paths", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const duplicate = parseSiteDocument({ ...migrated.document, entities: { profiles: [migrated.document.entities.profiles[0], migrated.document.entities.profiles[0]], posts: [migrated.document.entities.posts[0], migrated.document.entities.posts[0]] } });
    expect(duplicate).toMatchObject({ ok: false });
    if (!duplicate.ok && duplicate.code === "invalid") {
      expect(duplicate.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_id", path: ["entities", "profiles", 1, "id"] }),
        expect.objectContaining({ code: "duplicate_id", path: ["entities", "posts", 1, "id"] }),
      ]));
    }
    const missingProfile = parseSiteDocument({ ...migrated.document, windows: migrated.document.windows.map((w) => w.type === "instagram" ? { ...w, content: { ...w.content, profileRef: { ...w.content.profileRef, id: "missing" } } } : w) });
    expect(missingProfile).toMatchObject({ ok: false });
    if (!missingProfile.ok && missingProfile.code === "invalid") expect(missingProfile.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_ref", path: ["windows", 4, "content", "profileRef"] })]));
    const crossAuthor = parseSiteDocument({ ...migrated.document, entities: { ...migrated.document.entities, profiles: [{ ...migrated.document.entities.profiles[0], siteId: "other" }] } });
    expect(crossAuthor).toMatchObject({ ok: false });
    if (!crossAuthor.ok && crossAuthor.code === "invalid") expect(crossAuthor.diagnostics.some((d) => d.code === "cross_site")).toBe(true);
    const reversed = parseSiteDocument({ ...migrated.document, entities: { profiles: migrated.document.entities.profiles.map((p) => ({ ...p, siteId: "other" })), posts: migrated.document.entities.posts }, windows: migrated.document.windows.map((w) => w.type === "instagram" ? { ...w, content: { ...w.content, profileRef: { ...w.content.profileRef, siteId: "site-a" } } } : w) });
    expect(reversed).toMatchObject({ ok: false });
    if (!reversed.ok && reversed.code === "invalid") expect(reversed.diagnostics[0]).toMatchObject({ code: "cross_site", path: ["entities"] });
  });
});
