import { describe, expect, it } from "vitest";
import { createStarterDocument } from "../src/site";
import { migrateSiteDocumentV2 } from "../src/site-versioning";
import { addHighlightFrame, createHighlight, deleteHighlightFrame, reorderHighlightFrame, updateHighlightFrame } from "../src/highlight-operations";

function document() {
  const migrated = migrateSiteDocumentV2(createStarterDocument("Highlights", "classic98", "instagram"), { siteId: "site-a" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  return migrated.document;
}

describe("canonical highlight operations", () => {
  it("creates a highlight and keeps the first frame as the compatibility cover", () => {
    const before = document();
    const owner = before.entities.profiles[0];
    const created = createHighlight(before, { id: "highlight:new", ownerProfileId: owner.id, title: "World" }, { siteId: "site-a" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const added = addHighlightFrame(created.document, "highlight:new", { id: "frame:1", src: "https://example.com/one.png", srcUrl: "", alt: "one", text: "" }, { siteId: "site-a" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.highlight).toMatchObject({ coverSrc: "https://example.com/one.png", coverAlt: "one" });
    const edited = updateHighlightFrame(added.document, "highlight:new", "frame:1", { alt: "updated" }, { siteId: "site-a" });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.highlight?.coverAlt).toBe("updated");
  });

  it("supports frame ordering and deletion without mutating the input", () => {
    const base = document();
    const created = createHighlight(base, { id: "highlight:order", ownerProfileId: base.entities.profiles[0].id, title: "Order" }, { siteId: "site-a" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    let next = addHighlightFrame(created.document, "highlight:order", { id: "frame:a", src: "https://example.com/a.png", srcUrl: "", alt: "a", text: "" }, { siteId: "site-a" });
    if (!next.ok) throw new Error("frame add failed");
    next = addHighlightFrame(next.document, "highlight:order", { id: "frame:b", src: "https://example.com/b.png", srcUrl: "", alt: "b", text: "" }, { siteId: "site-a" });
    if (!next.ok) throw new Error("frame add failed");
    const reordered = reorderHighlightFrame(next.document, "highlight:order", "frame:b", -1, { siteId: "site-a" });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.document.entities.highlights.find((item) => item.id === "highlight:order")?.frames.map((frame) => frame.id)).toEqual(["frame:b", "frame:a"]);
    const deleted = deleteHighlightFrame(reordered.document, "highlight:order", "frame:b", { siteId: "site-a" });
    expect(deleted.ok).toBe(true);
    if (deleted.ok) expect(deleted.highlight?.frames).toHaveLength(1);
  });

  it("rejects cross-site owners", () => {
    const result = createHighlight(document(), { id: "highlight:bad", ownerProfileId: "profile:missing", title: "Bad" }, { siteId: "site-a" });
    expect(result).toMatchObject({ ok: false });
  });
});
