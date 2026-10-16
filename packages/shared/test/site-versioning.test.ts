import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow } from "../src/site";
import {
  collectEntityReferrers,
  createProfile,
  deleteOrRetargetProfile,
  duplicateProfile,
  inspectProfileReferences,
  loadVersionedSiteDocument,
  mergeLegacyDocumentIntoV2,
  migrateSiteDocumentV2,
  parseSiteDocument,
  projectV2ToLegacyDocument,
  resolveEntityRef,
  updateProfile,
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
    expect(result.document.entities.followEdges).toEqual([]);
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
      expect(profileFields).toMatchObject(legacyProfile);
      expect(entity).toMatchObject({ handle: "alice", displayName: "Alice", legacyUsernameLabel: "alice", legacyFollowersLabel: "101", legacyFollowingLabel: "202", otherFollowerCount: null, otherFollowingCount: null });
      const legacyPost = originalIg.content.images[0];
      const migratedPost = result.document.entities.posts[0];
      expect(migratedPost).toMatchObject({ namedLikerIds: [], otherLikeCount: 300, actorComments: [] });
      const { kind: pk, id: pid, siteId: ps, visibility: pv, authorProfileId, media: _media, worldDateLabel: _worldDateLabel, taggedProfileIds: _taggedProfileIds, collectionIds: _collectionIds, pinned: _pinned, namedLikerIds: _namedLikerIds, otherLikeCount: _otherLikeCount, actorComments: _actorComments, ...postFields } = migratedPost;
      const { id: legacyPostId, ...legacyPostFields } = legacyPost;
      expect(postFields).toEqual(legacyPostFields);
    }
  });

  it("round-trips music windows and validates same-site character references", () => {
    const v1 = fixture();
    const music = makeWindow("music", v1.windows.length);
    if (music.type !== "music") throw new Error("music factory mismatch");
    music.id = "music-1";
    music.content.tracks = [{ id: "theme-1", title: "Alice Theme", artist: "Alice", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://media.example.com/alice.mp3" }, characterRef: { siteId: "site-a", id: "profile:ig-1", kind: "profile" }, lyrics: "hello", rightsNote: "Original" }];
    music.content.playlist.trackIds = ["theme-1"];
    v1.windows.push(music);
    const migrated = migrateSiteDocumentV2(v1, { siteId: "site-a" });
    expect(migrated).toMatchObject({ ok: true, version: 2 });
    if (!migrated.ok || migrated.version !== 2) return;
    expect(migrated.document.windows.find((window) => window.id === "music-1")).toEqual(music);
    const projected = projectV2ToLegacyDocument(migrated.document);
    expect(projected).toMatchObject({ ok: true });
    if (projected.ok) expect(projected.document.windows.find((window) => window.id === "music-1")).toEqual(music);

    const crossSite = structuredClone(migrated.document);
    const musicV2 = crossSite.windows.find((window) => window.id === "music-1");
    if (!musicV2 || musicV2.type !== "music") throw new Error("missing migrated music window");
    musicV2.content.tracks[0].characterRef = { siteId: "other", id: "profile:ig-1", kind: "profile" };
    expect(parseSiteDocument(crossSite)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("round-trips Explorer windows and validates shortcut references", () => {
    const v1 = fixture();
    const explorer = makeWindow("explorer", v1.windows.length);
    if (explorer.type !== "explorer") throw new Error("explorer factory mismatch");
    explorer.id = "explorer-1";
    explorer.content.folders = [{ id: "characters", parentId: null, name: "Characters", order: 0, visibility: "published" }];
    explorer.content.shortcuts = [
      { id: "about-link", parentId: "characters", label: "About", order: 0, visibility: "published", target: { siteId: "site-a", id: "about-1", kind: "window" } },
      { id: "alice-link", parentId: "characters", label: "Alice", order: 1, visibility: "published", target: { siteId: "site-a", id: "profile:ig-1", kind: "profile" } },
      { id: "post-link", parentId: "characters", label: "Post", order: 2, visibility: "published", target: { siteId: "site-a", id: "post:ig-1:p1", kind: "post" } }
    ];
    v1.windows.push(explorer);
    const migrated = migrateSiteDocumentV2(v1, { siteId: "site-a" });
    expect(migrated).toMatchObject({ ok: true, version: 2 });
    if (!migrated.ok || migrated.version !== 2) return;
    expect(migrated.document.windows.find((window) => window.id === explorer.id)).toEqual(explorer);

    const missing = structuredClone(migrated.document);
    const missingExplorer = missing.windows.find((window) => window.id === explorer.id);
    if (!missingExplorer || missingExplorer.type !== "explorer") throw new Error("missing explorer");
    missingExplorer.content.shortcuts[1].target.id = "missing";
    expect(parseSiteDocument(missing)).toMatchObject({ ok: false, code: "invalid" });

    const crossSite = structuredClone(migrated.document);
    const crossExplorer = crossSite.windows.find((window) => window.id === explorer.id);
    if (!crossExplorer || crossExplorer.type !== "explorer") throw new Error("missing explorer");
    crossExplorer.content.shortcuts[2].target.siteId = "other";
    expect(parseSiteDocument(crossSite)).toMatchObject({ ok: false, code: "invalid" });
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
    expect(collectEntityReferrers(result.document, ref, "site-a")).toEqual([{ kind: "window", windowId: "ig-1" }, { kind: "post", postId: "post:ig-1:p1", field: "authorProfileId" }, { kind: "highlight", highlightId: "highlight:ig-1:h1" }]);
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
    const tooLong = "x".repeat(161);
    const nestedIds = [
      { value: { ...migrated.document, windows: migrated.document.windows.map((w) => w.type === "document" ? { ...w, content: { blocks: [{ id: tooLong, kind: "heading", text: "x" }] } } : w) }, path: "blocks" },
      { value: { ...migrated.document, windows: migrated.document.windows.map((w) => w.type === "gallery" ? { ...w, content: { ...w.content, images: [{ ...w.content.images[0], id: tooLong }] } } : w) }, path: "images" },
      { value: { ...migrated.document, windows: migrated.document.windows.map((w) => w.type === "links" ? { ...w, content: { ...w.content, links: [{ ...w.content.links[0], id: tooLong }] } } : w) }, path: "links" },
      { value: { ...migrated.document, windows: migrated.document.windows.map((w) => w.type === "about" ? { ...w, content: { ...w.content, fields: [{ ...w.content.fields[0], id: tooLong }] } } : w) }, path: "fields" },
    ];
    for (const item of nestedIds) expect(parseSiteDocument(item.value)).toMatchObject({ ok: false, code: "invalid" });
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

  it("bounds generated IDs for very long legacy window/post IDs deterministically", () => {
    const input = fixture();
    const longWindowId = "window-" + "w".repeat(500);
    const longPostId = "post-" + "p".repeat(500);
    input.windows = input.windows.map((window) => window.id === "ig-1" && window.type === "instagram" ? { ...window, id: longWindowId, content: { ...window.content, images: [{ ...window.content.images[0], id: longPostId }] } } : window);
    const first = migrateSiteDocumentV2(input, { siteId: "site-a" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.document.windows.every((window) => window.id.length <= 160)).toBe(true);
    expect(first.document.entities.profiles.every((entity) => entity.id.length <= 160)).toBe(true);
    expect(first.document.entities.posts.every((entity) => entity.id.length <= 160)).toBe(true);
    expect(parseSiteDocument(first.document)).toMatchObject({ ok: true, version: 2 });
    expect(migrateSiteDocumentV2(input, { siteId: "site-a" })).toEqual(first);
  });

  it("rewrites links to bounded overlong non-Instagram window IDs", () => {
    const input = fixture();
    // v1 LinkItem.windowId is capped at 120; exercise the upper boundary while
    // keeping the source document valid under the unchanged v1 contract.
    const longTarget = "target-" + "t".repeat(113);
    input.windows = input.windows.map((window) => window.id === "gallery-1" ? { ...window, id: longTarget } : window);
    const links = input.windows.find((window) => window.id === "links-1");
    if (!links || links.type !== "links") throw new Error("links fixture missing");
    links.content.links[0].windowId = longTarget;
    const migrated = migrateSiteDocumentV2(input, { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const target = migrated.document.windows.find((window) => window.title === "Gallery");
    const linkWindow = migrated.document.windows.find((window) => window.id === "links-1");
    expect(target?.id.length).toBeLessThanOrEqual(160);
    expect(linkWindow && linkWindow.type === "links" ? linkWindow.content.links[0].windowId : "").toBe(target?.id);
    expect(resolveEntityRef(migrated.document, { siteId: "site-a", id: target!.id, kind: "window" }, "site-a")).toMatchObject({ ok: true });
  });

  it("validates v2 without injecting defaults or changing object identity", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const v2 = structuredClone(migrated.document) as typeof migrated.document;
    delete v2.mobileColumns;
    delete v2.entities.profiles[0].avatarUrl;
    delete v2.entities.profiles[0].highlights;
    delete v2.entities.posts[0].comments;
    delete v2.entities.posts[0].extra;
    const result = migrateSiteDocumentV2(v2, { siteId: "site-a" });
    expect(result).toMatchObject({ ok: true, version: 2 });
    if (result.ok) {
      expect(result.document).toBe(v2);
      expect(result.document).toEqual(v2);
    }
  });

  it("deterministically disambiguates duplicate legacy handles without merging profiles", () => {
    const input = fixture();
    const first = input.windows.find((window) => window.id === "ig-1");
    if (!first || first.type !== "instagram") throw new Error("fixture missing Instagram window");
    input.windows.push({ ...first, id: "ig-2", title: "Instagram 2", layout: { ...first.layout, desktop: { ...first.layout.desktop, z: 9 }, mobile: { order: 9 } }, content: { ...first.content, profile: { ...first.content.profile, username: "ALICE", name: "愛麗絲" } } });
    const migrated = migrateSiteDocumentV2(input, { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    expect(migrated.document.entities.profiles.map((profile) => profile.handle)).toEqual(["alice", "alice-2"]);
    expect(migrated.document.entities.profiles[1]).toMatchObject({ displayName: "愛麗絲", legacyUsernameLabel: "ALICE" });
    expect(migrateSiteDocumentV2(migrated.document, { siteId: "site-a" })).toEqual(migrated);
    expect(migrated.document.entities.posts).toHaveLength(2);
  });

  it("supports immutable profile CRUD and blocks or retargets deletion", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const original = structuredClone(migrated.document);
    const sourceId = migrated.document.entities.profiles[0].id;
    const created = createProfile(migrated.document, { handle: "中文角色", displayName: "新角色", name: "新角色", avatar: null }, { siteId: "site-a", id: "profile:new" });
    expect(created.ok).toBe(false);
    const validCreated = createProfile(migrated.document, { handle: "new-character", displayName: "新角色", name: "新角色", avatar: null }, { siteId: "site-a", id: "profile:new" });
    expect(validCreated.ok).toBe(true);
    if (!validCreated.ok) return;
    const duplicated = duplicateProfile(validCreated.document, sourceId, { siteId: "site-a", id: "profile:copy", handle: "alice-copy" });
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    const updated = updateProfile(duplicated.document, "profile:copy", { displayName: "複製角色", pronouns: "they/them" }, { siteId: "site-a" });
    expect(updated.ok).toBe(true);
    const references = inspectProfileReferences(migrated.document, sourceId, "site-a");
    expect(references.windowIds).toEqual(["ig-1"]);
    expect(references.postIds).toEqual(["post:ig-1:p1"]);
    const blocked = deleteOrRetargetProfile(migrated.document, sourceId, { siteId: "site-a" });
    expect(blocked).toMatchObject({ ok: false, diagnostics: [{ code: "delete_blocked" }] });
    const retargeted = deleteOrRetargetProfile(validCreated.document, sourceId, { siteId: "site-a", retargetProfileId: "profile:new" });
    expect(retargeted.ok).toBe(true);
    if (retargeted.ok) {
      expect(retargeted.document.entities.profiles.some((profile) => profile.id === sourceId)).toBe(false);
      expect(retargeted.document.windows.find((window) => window.id === "ig-1")).toMatchObject({ content: { profileRef: { id: "profile:new" } } });
      expect(retargeted.document.entities.posts[0].authorProfileId).toBe("profile:new");
    }
    expect(migrated.document).toEqual(original);
  });

  it("enforces site scope, handle uniqueness, and relation-free duplication", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const source = migrated.document.entities.profiles[0];
    const crossSite = createProfile(migrated.document, { handle: "other-site", displayName: "Other", name: "Other", avatar: null }, { siteId: "site-b", id: "profile:other" });
    expect(crossSite).toMatchObject({ ok: false, diagnostics: [{ code: "cross_site" }] });
    const seeded = createProfile(migrated.document, { handle: "another", displayName: "Another", name: "Another", avatar: null }, { siteId: "site-a", id: "profile:another" });
    expect(seeded.ok).toBe(true);
    if (!seeded.ok) return;
    const duplicateUpdate = updateProfile(seeded.document, "profile:another", { handle: source.handle!.toUpperCase() }, { siteId: "site-a" });
    expect(duplicateUpdate).toMatchObject({ ok: false, diagnostics: [{ code: "duplicate_handle" }] });
    const copied = duplicateProfile(migrated.document, source.id, { siteId: "site-a", id: "profile:copy", handle: "alice-copy" });
    expect(copied.ok).toBe(true);
    if (!copied.ok) return;
    expect(inspectProfileReferences(copied.document, "profile:copy", "site-a")).toMatchObject({ windowIds: [], postIds: [] });
    const unreferenced = deleteOrRetargetProfile(copied.document, "profile:copy", { siteId: "site-a" });
    expect(unreferenced.ok).toBe(true);
    if (unreferenced.ok) expect(parseSiteDocument(unreferenced.document)).toMatchObject({ ok: true, version: 2 });
  });

  it("returns typed diagnostics instead of throwing for v1-valid overlong nested IDs", () => {
    const input = fixture();
    const links = input.windows.find((window) => window.type === "links");
    if (!links || links.type !== "links") throw new Error("fixture missing links window");
    links.content.links[0].id = "link-" + "x".repeat(300);
    expect(() => migrateSiteDocumentV2(input, { siteId: "site-a" })).not.toThrow();
    expect(migrateSiteDocumentV2(input, { siteId: "site-a" })).toMatchObject({ ok: false, code: "invalid", diagnostics: expect.arrayContaining([expect.objectContaining({ path: expect.arrayContaining(["links"]) })]) });
  });

  it("normalizes authored handles while preserving raw-v2 validation identity and isolating returned profiles", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const raw = structuredClone(migrated.document);
    delete raw.mobileColumns;
    const validated = migrateSiteDocumentV2(raw, { siteId: "site-a" });
    expect(validated.ok && validated.document).toBe(raw);
    const created = createProfile(migrated.document, { handle: "  New-OC  ", displayName: "New OC", name: "New OC", avatar: null }, { siteId: "site-a", id: "profile:new" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.profile.handle).toBe("new-oc");
    created.profile.displayName = "changed result only";
    expect(created.document.entities.profiles.find((profile) => profile.id === "profile:new")?.displayName).toBe("New OC");
    const updated = updateProfile(created.document, "profile:new", { handle: "  RENAMED  " }, { siteId: "site-a" });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      updated.profile.handle = "mutated result only";
      expect(updated.document.entities.profiles.find((profile) => profile.id === "profile:new")?.handle).toBe("renamed");
    }
  });

  it("loads editor v1 drafts as v2 and adapts v2 Instagram entities at render boundaries", () => {
    const v1 = fixture();
    const loaded = loadVersionedSiteDocument(v1, { siteId: "site-a", migrateV1: true });
    expect(loaded).toMatchObject({ ok: true, version: 2, migrated: true });
    if (!loaded.ok || loaded.version !== 2) return;
    const legacy = projectV2ToLegacyDocument(loaded.document);
    expect(legacy.ok).toBe(true);
    if (legacy.ok) {
      const instagram = legacy.document.windows.find((window) => window.type === "instagram");
      expect(instagram).toMatchObject({ content: { profile: { username: "alice", name: "Alice" }, images: [{ id: "post:ig-1:p1" }] } });
    }
    const publicLoad = loadVersionedSiteDocument(loaded.document);
    expect(publicLoad).toMatchObject({ ok: true, version: 2, migrated: false });
    const legacyEdited = structuredClone(legacy.ok ? legacy.document : v1);
    const instagram = legacyEdited.windows.find((window) => window.type === "instagram");
    if (instagram?.type === "instagram") instagram.content.profile.name = "Edited together";
    const merged = mergeLegacyDocumentIntoV2(loaded.document, legacyEdited, { siteId: "site-a" });
    expect(merged.entities.profiles.find((profile) => profile.id === "profile:ig-1")?.name).toBe("Edited together");
  });

  it("migrates canonical media and legacy highlights deterministically", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(result.ok && result.version === 2).toBe(true);
    if (!result.ok || result.version !== 2) return;
    expect(result.document.entities.posts[0]?.media).toHaveLength(2);
    expect(result.document.entities.posts[0]).toMatchObject({ worldDateLabel: "", taggedProfileIds: [], collectionIds: [], pinned: false });
    expect(result.document.entities.highlights).toHaveLength(1);
    expect(result.document.entities.highlights[0]?.frames).toHaveLength(1);
    const projected = projectV2ToLegacyDocument(result.document);
    expect(projected.ok).toBe(true);
    if (projected.ok) expect(projected.document.windows.find((window) => window.type === "instagram")?.content.images[0]?.extra).toHaveLength(1);
  });

  it("preserves rich canonical fields when the legacy editor changes supported fields", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    if (!result.ok || result.version !== 2) throw new Error("fixture migration failed");
    const post = result.document.entities.posts[0];
    const highlight = result.document.entities.highlights[0];
    const profile = result.document.entities.profiles[0];
    if (!post || !highlight || !profile) throw new Error("rich fixture missing");
    post.worldDateLabel = "雪國曆 12 月";
    post.taggedProfileIds = [profile.id];
    post.collectionIds = ["collection:works"];
    post.pinned = true;
    post.createdAt = "2026-10-16T00:00:00.000Z";
    post.updatedAt = "2026-10-16T01:00:00.000Z";
    post.media[0] = { ...post.media[0], alt: "portrait", crop: { x: 12, y: 8, zoom: 2 }, aspectRatio: 0.75 };
    result.document.entities.collections.push({ kind: "collection", id: "collection:works", siteId: "site-a", ownerProfileId: profile.id, visibility: "draft", title: "Works", description: "", postIds: [post.id] });
    highlight.visibility = "draft";
    highlight.coverAlt = "cover alt";
    highlight.coverCrop = { x: 1, y: 2, zoom: 1.5 };
    highlight.frames.push({ id: "frame:two", src: "https://example.com/frame-two.jpg", srcUrl: "", alt: "second", crop: { x: 2, y: 3, zoom: 2 }, text: "second frame" });

    const legacy = projectV2ToLegacyDocument(result.document);
    if (!legacy.ok) throw new Error("legacy projection failed");
    const window = legacy.document.windows.find((item) => item.type === "instagram");
    if (!window || window.type !== "instagram") throw new Error("Instagram projection missing");
    window.content.images[0].caption = "edited caption";
    window.content.profile.bio = "edited bio";
    const merged = mergeLegacyDocumentIntoV2(result.document, legacy.document, { siteId: "site-a" });
    const mergedPost = merged.entities.posts.find((item) => item.id === post.id);
    const mergedHighlight = merged.entities.highlights?.find((item) => item.id === highlight.id);
    expect(mergedPost).toMatchObject({ caption: "edited caption", worldDateLabel: "雪國曆 12 月", taggedProfileIds: [profile.id], collectionIds: ["collection:works"], pinned: true, createdAt: post.createdAt, updatedAt: post.updatedAt });
    expect(mergedPost?.media[0]).toMatchObject({ alt: "portrait", crop: { x: 12, y: 8, zoom: 2 }, aspectRatio: 0.75 });
    expect(mergedHighlight).toMatchObject({ visibility: "draft", coverAlt: "cover alt", coverCrop: { x: 1, y: 2, zoom: 1.5 } });
    expect(mergedHighlight?.frames).toHaveLength(2);
    expect(mergedHighlight?.frames[1]).toMatchObject({ id: "frame:two", alt: "second", text: "second frame", crop: { x: 2, y: 3, zoom: 2 } });
  });

  it("prunes collection post references when the legacy editor deletes a post", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    if (!result.ok || result.version !== 2) throw new Error("fixture migration failed");
    const first = result.document.entities.posts[0];
    const profile = result.document.entities.profiles[0];
    if (!first || !profile) throw new Error("fixture missing");
    const second = structuredClone(first);
    second.id = "post:ig-1:p2";
    second.title = "Second";
    second.collectionIds = ["collection:works"];
    first.collectionIds = ["collection:works"];
    result.document.entities.posts.push(second);
    result.document.entities.collections.push({ kind: "collection", id: "collection:works", siteId: "site-a", ownerProfileId: profile.id, visibility: "published", title: "Works", description: "", postIds: [first.id, second.id] });

    const legacy = projectV2ToLegacyDocument(result.document);
    if (!legacy.ok) throw new Error("legacy projection failed");
    const window = legacy.document.windows.find((item) => item.type === "instagram");
    if (!window || window.type !== "instagram") throw new Error("Instagram projection missing");
    window.content.images = window.content.images.filter((post) => post.id !== first.id);
    const merged = mergeLegacyDocumentIntoV2(result.document, legacy.document, { siteId: "site-a" });
    expect(parseSiteDocument(merged)).toMatchObject({ ok: true, version: 2 });
    expect(merged.entities.posts.some((post) => post.id === first.id)).toBe(false);
    expect(merged.entities.collections?.find((collection) => collection.id === "collection:works")?.postIds).toEqual([second.id]);
    expect(merged.entities.posts.find((post) => post.id === second.id)?.collectionIds).toEqual(["collection:works"]);
  });

  it("rejects missing content owners and collection/tag references", () => {
    const result = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    if (!result.ok || result.version !== 2) throw new Error("fixture migration failed");
    const post = result.document.entities.posts[0];
    if (!post) throw new Error("post fixture missing");
    post.taggedProfileIds = ["missing"];
    result.document.entities.collections.push({ kind: "collection", id: "collection:missing", siteId: "site-a", ownerProfileId: "missing", visibility: "published", title: "bad", description: "", postIds: [post.id] });
    expect(parseSiteDocument(result.document)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("reconciles legacy window CRUD and shared Instagram edits by stable IDs", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const rendered = projectV2ToLegacyDocument(migrated.document);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const edited = structuredClone(rendered.document);
    edited.siteName = "Updated desktop";
    edited.mobileColumns = 3;
    edited.theme = { ...edited.theme, wall: "#123456" };
    edited.windows = edited.windows.filter((window) => window.id !== "gallery-1");
    const documentWindow = edited.windows.find((window) => window.id === "doc-1");
    if (!documentWindow) throw new Error("fixture missing document window");
    edited.windows.push({ ...documentWindow, id: "doc-copy", title: "Doc copy" });
    const instagram = edited.windows.find((window) => window.id === "ig-1");
    if (!instagram || instagram.type !== "instagram") throw new Error("fixture missing Instagram window");
    edited.windows.push({ ...instagram, id: "ig-copy", title: "Instagram copy", layout: { ...instagram.layout, desktop: { ...instagram.layout.desktop, z: 8 }, mobile: { order: 8 } } });
    // The original window is edited while the duplicated legacy projection is
    // stale. The first stable window ID wins, so a later stale copy cannot
    // roll the shared profile back.
    instagram.content.profile.name = "Edited shared OC";
    instagram.content.profile.username = "renamed-oc";
    instagram.content.skin = "modern";
    instagram.title = "Updated Instagram";
    const merged = mergeLegacyDocumentIntoV2(migrated.document, edited, { siteId: "site-a" });
    expect(merged.windows.map((window) => window.id)).toEqual(expect.arrayContaining(["doc-1", "doc-copy", "ig-1", "ig-copy"]));
    expect(merged.windows.some((window) => window.id === "gallery-1")).toBe(false);
    expect(merged).toMatchObject({ siteName: "Updated desktop", mobileColumns: 3, theme: { wall: "#123456" } });
    const igRefs = merged.windows.filter((window) => window.type === "instagram").map((window) => window.content.profileRef.id);
    expect(new Set(igRefs).size).toBe(1);
    expect(merged.entities.profiles.find((profile) => profile.id === igRefs[0])?.displayName).toBe("Edited shared OC");
    expect(merged.entities.profiles.find((profile) => profile.id === igRefs[0])?.name).toBe("Edited shared OC");
    expect(merged.entities.profiles.find((profile) => profile.id === igRefs[0])?.handle).toBe("renamed-oc");
    expect(merged.windows.find((window) => window.id === "ig-1")).toMatchObject({ title: "Updated Instagram", content: { skin: "modern" } });
    expect(parseSiteDocument(merged)).toMatchObject({ ok: true, version: 2 });
    const rerendered = projectV2ToLegacyDocument(merged);
    expect(rerendered.ok).toBe(true);
    if (rerendered.ok) {
      expect(rerendered.document.windows.filter((window) => window.type === "instagram").map((window) => ({ username: window.content.profile.username, name: window.content.profile.name }))).toEqual([
        { username: "renamed-oc", name: "Edited shared OC" },
        { username: "renamed-oc", name: "Edited shared OC" },
      ]);
    }
    const deletedCopy = mergeLegacyDocumentIntoV2(migrated.document, {
      ...edited,
      windows: edited.windows.filter((window) => window.id !== "ig-copy"),
    }, { siteId: "site-a" });
    expect(deletedCopy.windows.map((window) => window.id)).not.toContain("ig-copy");
    expect(deletedCopy.windows.map((window) => window.id)).toContain("ig-1");
    expect(deletedCopy.entities.profiles.map((profile) => profile.id)).toContain("profile:ig-1");
  });

  it("uses the explicit site scope when adding the first Instagram window", () => {
    const migrated = migrateSiteDocumentV2(fixture(), { siteId: "site-a" });
    expect(migrated.ok).toBe(true);
    if (!migrated.ok) return;
    const rendered = projectV2ToLegacyDocument(migrated.document);
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const instagram = rendered.document.windows.find((window) => window.type === "instagram");
    if (!instagram) throw new Error("fixture missing Instagram window");
    const empty = { ...migrated.document, windows: [], entities: { profiles: [], posts: [] } };
    const merged = mergeLegacyDocumentIntoV2(empty, { ...rendered.document, windows: [instagram] }, { siteId: "site-a" });
    expect(merged.entities.profiles[0]?.siteId).toBe("site-a");
    expect(parseSiteDocument(merged)).toMatchObject({ ok: true, version: 2 });
  });
});
