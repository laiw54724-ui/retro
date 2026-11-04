import { describe, expect, it } from "vitest";
import { moveSelection, removeSelection, selectionRoots } from "./selectionModel";
import type { ExplorerContent } from "./explorerModel";
const fixture = (): ExplorerContent => ({
  folders: [
    { id: "parent", parentId: null, name: "Parent", order: 0, visibility: "published" },
    { id: "child", parentId: "parent", name: "Child", order: 0, visibility: "draft" },
    { id: "dest", parentId: null, name: "Destination", order: 1, visibility: "published" },
  ],
  shortcuts: [{ id: "link", parentId: "child", label: "Link", order: 0, visibility: "published", target: { kind: "window", id: "window", siteId: "site" } }],
});
describe("explorer multi-selection", () => {
  it("moves a selected tree once without detaching selected descendants or changing targets", () => {
    const original = fixture();
    const selection = [{ kind: "folder" as const, id: "parent" }, { kind: "folder" as const, id: "child" }, { kind: "shortcut" as const, id: "link" }];
    expect(selectionRoots(original, selection)).toEqual([selection[0]]);
    const result = moveSelection(original, selection, "dest");
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("expected move");
    expect(result.content.folders.find(item => item.id === "parent")?.parentId).toBe("dest");
    expect(result.content.folders.find(item => item.id === "child")).toEqual(original.folders[1]);
    expect(result.content.shortcuts).toEqual(original.shortcuts);
    expect(original.folders[0].parentId).toBeNull();
  });
  it("rejects the whole operation when any root would move into its descendant", () => {
    const content = fixture();
    expect(moveSelection(content, [{ kind: "folder", id: "dest" }, { kind: "folder", id: "parent" }], "child").ok).toBe(false);
    expect(content).toEqual(fixture());
  });
  it("treats stale clipboard and same location as no-op", () => {
    const content = fixture();
    expect(moveSelection(content, [{ kind: "folder", id: "deleted" }], null).ok).toBe(false);
    expect(moveSelection(content, [{ kind: "folder", id: "parent" }], null).ok).toBe(false);
  });
  it("deletes overlapping selections without deleting destination windows or mutating the original", () => {
    const content = fixture();
    const next = removeSelection(content, [{ kind: "folder", id: "parent" }, { kind: "shortcut", id: "link" }]);
    expect(next.folders.map(item => item.id)).toEqual(["dest"]);
    expect(next.shortcuts).toEqual([]);
    expect(content.shortcuts[0].target.id).toBe("window");
    expect(content.shortcuts).toHaveLength(1);
  });
});
