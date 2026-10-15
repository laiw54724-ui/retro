import { describe, expect, it } from "vitest";
import { normalizeImageUrl } from "../src/image-url";
import { createStarterDocument, SiteDocumentSchema, THEME_PRESETS, UsernameSchema } from "../src/site";

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
    for (const id of ["classic98", "indigo", "whiteweb", "pink98", "lavender", "mint", "midnight"]) expect(THEME_PRESETS[id]).toBeDefined();
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
