import { describe, expect, it } from "vitest";
import { imageBytesMatchMime } from "../src/lib/upload";

describe("imageBytesMatchMime", () => {
  it("recognizes supported image signatures", () => {
    expect(imageBytesMatchMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(imageBytesMatchMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(imageBytesMatchMime(new TextEncoder().encode("GIF89a"), "image/gif")).toBe(true);
    expect(imageBytesMatchMime(new TextEncoder().encode("RIFF0000WEBP"), "image/webp")).toBe(true);
  });

  it("rejects spoofed MIME declarations and unsupported types", () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(imageBytesMatchMime(html, "image/png")).toBe(false);
    expect(imageBytesMatchMime(html, "image/jpeg")).toBe(false);
    expect(imageBytesMatchMime(html, "image/svg+xml")).toBe(false);
  });
});
