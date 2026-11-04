import { describe, expect, it } from "vitest";
import { AssetReferenceSchema, collectAssetReferences, createAssetReference, normalizeAssetId, parseAssetReference, replaceAssetReferences } from "../src/asset-reference";
import { ImageUrlSchema, ThemeSchema } from "../src/site";

const id = "11111111-1111-4111-8111-111111111111";
const alphaId = "abcdefab-abcd-4abc-8abc-abcdefabcdef";

describe("asset references", () => {
  it.each([alphaId, alphaId.toUpperCase(), "AbCdEfAb-AbCd-4aBc-8aBc-AbCdEfAbCdEf"])("canonicalizes valid UUID identity %s without changing source documents", (inputId) => {
    const reference = `retro-asset:${inputId}`;
    expect(AssetReferenceSchema.safeParse(reference).success).toBe(true);
    expect(normalizeAssetId(inputId)).toBe(alphaId);
    expect(createAssetReference(inputId)).toBe(`retro-asset:${alphaId}`);
    expect(parseAssetReference(reference)).toBe(alphaId);
    const input = { src: reference, nested: [`retro-asset:${alphaId}`] };
    const before = structuredClone(input);
    expect(collectAssetReferences(input)).toEqual([alphaId]);
    expect(replaceAssetReferences(input, new Map([[alphaId, "https://cdn.test/a.png"]]))).toEqual({ src: "https://cdn.test/a.png", nested: ["https://cdn.test/a.png"] });
    expect(input).toEqual(before);
  });

  it("recognizes the same case-insensitive scheme accepted by the existing schema", () => {
    const input = `RETRO-ASSET:${alphaId.toUpperCase()}`;
    expect(AssetReferenceSchema.safeParse(input).success).toBe(true);
    expect(parseAssetReference(input)).toBe(alphaId);
  });

  it.each([`${alphaId}extra`, ` ${alphaId}`, `${alphaId} `, `${alphaId}\n`, alphaId.replace("4abc", "0abc"), alphaId.replace("8abc", "7abc"), alphaId.replace("abcd", "xabc")])("does not normalize invalid UUID %s into a valid reference", (invalid) => {
    expect(AssetReferenceSchema.safeParse(`retro-asset:${invalid}`).success).toBe(false);
    expect(normalizeAssetId(invalid)).toBeNull();
    expect(parseAssetReference(`retro-asset:${invalid}`)).toBeNull();
    expect(() => createAssetReference(invalid)).toThrow("Invalid asset id");
  });

  it.each([null, undefined, 123, {}, []])("rejects non-string UUID/reference values (%j)", (invalid) => {
    expect(normalizeAssetId(invalid)).toBeNull();
    expect(parseAssetReference(invalid)).toBeNull();
  });

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
