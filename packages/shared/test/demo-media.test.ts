import { describe, expect, it } from "vitest";
import { createDemoDocument, DEMO_EXAMPLES, DEMO_PREVIEW_IMAGES } from "../src/demo";

describe("fictional sample media", () => {
  it("gives all four landing examples distinct images instead of shared placeholders", () => {
    const thumbnails = DEMO_EXAMPLES.flatMap(({ kind }) => DEMO_PREVIEW_IMAGES[kind]);
    expect(thumbnails).toHaveLength(8);
    expect(new Set(thumbnails).size).toBe(8);
    for (const url of thumbnails) expect(url).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
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
      expect(images.every((url) => typeof url === "string" && url.startsWith("https://upload.wikimedia.org/wikipedia/commons/"))).toBe(true);

      const json = JSON.stringify(document);
      expect(json).not.toMatch(/example\.com|mailto:[^"]+@example\.com|https:\/\/(?:www\.)?(?:instagram|behance)\.com\/|https:\/\/x\.com\//);
      expect(document.windows.filter((window) => window.type === "about").every((window) => window.content.socials.length === 0)).toBe(true);
    });
  }
});
