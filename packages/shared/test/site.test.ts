import { describe, expect, it } from "vitest";
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
