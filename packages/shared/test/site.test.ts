import { describe, expect, it } from "vitest";
import { normalizeImageUrl } from "../src/image-url";
import { createStarterDocument, SiteDocumentSchema, UsernameSchema } from "../src/site";

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
