import { describe, expect, it } from "vitest";
import { audioBytesMatchMime, extensionForMime, imageBytesMatchMime, normalizeAudioMime } from "../src/lib/upload";

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

describe("audio upload signatures", () => {
  it("recognizes MP3, Ogg, and WAV signatures and normalizes browser WAV aliases", () => {
    expect(audioBytesMatchMime(new TextEncoder().encode("ID3\u0004\u0000"), "audio/mpeg")).toBe(true);
    expect(audioBytesMatchMime(new Uint8Array([0xff, 0xfb, 0x90, 0x64]), "audio/mpeg")).toBe(true);
    expect(audioBytesMatchMime(new TextEncoder().encode("OggS\u0000\u0002\u0000\u0000OpusHead"), "audio/ogg")).toBe(true);
    expect(audioBytesMatchMime(new TextEncoder().encode("RIFF0000WAVEfmt "), "audio/x-wav")).toBe(true);
    expect(normalizeAudioMime("audio/x-wav")).toBe("audio/wav");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("audio/ogg")).toBe("ogg");
    expect(extensionForMime("audio/wav")).toBe("wav");
  });

  it("rejects spoofed and unsupported audio", () => {
    const html = new TextEncoder().encode("<html>not audio</html>");
    expect(audioBytesMatchMime(html, "audio/mpeg")).toBe(false);
    expect(audioBytesMatchMime(html, "audio/ogg")).toBe(false);
    expect(audioBytesMatchMime(new TextEncoder().encode("OggS\u0000\u0002\u0000\u0000theora"), "audio/ogg")).toBe(false);
    expect(audioBytesMatchMime(html, "audio/wav")).toBe(false);
    expect(audioBytesMatchMime(new TextEncoder().encode("ID3"), "audio/mp4")).toBe(false);
  });
});
