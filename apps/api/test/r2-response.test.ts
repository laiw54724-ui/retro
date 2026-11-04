import { describe, expect, it, vi } from "vitest";
import { parseSingleByteRange, respondWithR2Object } from "../src/lib/r2-response";

const bytes = new TextEncoder().encode("0123456789");
const object = (body = bytes) => ({
  body: new Blob([body]).stream(),
  size: bytes.length,
  httpEtag: '"etag"',
  writeHttpMetadata(headers: Headers) { headers.set("Content-Type", "audio/mpeg"); }
});

describe("R2 media responses", () => {
  it("parses bounded, open, and suffix byte ranges", () => {
    expect(parseSingleByteRange("bytes=2-5", 10)).toEqual({ offset: 2, length: 4 });
    expect(parseSingleByteRange("bytes=7-", 10)).toEqual({ offset: 7, length: 3 });
    expect(parseSingleByteRange("bytes=-3", 10)).toEqual({ offset: 7, length: 3 });
    expect(parseSingleByteRange("bytes=20-30", 10)).toBe("invalid");
    expect(parseSingleByteRange("bytes=0-1,4-5", 10)).toBe("invalid");
  });

  it("returns HEAD metadata without loading the object body", async () => {
    const head = vi.fn(async () => object());
    const get = vi.fn();
    const response = await respondWithR2Object({ head, get } as never, "song.mp3", new Request("https://example.com/song", { method: "HEAD" }), "private, no-store");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-type")).toBe("audio/mpeg");
    expect(response?.headers.get("content-length")).toBe("10");
    expect(await response?.text()).toBe("");
    expect(get).not.toHaveBeenCalled();
  });

  it("returns a single partial response and rejects multiple ranges", async () => {
    const head = vi.fn(async () => object());
    const get = vi.fn(async (_key: string, options: { range: { offset: number; length: number } }) => object(bytes.slice(options.range.offset, options.range.offset + options.range.length)));
    const response = await respondWithR2Object({ head, get } as never, "song.mp3", new Request("https://example.com/song", { headers: { Range: "bytes=2-5" } }), "public, max-age=31536000, immutable");
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response?.headers.get("accept-ranges")).toBe("bytes");
    expect(await response?.text()).toBe("2345");

    const rejected = await respondWithR2Object({ head, get } as never, "song.mp3", new Request("https://example.com/song", { headers: { Range: "bytes=0-1,4-5" } }), "public");
    expect(rejected?.status).toBe(416);
    expect(rejected?.headers.get("content-range")).toBe("bytes */10");
  });
});
