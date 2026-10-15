import { describe, expect, it } from "vitest";
import { collectAssetReferences, createAssetReference, parseAssetReference, replaceAssetReferences } from "../src/asset-reference";
import { ImageUrlSchema, ThemeSchema } from "../src/site";

const id = "11111111-1111-4111-8111-111111111111";

describe("asset references", () => {
  it("creates and parses strict UUID references", () => {
    const ref = createAssetReference(id);
    expect(ref).toBe(`retro-asset:${id}`);
    expect(parseAssetReference(ref)).toBe(id);
    expect(parseAssetReference("retro-asset:11111111-1111-4111-8111-11111111111x")).toBeNull();
    expect(parseAssetReference("retro-asset:https://example.com")).toBeNull();
  });

  it("collects and replaces exact scalar strings without mutating", () => {
    const input = { src: `retro-asset:${id}`, nested: [`retro-asset:${id}`, { text: "retro-asset:other" }] };
    const copy = structuredClone(input);
    const result = replaceAssetReferences(input, new Map([[id, "https://cdn.test/a.png"]]));
    expect(collectAssetReferences(input)).toEqual([id]);
    expect(result).toEqual({ src: "https://cdn.test/a.png", nested: ["https://cdn.test/a.png", { text: "retro-asset:other" }] });
    expect(input).toEqual(copy);
  });

  it("allows references in image fields but rejects other schemes", () => {
    expect(ImageUrlSchema.safeParse(`retro-asset:${id}`).success).toBe(true);
    expect(ImageUrlSchema.safeParse("data:image/png;base64,abc").success).toBe(false);
    expect(ThemeSchema.shape.wallImage.safeParse("ftp://example.com/wall.png").success).toBe(false);
    expect(ThemeSchema.shape.wallImage.safeParse("javascript:alert(1)").success).toBe(false);
    expect(ThemeSchema.shape.wallImage.safeParse("https://example.com/wall.png").success).toBe(true);
    expect(ThemeSchema.safeParse({ id: "x", name: "x", wall: "#000000", pattern: "image", patternColor: "#ffffff", wallImage: `retro-asset:${id}`, face: "#000000", light: "#ffffff", shadow: "#888888", dark: "#000000", text: "#000000", titleFrom: "#000000", titleTo: "#000000", taskbar: "#ffffff", accent: "#000000", font: "noto", iconStyle: "classic" }).success).toBe(true);
  });
});
