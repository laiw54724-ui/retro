import { describe, expect, it } from "vitest";
import { normalizeImageUrl } from "../src/image-url";
import { createStarterDocument, makeWindow, SiteDocumentSchema, THEME_PRESETS, UsernameSchema } from "../src/site";

describe("site schema security boundaries", () => {
  it("rejects script URLs in user-created links", () => {
    const document = createStarterDocument("Test");
    const links = document.windows.find((window) => window.type === "links");
    expect(links?.type).toBe("links");
    if (!links || links.type !== "links") throw new Error("starter links window missing");
    links.content.links[0].url = "javascript:alert(1)";
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("accepts https and mailto links", () => {
    const document = createStarterDocument("Test");
    const links = document.windows.find((window) => window.type === "links");
    if (!links || links.type !== "links") throw new Error("starter links window missing");
    links.content.links[0].url = "mailto:hello@example.com";
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
    links.content.links[0].url = "https://example.com";
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("accepts ordered HTTPS music tracks and rejects unsafe or inconsistent sources", () => {
    const document = createStarterDocument("Music", "classic98", "blank");
    const music = makeWindow("music");
    if (music.type !== "music") throw new Error("music factory mismatch");
    music.content.tracks = [{ id: "track-1", title: "Theme", artist: "OC", cover: null, coverUrl: "", source: { kind: "audioUrl", url: "https://media.example.com/theme.mp3" }, lyrics: "", rightsNote: "Original work" }];
    music.content.playlist.trackIds = ["track-1"];
    document.windows = [music];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);

    music.content.tracks[0].source = { kind: "uploadedAudio", asset: "retro-asset:11111111-1111-4111-8111-111111111111" };
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
    music.content.tracks[0].source = { kind: "uploadedAudio", asset: "retro-asset:not-a-uuid" };
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);

    music.content.tracks[0].source = { kind: "audioUrl", url: "http://media.example.com/theme.mp3" };
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    music.content.tracks[0].source = { kind: "externalLink", url: "mailto:music@example.com" };
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    music.content.tracks[0].source = { kind: "externalLink", url: "https://example.com/track" };
    music.content.playlist.trackIds = ["missing"];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    music.content.playlist.trackIds = ["track-1", "track-1"];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("validates bounded moodboard elements and protected image references", () => {
    const document = createStarterDocument("Board", "classic98", "blank");
    const board = makeWindow("moodboard");
    if (board.type !== "moodboard") throw new Error("moodboard factory mismatch");
    board.content.elements = [
      { id: "text", kind: "text", x: 10, y: 10, width: 200, height: 80, zOrder: 1, locked: false, content: "中文文字", color: "#111111", fontSize: 24, align: "left" },
      { id: "image", kind: "image", x: 20, y: 100, width: 240, height: 180, zOrder: 2, locked: false, src: "retro-asset:11111111-1111-4111-8111-111111111111", srcUrl: "", alt: "原創角色" }
    ];
    document.windows = [board];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
    board.content.width = 5000;
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    board.content.width = 800;
    board.content.elements = Array.from({ length: 101 }, (_, index) => ({ id: `color-${index}`, kind: "color" as const, x: 0, y: 0, width: 24, height: 24, zOrder: index, locked: false, color: "#ffffff" }));
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("validates Explorer hierarchy, duplicate shortcuts, cycles and depth", () => {
    const document = createStarterDocument("World", "classic98", "blank");
    const explorer = makeWindow("explorer");
    const target = makeWindow("document", 1);
    if (explorer.type !== "explorer") throw new Error("explorer factory mismatch");
    explorer.content.folders = [
      { id: "world", parentId: null, name: "世界觀", order: 0, visibility: "published" },
      { id: "characters", parentId: "world", name: "角色", order: 0, visibility: "published" },
      { id: "heroes", parentId: "characters", name: "主角", order: 0, visibility: "draft" }
    ];
    explorer.content.shortcuts = [
      { id: "shortcut-a", parentId: "characters", label: "角色 A", order: 0, visibility: "published", target: { siteId: "site-a", id: target.id, kind: "window" } },
      { id: "shortcut-b", parentId: "heroes", label: "角色 A 備份捷徑", order: 0, visibility: "draft", target: { siteId: "site-a", id: target.id, kind: "window" } }
    ];
    document.windows = [target, explorer];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);

    explorer.content.folders[0].parentId = "heroes";
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    explorer.content.folders[0].parentId = null;
    explorer.content.folders = Array.from({ length: 9 }, (_, index) => ({ id: `level-${index}`, parentId: index ? `level-${index - 1}` : null, name: `Level ${index}`, order: index, visibility: "published" as const }));
    explorer.content.shortcuts = [];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("accepts the documented Explorer boundary and rejects the 501st folder", () => {
    const document = createStarterDocument("Large World", "classic98", "blank");
    const explorer = makeWindow("explorer");
    if (explorer.type !== "explorer") throw new Error("explorer factory mismatch");
    explorer.content.folders = Array.from({ length: 500 }, (_, index) => ({ id: `folder-${index}`, parentId: null, name: `Folder ${index}`, order: index, visibility: "published" as const }));
    document.windows = [explorer];
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
    explorer.content.folders.push({ id: "folder-500", parentId: null, name: "One too many", order: 500, visibility: "published" });
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("bounds serverless desktop toys and keeps their links safe", () => {
    const document = createStarterDocument("Toys", "classic98", "blank");
    const minesweeper = makeWindow("minesweeper");
    const character = makeWindow("character-dialog", 1);
    if (minesweeper.type !== "minesweeper" || character.type !== "character-dialog") throw new Error("toy factory mismatch");
    document.windows = [minesweeper, character];
    expect(minesweeper.content).toEqual({ rows: 8, columns: 8, mines: 10 });
    expect(character.content.autoShow).toBe(false);
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);

    minesweeper.content.mines = minesweeper.content.rows * minesweeper.content.columns;
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
    minesweeper.content.mines = 10;
    character.content.linkUrl = "javascript:alert(1)";
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("keeps guestbook configuration bounded and disabled by default", () => {
    const document = createStarterDocument("Guestbook", "classic98", "blank");
    const guestbook = makeWindow("guestbook");
    if (guestbook.type !== "guestbook") throw new Error("guestbook factory mismatch");
    document.windows = [guestbook];
    expect(guestbook.content.enabled).toBe(false);
    expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
    guestbook.content.intro = "x".repeat(1001);
    expect(SiteDocumentSchema.safeParse(document).success).toBe(false);
  });

  it("rejects reserved usernames and normalizes safe ones", () => {
    expect(UsernameSchema.safeParse("admin").success).toBe(false);
    expect(UsernameSchema.parse("my-desk")).toBe("my-desk");
  });

  it("creates stable mobile and desktop icon layout defaults", () => {
    const document = createStarterDocument("Test");
    expect(document.windows[0].layout.desktop.iconX).toBeTypeOf("number");
    expect(document.windows[0].layout.desktop.iconY).toBeTypeOf("number");
    expect(document.windows[0].layout.mobile.order).toBe(0);
  });
});


describe("normalizeImageUrl", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const thumb = `https://drive.google.com/thumbnail?id=${id}&sz=w2000`;

  it("converts Google Drive share links", () => {
    for (const link of [
      `https://drive.google.com/file/d/${id}/view?usp=sharing`,
      `https://drive.google.com/open?id=${id}`,
      `https://drive.google.com/uc?export=view&id=${id}`,
      `https://drive.google.com/thumbnail?id=${id}`
    ]) {
      expect(normalizeImageUrl(link)).toEqual({ ok: true, url: thumb, source: "google-drive" });
    }
  });

  it("rejects Drive folders and unrecognised Drive links", () => {
    expect(normalizeImageUrl("https://drive.google.com/drive/folders/" + id).ok).toBe(false);
    expect(normalizeImageUrl("https://drive.google.com/").ok).toBe(false);
  });

  it("accepts plain https images and rejects unsafe schemes", () => {
    expect(normalizeImageUrl("https://example.com/a.png")).toMatchObject({ ok: true, source: "direct" });
    for (const bad of ["http://example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "ftp://x/y.png", "not a url", ""]) {
      expect(normalizeImageUrl(bad).ok).toBe(false);
    }
  });
});

import { normalizeDocument } from "../src/site";

describe("v2 schema extensions", () => {
  it("fills defaults for documents saved before v2", () => {
    const doc = createStarterDocument("Old", "classic98", "instagram");
    const ig = doc.windows.find((w) => w.type === "instagram")!;
    if (ig.type !== "instagram") throw new Error("missing ig");
    const legacy = JSON.parse(JSON.stringify(doc));
    const profile = legacy.windows.find((w: { type: string }) => w.type === "instagram").content.profile;
    delete legacy.windows.find((w: { type: string }) => w.type === "instagram").content.skin;
    for (const key of ["avatarUrl", "linkLabel", "linkUrl", "dmUrl", "verified", "showCounts", "showHighlights", "showFollowedBy", "showLikes", "allowLikes", "allowComments", "highlights"]) delete profile[key];
    const normalized = normalizeDocument(legacy);
    const out = normalized.windows.find((w) => w.type === "instagram");
    if (!out || out.type !== "instagram") throw new Error("missing ig");
    expect(out.content.profile).toMatchObject({ allowLikes: true, allowComments: true, showCounts: true, verified: false, dmUrl: "", highlights: [] });
    expect(out.content.skin).toBe("win98");
  });

  it("supports optional per-window title appearance and defaults new Instagram windows to Win98", () => {
    const doc = createStarterDocument("T", "classic98", "instagram");
    const ig = doc.windows.find((window) => window.type === "instagram");
    if (!ig || ig.type !== "instagram") throw new Error("missing ig");
    expect(ig.content.skin).toBe("win98");
    expect(ig.appearance).toBeUndefined();
    ig.appearance = { titleFrom: "#112233", titleTo: "#445566", titleGradient: false };
    expect(SiteDocumentSchema.parse(doc).windows[0].appearance).toEqual(ig.appearance);
  });

  it("rejects more than 9 carousel images and unsafe dmUrl", () => {
    const doc = createStarterDocument("T", "classic98", "instagram");
    const ig = doc.windows.find((w) => w.type === "instagram");
    if (!ig || ig.type !== "instagram") throw new Error("missing ig");
    const post = { id: "p", src: null, title: "", caption: "", srcUrl: "", href: "", location: "", date: "", likes: 0, comments: [], extra: Array.from({ length: 10 }, (_, i) => ({ id: "e" + i, src: null, srcUrl: "" })) };
    ig.content.images = [post];
    expect(SiteDocumentSchema.safeParse(doc).success).toBe(false);
    ig.content.images = [];
    ig.content.profile.dmUrl = "javascript:alert(1)";
    expect(SiteDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("offers the v2 theme presets and starter templates", () => {
    for (const id of ["classic98", "y2k", "pixel", "indigo", "whiteweb", "pink98", "lavender", "mint", "midnight"]) expect(THEME_PRESETS[id]).toBeDefined();
    expect(createStarterDocument("x", "indigo", "blank").windows).toHaveLength(0);
    expect(SiteDocumentSchema.safeParse(createStarterDocument("x", "midnight", "portfolio")).success).toBe(true);
    expect(SiteDocumentSchema.safeParse(createStarterDocument("x", "whiteweb", "oc")).success).toBe(true);
  });
});

import { buildPublishChecks, hasBlockingCheck } from "../src/publish-checks";
import { createDemoDocument, DEMO_EXAMPLES } from "../src/demo";

describe("publish checks", () => {
  it("blocks an empty desktop and untitled windows, only warns on advice", () => {
    expect(hasBlockingCheck(buildPublishChecks(createStarterDocument("x", "classic98", "blank")))).toBe(true);
    const doc = createStarterDocument("x", "classic98", "card");
    expect(hasBlockingCheck(buildPublishChecks(doc))).toBe(false);
    doc.windows[0].title = " ";
    expect(buildPublishChecks(doc).some((c) => c.level === "error" && c.text.includes("沒有標題"))).toBe(true);
  });

  it("warns about unset links and missing alt text", () => {
    const doc = createStarterDocument("x", "classic98", "card");
    const links = doc.windows.find((w) => w.type === "links")!;
    if (links.type !== "links") throw new Error("x");
    links.content.links[0].url = "https://";
    const checks = buildPublishChecks(doc);
    expect(checks.find((c) => c.text.includes("連結還沒設定"))?.level).toBe("warn");
    expect(hasBlockingCheck(checks)).toBe(false);
  });

  it("blocks publishing uploaded audio until a rights note is present", () => {
    const doc = createStarterDocument("x", "classic98", "card");
    const music = makeWindow("music");
    if (music.type !== "music") throw new Error("music factory mismatch");
    music.content.tracks = [{ id: "track", title: "Theme", artist: "OC", cover: null, coverUrl: "", source: { kind: "uploadedAudio", asset: "retro-asset:11111111-1111-4111-8111-111111111111" }, lyrics: "", rightsNote: "" }];
    music.content.playlist.trackIds = ["track"];
    doc.windows.push(music);
    expect(buildPublishChecks(doc).some((check) => check.level === "error" && check.text.includes("權利說明"))).toBe(true);
    music.content.tracks[0].rightsNote = "本人原創";
    expect(buildPublishChecks(doc).some((check) => check.level === "error" && check.text.includes("權利說明"))).toBe(false);
  });
});

describe("demo documents", () => {
  it("are valid for every example", () => {
    for (const example of DEMO_EXAMPLES) {
      const doc = createDemoDocument(example.kind);
      const parsed = SiteDocumentSchema.safeParse(doc);
      expect(parsed.success, example.kind + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues[0]))).toBe(true);
      expect(doc.windows.length).toBeGreaterThan(0);
      expect(hasBlockingCheck(buildPublishChecks(doc))).toBe(false);
    }
  });
});

describe("publish checks for music sources", () => {
  it("warns when a platform page is stored as a direct audio URL, but not for real audio files or embeds", () => {
    const doc = createStarterDocument("x", "classic98", "blank");
    const music = makeWindow("music");
    if (music.type !== "music") throw new Error("music factory mismatch");
    const track = (id: string, source: never) => ({ id, title: id, artist: "", cover: null, coverUrl: "", source, lyrics: "", rightsNote: "" });
    music.content.tracks = [
      track("yt", { kind: "audioUrl", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } as never),
      track("sp", { kind: "audioUrl", url: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA" } as never),
      track("ok", { kind: "audioUrl", url: "https://media.example.com/a.mp3" } as never),
      track("emb", { kind: "providerEmbed", provider: "spotify", resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA", originalUrl: "" } as never)
    ];
    music.content.playlist.trackIds = ["yt", "sp", "ok", "emb"];
    doc.windows.push(music);
    const checks = buildPublishChecks(doc);
    expect(checks.find((c) => c.text.includes("平台網頁"))).toMatchObject({ level: "warn", text: expect.stringContaining("2 首") });
    expect(hasBlockingCheck(checks)).toBe(false);
  });
});
