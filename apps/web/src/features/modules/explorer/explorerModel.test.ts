import { describe, expect, it } from "vitest";
import { MAX_DEPTH, canCreateFolder, deleteImpact, descendants, folderDepth, moveItem, moveOptions, pathLabel, removeFolder, subtreeHeight, targetStatus, uniqueName, type ExplorerContent } from "./explorerModel";

const folder = (id: string, parentId: string | null, name = id, order = 0) => ({ id, parentId, name, order, visibility: "published" as const });
const shortcut = (id: string, parentId: string | null, targetId = "w1") => ({ id, parentId, label: id, order: 0, visibility: "published" as const, target: { siteId: "s", id: targetId, kind: "window" as const } });
const content = (): ExplorerContent => ({
  folders: [folder("a", null, "角色"), folder("b", "a", "主角"), folder("c", "b", "設定"), folder("d", null, "主角")],
  shortcuts: [shortcut("s1", "c"), shortcut("s2", "d"), shortcut("s3", null)]
});

describe("explorer model", () => {
  it("measures depth, subtree height and descendants", () => {
    const c = content();
    expect(folderDepth(c.folders, null)).toBe(0);
    expect(folderDepth(c.folders, "c")).toBe(3);
    expect(subtreeHeight(c.folders, "a")).toBe(3);
    expect([...descendants(c.folders, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("shows the full path so same-named folders can be told apart", () => {
    const c = content();
    expect(pathLabel(c.folders, "c")).toBe("桌面 / 角色 / 主角 / 設定");
    expect(pathLabel(c.folders, "d")).toBe("桌面 / 主角");
    const options = moveOptions(c, { kind: "shortcut", id: "s3" });
    expect(options.map((option) => option.path)).toEqual(["桌面", "桌面 / 主角", "桌面 / 角色", "桌面 / 角色 / 主角", "桌面 / 角色 / 主角 / 設定"]);
    expect(options.find((option) => option.id === null)?.current).toBe(true);
  });

  it("blocks moving a folder into itself, its children, or beyond the depth limit", () => {
    const c = content();
    const options = moveOptions(c, { kind: "folder", id: "a" });
    expect(options.find((option) => option.id === "a")).toMatchObject({ disabled: true });
    expect(options.find((option) => option.id === "c")).toMatchObject({ disabled: true, reason: "不能移到自己的子資料夾裡" });
    expect(options.find((option) => option.id === "d")).toMatchObject({ disabled: false });
    expect(moveItem(c, { kind: "folder", id: "a" }, "c")).toMatchObject({ ok: false });

    let chain: ExplorerContent = { folders: [folder("n0", null)], shortcuts: [] };
    for (let i = 1; i < MAX_DEPTH; i += 1) chain = { ...chain, folders: [...chain.folders, folder(`n${i}`, `n${i - 1}`)] };
    chain = { ...chain, folders: [...chain.folders, folder("loose", null), folder("loose-child", "loose")] };
    expect(canCreateFolder(chain, "n7")).toMatchObject({ ok: false });
    expect(moveItem(chain, { kind: "folder", id: "loose" }, "n7")).toMatchObject({ ok: false, reason: `資料夾最多 ${MAX_DEPTH} 層` });
    expect(moveItem(chain, { kind: "shortcut", id: "none" }, "n7")).toMatchObject({ ok: true });
  });

  it("moves folders and shortcuts to the end of the new parent without touching others", () => {
    const c = content();
    const moved = moveItem(c, { kind: "shortcut", id: "s3" }, "d");
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.content.shortcuts.find((item) => item.id === "s3")).toMatchObject({ parentId: "d", order: 1 });
    expect(moved.content.shortcuts.find((item) => item.id === "s1")).toEqual(c.shortcuts[0]);
    expect(moved.content.folders).toEqual(c.folders);
    const folderMove = moveItem(c, { kind: "folder", id: "c" }, null);
    expect(folderMove.ok && folderMove.content.folders.find((item) => item.id === "c")?.parentId).toBe(null);
  });

  it("lists exactly what a folder deletion removes and never touches targets", () => {
    const c = content();
    const impact = deleteImpact(c, "a");
    expect(impact.folders.map((item) => item.id).sort()).toEqual(["b", "c"]);
    expect(impact.shortcuts.map((item) => item.id)).toEqual(["s1"]);
    expect(impact.total).toBe(3);
    const after = removeFolder(c, "a");
    expect(after.folders.map((item) => item.id)).toEqual(["d"]);
    expect(after.shortcuts.map((item) => item.id).sort()).toEqual(["s2", "s3"]);
  });

  it("names new folders uniquely among siblings", () => {
    expect(uniqueName("新資料夾", [])).toBe("新資料夾");
    expect(uniqueName("新資料夾", ["新資料夾"])).toBe("新資料夾 2");
    expect(uniqueName("新資料夾", ["新資料夾", "新資料夾 2"])).toBe("新資料夾 3");
  });

  it("detects broken shortcuts only where the host can verify them", () => {
    const options = [{ kind: "window" as const, id: "w1", label: "角色設定.txt", group: "視窗" }];
    const can = { window: true, profile: false, post: false };
    expect(targetStatus({ siteId: "s", id: "w1", kind: "window" }, options, can)).toMatchObject({ status: "ok", name: "角色設定.txt" });
    expect(targetStatus({ siteId: "s", id: "gone", kind: "window" }, options, can).status).toBe("missing");
    expect(targetStatus({ siteId: "s", id: "p1", kind: "profile" }, options, can).status).toBe("unknown");
  });
});
