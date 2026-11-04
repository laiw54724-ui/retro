import { describe, expect, it } from "vitest";
import { DocumentBlockSchema } from "@retrodesk/shared";
import { convertBlock, emptyBlock, moveBlock, splitBlock } from "./editing";

describe("document editing transactions", () => {
  it("creates schema-valid empty blocks without locale-specific fixture text", () => {
    for (const kind of ["heading", "text", "list", "image", "button", "link", "divider"] as const) {
      const block = emptyBlock(kind);
      expect(DocumentBlockSchema.safeParse(block).success).toBe(true);
      if ("text" in block) expect(block.text).toBe("");
    }
  });
  it("converts paragraph style without noncanonical properties or silent truncation", () => {
    const text = { ...emptyBlock("text"), kind: "text" as const, text: "hello", bold: true, italic: true, align: "center" as const };
    expect(convertBlock(text, "heading")).toEqual({ id: text.id, kind: "heading", text: "hello" });
    expect(convertBlock({ ...text, text: "a".repeat(501) }, "heading")).toBeNull();
  });
  it("splits a selection into a single transaction and respects capacity", () => {
    const block = { ...emptyBlock("heading"), kind: "heading" as const, text: "beforeSELECTafter" };
    const next = emptyBlock("text");
    expect(splitBlock([block], block.id, 6, 12, next)).toMatchObject([{ text: "before" }, { text: "after" }]);
    const full = Array.from({ length: 100 }, () => emptyBlock("text"));
    expect(splitBlock(full, full[0].id, 0, 0, next)).toBe(full);
  });
  it("places blocks before, after, or at the end without duplication", () => {
    const list = [emptyBlock("text"), emptyBlock("image"), emptyBlock("divider")];
    expect(moveBlock(list, list[2].id, list[0].id, false)).toEqual([list[2], list[0], list[1]]);
    expect(moveBlock(list, list[0].id, list[1].id, true)).toEqual([list[1], list[0], list[2]]);
    expect(moveBlock(list, list[0].id, null, true)).toEqual([list[1], list[2], list[0]]);
    expect(moveBlock(list, list[0].id, "missing", false)).toBe(list);
  });
});
