import { describe, expect, it } from "vitest";
import { createStarterDocument, makeIgPost, danglingExplorerShortcuts, deleteOrRetargetProfile, createProfile, describeShortcutTarget, makeWindow, migrateSiteDocumentV2, newlyDanglingShortcuts, removeExplorerShortcuts, parseSiteDocument } from "../src";

function documentWithShortcuts() {
  const legacy = createStarterDocument("Desk", "classic98", "instagram");
  const notes = makeWindow("document", 1); notes.id = "notes"; notes.title = "筆記";
  const explorer = makeWindow("explorer", 2); explorer.id = "ex"; explorer.title = "World.exe";
  if (explorer.type !== "explorer") throw new Error("fixture");
  const ig = legacy.windows.find((window) => window.type === "instagram");
  if (!ig || ig.type !== "instagram") throw new Error("fixture");
  ig.content.images = [makeIgPost({ title: "貼文", src: "https://cdn.example.com/a.png", srcUrl: "" })];
  legacy.windows.push(notes, explorer);
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-a" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("migration failed");
  const document = migrated.document;
  const profile = document.entities.profiles[0];
  const post = document.entities.posts[0];
  const world = document.windows.find((window) => window.id === "ex");
  if (!world || world.type !== "explorer") throw new Error("fixture");
  world.content = {
    folders: [{ id: "f", parentId: null, name: "資料", order: 0, visibility: "published" }],
    shortcuts: [
      { id: "n", parentId: "f", label: "筆記捷徑", order: 0, visibility: "published", target: { siteId: "site-a", id: "notes", kind: "window" } },
      { id: "p", parentId: null, label: "角色捷徑", order: 1, visibility: "published", target: { siteId: "site-a", id: profile.id, kind: "profile" } },
      { id: "t", parentId: null, label: "貼文捷徑", order: 2, visibility: "draft", target: { siteId: "site-a", id: post.id, kind: "post" } }
    ]
  };
  return { document, profile, post };
}

describe("explorer shortcut integrity", () => {
  it("finds nothing dangling in a healthy document", () => {
    expect(danglingExplorerShortcuts(documentWithShortcuts().document)).toEqual([]);
  });

  it("lists exactly the shortcuts a removal would orphan, with explorer and folder location, across windows, profiles and posts", () => {
    const { document, post } = documentWithShortcuts();
    const withoutNotes = { ...document, windows: document.windows.filter((window) => window.id !== "notes") };
    expect(newlyDanglingShortcuts(document, withoutNotes)).toMatchObject([{ explorerId: "ex", explorerTitle: "World.exe", shortcutId: "n", label: "筆記捷徑", folderPath: "桌面 / 資料", targetKind: "window" }]);
    expect(describeShortcutTarget(document, { targetKind: "window", targetId: "notes" })).toBe("視窗：筆記");
    const withoutPost = { ...document, entities: { ...document.entities, posts: document.entities.posts.filter((item) => item.id !== post.id) } };
    expect(newlyDanglingShortcuts(document, withoutPost).map((item) => item.shortcutId)).toEqual(["t"]);
    // a draft shortcut is still a reference and still blocks saving
    expect(parseSiteDocument(withoutPost).ok).toBe(false);
  });

  it("does not blame an edit for shortcuts that were already broken", () => {
    const { document } = documentWithShortcuts();
    const broken = { ...document, windows: document.windows.filter((window) => window.id !== "notes") };
    expect(newlyDanglingShortcuts(broken, broken)).toEqual([]);
  });

  it("removes only the listed shortcuts and leaves the result valid", () => {
    const { document } = documentWithShortcuts();
    const withoutNotes = { ...document, windows: document.windows.filter((window) => window.id !== "notes") };
    const cleaned = removeExplorerShortcuts(withoutNotes, danglingExplorerShortcuts(withoutNotes));
    const world = cleaned.windows.find((window) => window.id === "ex");
    expect(world?.type === "explorer" && world.content.shortcuts.map((shortcut) => shortcut.id)).toEqual(["p", "t"]);
    expect(world?.type === "explorer" && world.content.folders.map((folder) => folder.id)).toEqual(["f"]);
    expect(parseSiteDocument(cleaned).ok).toBe(true);
    // the input is not mutated
    expect(danglingExplorerShortcuts(withoutNotes)).toHaveLength(1);
  });

  it("retargets profile shortcuts when a character is replaced instead of deleted", () => {
    const { document, profile } = documentWithShortcuts();
    const created = createProfile(document, { handle: "replacement", displayName: "新角色", name: "新角色", avatar: null }, { siteId: "site-a", id: "profile:new" });
    if (!created.ok) throw new Error("create failed");
    const result = deleteOrRetargetProfile(created.document, profile.id, { siteId: "site-a", retargetProfileId: "profile:new" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const world = result.document.windows.find((window) => window.id === "ex");
    expect(world?.type === "explorer" && world.content.shortcuts.find((shortcut) => shortcut.id === "p")?.target.id).toBe("profile:new");
    expect(danglingExplorerShortcuts(result.document)).toEqual([]);
  });
});
