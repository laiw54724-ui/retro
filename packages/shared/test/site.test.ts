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
    for (const key of ["avatarUrl", "linkLabel", "linkUrl", "dmUrl", "verified", "showCounts", "showHighlights", "showFollowedBy", "showLikes", "allowLikes", "allowComments", "highlights"]) delete profile[key];
    const normalized = normalizeDocument(legacy);
    const out = normalized.windows.find((w) => w.type === "instagram");
    if (!out || out.type !== "instagram") throw new Error("missing ig");
    expect(out.content.profile).toMatchObject({ allowLikes: true, allowComments: true, showCounts: true, verified: false, dmUrl: "", highlights: [] });
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
