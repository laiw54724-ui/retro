import { describe, expect, it } from "vitest";
import { parseSiteDocument } from "../src/site-versioning";

describe("v2 image fields", () => {
  it("accepts a stable asset reference for an about avatar", () => {
    const result = parseSiteDocument({
      schemaVersion: 2,
      siteName: "Demo",
      theme: { id: "classic98", name: "Classic", wall: "#008080", pattern: "none", patternColor: "#0a8f8f", face: "#c0c0c0", light: "#dfdfdf", shadow: "#808080", dark: "#0a0a0a", text: "#111111", titleFrom: "#000080", titleTo: "#1084d0", taskbar: "#c0c0c0", accent: "#000080", font: "noto", iconStyle: "classic" },
      windows: [{ id: "about", title: "About", icon: "about", layout: { desktop: { x: 0, y: 0, w: 300, h: 200, z: 1 }, mobile: { order: 0 } }, defaultOpen: true, type: "about", content: { avatar: "retro-asset:11111111-1111-4111-8111-111111111111", nickname: "A", bio: "", fields: [], socials: [] } }],
      mobileColumns: 4,
      entities: { profiles: [], posts: [] }
    });
    expect(result.ok).toBe(true);
  });
});
