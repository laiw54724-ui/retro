import { describe, expect, it } from "vitest";
import { insertGalleryUpload, parseGalleryUrls, reorderGallery, validGalleryFile } from "./inlineEditing";
import en from "./locale-deltas/en.json";
import zh from "./locale-deltas/zh-Hant.json";
import ja from "./locale-deltas/ja.json";
import ko from "./locale-deltas/ko.json";
const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (list: { id: string }[]) => list.map((item) => item.id);

describe("gallery inline operations", () => {
  it("parses multiline URLs with the shared HTTPS and Drive rules", () => {
    const result = parseGalleryUrls(" https://example.com/one.png\r\n\nhttps://drive.google.com/file/d/1234567890abc/view\nhttp://example.com/no.png\njavascript:alert(1)\nhttps://");
    expect(result.rejected).toBe(3);
    expect(result.valid).toEqual([
      { src: "https://example.com/one.png", srcUrl: "https://example.com/one.png" },
      { src: "https://drive.google.com/thumbnail?id=1234567890abc&sz=w2000", srcUrl: "https://drive.google.com/file/d/1234567890abc/view" }
    ]);
    expect(parseGalleryUrls("https://example.com/" + "a".repeat(2048)).rejected).toBe(1);
  });
  it("inserts before/after a drop target in either direction and at the tail", () => {
    expect(ids(reorderGallery(items("a", "b", "c"), "a", "b", true))).toEqual(["b", "a", "c"]);
    expect(ids(reorderGallery(items("a", "b", "c"), "c", "a"))).toEqual(["c", "a", "b"]);
    expect(ids(reorderGallery(items("a", "b", "c"), "a", null))).toEqual(["b", "c", "a"]);
    const list = items("a", "b");
    expect(reorderGallery(list, "a", "gone")).toBe(list);
    expect(reorderGallery(list, "gone", "a")).toBe(list);
    expect(reorderGallery(list, "a", "a")).toBe(list);
  });
  it("preserves batch ordering and drop position when an earlier failure retries", () => {
    const selection = ["one", "two", "three"];
    let list = insertGalleryUpload(items("before", "anchor"), { id: "two" }, selection, "anchor");
    list = insertGalleryUpload(list, { id: "three" }, selection, "anchor");
    list = insertGalleryUpload(list, { id: "one" }, selection, "anchor");
    expect(ids(list)).toEqual(["before", "one", "two", "three", "anchor"]);
    expect(ids(insertGalleryUpload(items("before"), { id: "one" }, selection, "deleted"))).toEqual(["before", "one"]);
  });
  it("rejects non-images and files over 8 MB before enqueueing", () => {
    expect(validGalleryFile({ type: "text/plain", size: 1 })).toBe(false);
    expect(validGalleryFile({ type: "image/png", size: 8 * 1024 * 1024 + 1 })).toBe(false);
    expect(validGalleryFile({ type: "image/png", size: 8 * 1024 * 1024 })).toBe(true);
  });
  it("delivers the same nonempty incremental keys in four languages", () => {
    for (const delta of [zh, ja, ko]) {
      expect(Object.keys(delta.gallery.inline)).toEqual(Object.keys(en.gallery.inline));
      expect(Object.values(delta.gallery.inline).every((value) => value.trim())).toBe(true);
    }
  });
});
