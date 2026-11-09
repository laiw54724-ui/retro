import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { SiteDocumentSchema } from "../src/site";
import { createDemoDocument, DEMO_EXAMPLES, DEMO_PREVIEW_IMAGES } from "../src/demo";

describe("fictional sample media", () => {
  it("does not retain the unavailable forest image or its source link", () => {
    expect(JSON.stringify(DEMO_PREVIEW_IMAGES)).not.toContain("Forest_pixel_art");
    expect(JSON.stringify(createDemoDocument("ig"))).not.toContain("Forest_pixel_art");
    expect(DEMO_PREVIEW_IMAGES.ig[0]).toContain("house.png");
  });
  it("gives all four landing examples distinct images instead of shared placeholders", () => {
    const thumbnails = DEMO_EXAMPLES.flatMap(({ kind }) => DEMO_PREVIEW_IMAGES[kind]);
    expect(thumbnails).toHaveLength(8);
    expect(new Set(thumbnails).size).toBe(8);
    for (const url of thumbnails) {
      expect(url).toMatch(/^\/demo-assets\/commons\//);
      expect(existsSync(new URL(`../../../apps/web/public${url}`, import.meta.url))).toBe(true);
    }
  });

  it("resolves demo assets on the current deployment origin without relaxing document URL validation", () => {
    vi.stubGlobal("location", { origin: "https://preview.retro.test" });
    try {
      for (const { kind } of DEMO_EXAMPLES) {
        const document = createDemoDocument(kind);
        expect(JSON.stringify(document)).toContain("https://preview.retro.test/demo-assets/commons/");
        expect(JSON.stringify(document)).not.toContain("upload.wikimedia.org");
        expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  for (const { kind } of DEMO_EXAMPLES) {
    it(`provides visible media and no fake outbound links for ${kind}`, () => {
      const document = createDemoDocument(kind);
      const images = document.windows.flatMap((window) => {
        switch (window.type) {
          case "about": return [window.content.avatar];
          case "instagram": return [
            window.content.profile.avatar,
            ...window.content.profile.highlights.map((h) => h.src),
            ...window.content.images.map((post) => post.src)
          ];
          case "gallery": return window.content.images.map((image) => image.src);
          default: return [];
        }
      });
      expect(images.length).toBeGreaterThan(0);
      expect(images.every((url) => typeof url === "string" && url.startsWith("http://localhost/demo-assets/commons/"))).toBe(true);

      expect(SiteDocumentSchema.safeParse(document).success).toBe(true);
      const json = JSON.stringify(document);
      expect(json).not.toMatch(/example\.com|mailto:[^"]+@example\.com|https:\/\/(?:www\.)?(?:instagram|behance)\.com\/|https:\/\/x\.com\//);
      expect(document.windows.filter((window) => window.type === "about").every((window) => window.content.socials.length === 0)).toBe(true);
    });
  }
});
