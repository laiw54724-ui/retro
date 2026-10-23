import { expect, test, type Locator, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";
import { igWindow } from "./ig-fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function explorerDocument() {
  const target = makeWindow("document", 0);
  target.id = "lore"; target.title = "角色設定.txt"; target.defaultOpen = false;
  const explorer = makeWindow("explorer", 1);
  explorer.id = "explorer"; explorer.title = "World.exe"; explorer.layout.desktop = { ...explorer.layout.desktop, x: 80, y: 30, w: 680, h: 620, z: 3 };
  return { ...structuredClone(documentFixture), windows: [target, explorer] } as SiteDocument;
}

async function openEditor(page: Page, draftDocument = explorerDocument(), viewport = { width: 1440, height: 900 }) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draftDocument, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocument };
    saves.push(body); site.draft_document = structuredClone(body.document); site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize(viewport);
  await page.goto("/editor/site-1");
  if (viewport.width < 768) {
    await page.locator(".m-icon").getByText("World.exe", { exact: true }).click();
    await page.getByRole("button", { name: "編輯內容", exact: true }).click();
  }
  const dialog = page.getByRole("dialog", { name: "World.exe" });
  await expect(dialog).toBeVisible();
  if (viewport.width >= 768) await dialog.locator(".retro-titlebar").click();
  return { dialog, saves };
}

const F = (id: string, parentId: string | null, name: string, order = 0) => ({ id, parentId, name, order, visibility: "published" as const });
const S = (id: string, parentId: string | null, label: string, targetId = "lore") => ({ id, parentId, label, order: 0, visibility: "published" as const, target: { siteId: "site-1", id: targetId, kind: "window" as const } });

function withContent(folders: ReturnType<typeof F>[], shortcuts: ReturnType<typeof S>[]) {
  const document = explorerDocument();
  const explorer = document.windows.find((window) => window.type === "explorer");
  if (!explorer || explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.content.folders = folders;
  explorer.content.shortcuts = shortcuts;
  return document;
}

const explorerContent = (saves: Array<{ document: SiteDocument }>) => {
  const explorer = saves.at(-1)?.document.windows.find((window) => window.type === "explorer");
  return explorer?.type === "explorer" ? explorer.content : null;
};
const editorTile = (dialog: Locator, name: string) => dialog.locator(`.folder-tree-editor .explorer-grid .explorer-item:has(> .explorer-open[aria-label=${JSON.stringify(name)}])`);
async function editorAction(dialog: Locator, name: string, action: string) {
  await dialog.locator(".retro-titlebar").click();
  await editorTile(dialog, name).locator(".explorer-open").click();
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await dialog.page().getByRole("menuitem", { name: action }).click();
}

function canonicalFixture(document: SiteDocument) {
  const migrated = migrateSiteDocumentV2(document, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  return migrated.document as unknown as SiteDocument;
}

test("healthy shortcut target editing stages Cancel/Escape, preserves fields, and supports undo/reload", async ({ page }) => {
  const document = withContent([], [S("link", null, "Keep this label")]);
  const target = makeWindow("document", 2); target.id = "next"; target.title = "Next target.txt"; target.defaultOpen = false;
  document.windows.push(target);
  const explorer = document.windows.find((window) => window.type === "explorer")!;
  if (explorer.type !== "explorer") throw new Error("fixture");
  explorer.content.shortcuts[0] = { ...explorer.content.shortcuts[0], icon: "heart", order: 7, visibility: "draft" };
  const original = structuredClone(explorer.content.shortcuts[0]);
  const { dialog, saves } = await openEditor(page, canonicalFixture(document));
  await editorAction(dialog, "Keep this label", "變更目標");
  const change = dialog.getByRole("button", { name: "項目操作", exact: true });
  const picker = page.getByRole("dialog", { name: "變更捷徑「Keep this label」的目標", exact: true });
  await expect(picker.getByRole("option", { name: /角色設定.txt/ })).toHaveAttribute("aria-selected", "true");
  await picker.getByRole("searchbox").fill("Next target");
  await expect(picker.getByRole("status")).toContainText("目前選擇：視窗：角色設定.txt");
  await picker.getByRole("option", { name: /Next target.txt/ }).click();
  await picker.getByRole("button", { name: "取消", exact: true }).click();
  await expect(change).toBeFocused();
  await change.click(); await page.getByRole("menuitem", { name: "變更目標" }).click();
  await picker.getByRole("option", { name: /Next target.txt/ }).click();
  await page.keyboard.press("Escape");
  await expect(change).toBeFocused();
  await change.click(); await page.getByRole("menuitem", { name: "變更目標" }).click();
  await picker.getByRole("button", { name: "改指向這個", exact: true }).click(); // same target is a no-op
  await page.waitForTimeout(1200); expect(saves).toHaveLength(0);
  await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
  await change.click(); await page.getByRole("menuitem", { name: "變更目標" }).click();
  await picker.getByRole("option", { name: /Next target.txt/ }).focus(); await page.keyboard.press("Space");
  await picker.getByRole("button", { name: "改指向這個", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0]).toEqual({ ...original, target: { siteId: "site-1", id: "next", kind: "window" } });
  expect(saves).toHaveLength(1);
  await expect(editorTile(dialog, "Keep this label").locator(".explorer-open")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0]).toEqual(original);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].target.id).toBe("next");
  await page.reload();
  await editorAction(page.getByRole("dialog", { name: "World.exe", exact: true }), "Keep this label", "變更目標");
  await expect(picker.getByRole("option", { name: /Next target.txt/ })).toHaveAttribute("aria-selected", "true");
});

test("target search with no results retains the visible pending selection without saving", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, canonicalFixture(withContent([], [S("link", null, "Keep target")])));
  await editorAction(dialog, "Keep target", "變更目標");
  const picker = page.getByRole("dialog", { name: "變更捷徑「Keep target」的目標", exact: true });
  await picker.getByRole("searchbox").fill("no matching target");
  await expect(picker.getByRole("option")).toHaveCount(0);
  await expect(picker.getByRole("status").filter({ hasText: "目前選擇" })).toContainText("角色設定.txt");
  await picker.getByRole("searchbox").fill("角色設定");
  await expect(picker.getByRole("option", { selected: true })).toHaveCount(1);
  await picker.getByRole("button", { name: "改指向這個", exact: true }).click();
  await page.waitForTimeout(1200); expect(saves).toHaveLength(0);
});

test("author creates, names and selects a folder, builds a nested folder, adds shortcuts from a picker and reloads", async ({ page }) => {
  const { dialog, saves } = await openEditor(page);
  await dialog.getByRole("button", { name: /＋ 資料夾/ }).click();
  const rename = dialog.getByRole("textbox", { name: "資料夾名稱" });
  await expect(rename).toBeFocused();
  await page.keyboard.type("角色設定");
  await page.keyboard.press("Enter");
  const folder = editorTile(dialog, "角色設定").locator(".explorer-open");
  await expect(folder).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("status").first()).toContainText("已選取 1 個項目");

  await folder.dblclick();
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "角色設定" })).toHaveAttribute("aria-current", "page");
  await dialog.getByRole("button", { name: /＋ 資料夾/ }).click();
  await page.keyboard.type("主角組");
  await page.keyboard.press("Enter");

  await dialog.getByRole("button", { name: /＋ 捷徑/ }).click();
  const picker = page.getByRole("dialog", { name: "建立捷徑" });
  await picker.getByRole("option", { name: "角色設定.txt" }).click();
  await picker.getByRole("button", { name: "建立捷徑" }).click();
  await expect(dialog.getByRole("textbox", { name: "捷徑名稱" })).toBeFocused();
  await page.keyboard.type("主角設定");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "主角設定", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "↑ 上一層" }).click();
  await dialog.getByRole("button", { name: /＋ 捷徑/ }).click();
  await page.getByRole("dialog", { name: "建立捷徑" }).getByRole("option", { name: "角色設定.txt" }).dblclick();
  await expect.poll(() => { const c = explorerContent(saves); return c ? { folders: c.folders.length, shortcuts: c.shortcuts.length } : null; }).toEqual({ folders: 2, shortcuts: 2 });
  expect(explorerContent(saves)?.shortcuts.every((shortcut) => shortcut.target.id === "lore")).toBe(true);
  await page.reload();
  await expect(editorTile(page.getByRole("dialog", { name: "World.exe" }), "角色設定")).toBeVisible();
});

test("a desktop author single-click selects, double-click or Enter opens; shortcuts show an arrow and their target", async ({ page }) => {
  const { dialog } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]));
  const tile = dialog.locator(".explorer-item").filter({ hasText: "主角設定" });
  await expect(tile.locator(".explorer-arrow")).toBeVisible();
  await expect(tile).toContainText("視窗：角色設定.txt");
  const folder = editorTile(dialog, "角色").locator(".explorer-open");
  await folder.click();
  await expect(folder).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "角色" })).toHaveCount(0); // single click did not open
  await folder.press("Enter");
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "角色" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "↑ 上一層" })).toBeEnabled();
  await dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "桌面" }).click();
  await expect(dialog.getByRole("button", { name: "↑ 上一層" })).toBeDisabled();
});

test("move dialog shows full paths for same-named folders and blocks impossible moves", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent(
    [F("a", null, "角色"), F("a-main", "a", "主角"), F("a-main-sub", "a-main", "設定"), F("b-main", null, "主角", 1)],
    [S("link", null, "主角設定")]
  ));
  await editorAction(dialog, "主角設定", "移動到…");
  const move = page.getByRole("dialog", { name: "移動「主角設定」到…" });
  await expect(move.getByRole("button", { name: /^桌面 \/ 角色 \/ 主角$/ })).toBeVisible();
  await expect(move.getByRole("button", { name: /^桌面 \/ 主角$/ })).toBeVisible();
  await expect(move.getByRole("button", { name: /目前位置/ })).toBeDisabled();
  await move.getByRole("button", { name: /^桌面 \/ 角色 \/ 主角$/ }).click();
  await expect(move).toBeHidden();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe("a-main");
  await expect(dialog.getByRole("status").first()).toContainText("已移動 1 個項目到「桌面 / 角色 / 主角」");

  // a folder cannot be moved into itself or its own child
  await editorAction(dialog, "角色", "移動到…");
  const folderMove = page.getByRole("dialog", { name: "移動「角色」到…" });
  await expect(folderMove.getByRole("button", { name: /^桌面 \/ 角色 \/ 主角 不能移到自己的子資料夾裡$/ })).toBeDisabled();
  await expect(folderMove.getByRole("button", { name: /^桌面 \/ 角色 不能移到自己裡面$/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(folderMove).toBeHidden();
});

test("dragging a shortcut onto a folder moves it; the move dialog remains the keyboard and touch alternative", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]));
  const shortcut = dialog.locator(".explorer-item").filter({ hasText: "主角設定" });
  const folder = dialog.locator(".explorer-item").filter({ hasText: "角色" }).first();
  await shortcut.dragTo(folder);
  await expect(dialog.getByRole("status").first()).toContainText("已移動 1 個項目到「桌面 / 角色」");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe("chars");
  // the breadcrumb is a drop target too
  await folder.getByRole("button", { name: "角色", exact: true }).dblclick();
  await dialog.locator(".explorer-item").filter({ hasText: "主角設定" }).dragTo(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "桌面" }));
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe(null);
});

test("deleting a folder lists what goes with it, keeps targets, and can be undone", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色"), F("sub", "chars", "主角")], [S("link", "chars", "主角設定"), S("other", null, "不受影響")]));
  await editorAction(dialog, "角色", "刪除");
  const confirm = dialog.getByRole("alertdialog", { name: "刪除" });
  await expect(confirm).toContainText("2 個資料夾及 1 個捷徑");
  await expect(confirm).toContainText("主角");
  await expect(confirm).toContainText("主角設定");
  await expect(confirm).not.toContainText("不受影響");
  await expect(confirm).toContainText("原本的視窗、OC 與貼文不會被刪除");
  await confirm.getByRole("button", { name: "取消" }).click();
  expect(explorerContent(saves)).toBeNull(); // cancel changes nothing

  await editorAction(dialog, "角色", "刪除");
  await confirm.getByRole("button", { name: "刪除", exact: true }).click();
  await expect.poll(() => { const c = explorerContent(saves); return c ? [c.folders.length, c.shortcuts.length] : null; }).toEqual([0, 1]);
  expect(saves.at(-1)?.document.windows.some((window) => window.id === "lore")).toBe(true);
  await page.getByRole("button", { name: "復原" }).click();
  await expect.poll(() => { const c = explorerContent(saves); return c ? [c.folders.length, c.shortcuts.length] : null; }).toEqual([2, 2]);
});

test("deleting a shortcut never deletes its target and creating a copy keeps the same target", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([], [S("link", null, "主角設定")]));
  await editorAction(dialog, "主角設定", "建立副本捷徑");
  await page.keyboard.type("第二個入口");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts.map((shortcut) => shortcut.target.id)).toEqual(["lore", "lore"]);
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await page.getByRole("menuitem", { name: "刪除" }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts.length).toBe(1);
  expect(saves.at(-1)?.document.windows.some((window) => window.id === "lore")).toBe(true);
  await expect(dialog.getByRole("status").first()).toContainText("原本的視窗、OC 與貼文不會被刪除");
});

test("keyboard: F2 renames, Escape cancels, Delete removes a shortcut, Enter opens a folder", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]));
  const shortcut = editorTile(dialog, "主角設定").locator(".explorer-open");
  await shortcut.focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("改名後");
  await page.keyboard.press("Escape");
  await expect(editorTile(dialog, "主角設定").locator(".explorer-open")).toBeVisible();
  await editorTile(dialog, "主角設定").locator(".explorer-open").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("改名後");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].label).toBe("改名後");
  await editorTile(dialog, "改名後").locator(".explorer-open").focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => explorerContent(saves)?.shortcuts.length).toBe(0);
  await editorTile(dialog, "角色").locator(".explorer-open").focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" })).toContainText("角色");
});

async function deleteLoreWindow(page: Page) {
  await page.getByRole("tab", { name: "視窗" }).click();
  await page.locator(".layer").filter({ hasText: "角色設定.txt" }).getByRole("button", { name: /角色設定\.txt/ }).click();
  await page.getByRole("button", { name: "刪除視窗" }).click();
}

test("deleting a target lists the affected shortcuts first; cancel changes nothing and never blocks saving", async ({ page }, testInfo) => {
  const document = withContent([F("chars", null, "角色")], [S("link", "chars", "主角設定"), S("other", null, "備用", "spare")]);
  const spare = makeWindow("document", 2);
  spare.id = "spare"; spare.title = "備用設定.txt"; spare.defaultOpen = false;
  document.windows.push(spare);
  const { dialog, saves } = await openEditor(page, document);
  await deleteLoreWindow(page);
  const confirm = page.getByRole("dialog", { name: "這項刪除會影響 1 個捷徑" });
  await expect(confirm).toBeVisible();
  const list = confirm.getByRole("list", { name: "受影響的捷徑" });
  await expect(list).toContainText("主角設定");
  await expect(list).toContainText("World.exe / 桌面 / 角色");
  await expect(list).toContainText("視窗：角色設定.txt");
  await expect(list).not.toContainText("備用");
  await page.screenshot({ path: testInfo.outputPath("integrity-dialog-desktop.png") });
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(confirm).toBeHidden();
  // nothing was deleted or marked broken; the draft is still valid and savable
  await expect(page.locator(".layer").filter({ hasText: "角色設定.txt" })).toHaveCount(1);
  await expect(page.locator(".save-text")).not.toContainText("有欄位未完成");
  void dialog;
  expect(saves.every((save) => save.document.windows.some((window) => window.id === "lore"))).toBe(true);
});

test("confirming removes the target and exactly its shortcuts in one step, saves a valid draft, survives reload, and undo restores both", async ({ page }) => {
  const document = withContent([F("chars", null, "角色")], [S("link", "chars", "主角設定"), S("other", null, "備用", "spare")]);
  const spare = makeWindow("document", 2);
  spare.id = "spare"; spare.title = "備用設定.txt"; spare.defaultOpen = false;
  document.windows.push(spare);
  const { dialog, saves } = await openEditor(page, document);
  await deleteLoreWindow(page);
  const confirm = page.getByRole("dialog", { name: "這項刪除會影響 1 個捷徑" });
  await confirm.getByRole("button", { name: "刪除並移除 1 個捷徑" }).click();
  await expect(confirm).toBeHidden();
  await expect.poll(() => saves.at(-1)?.document.windows.map((window) => window.id)).toEqual(["explorer", "spare"]);
  const content = explorerContent(saves)!;
  expect(content.shortcuts.map((shortcut) => shortcut.id)).toEqual(["other"]); // only the dangling one was removed
  expect(content.folders.map((folder) => folder.id)).toEqual(["chars"]); // its folder stays
  await expect(page.locator(".save-text")).not.toContainText("有欄位未完成");

  // undo brings the window and its shortcut back together; redo removes them together again
  await page.getByRole("button", { name: "復原" }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.map((window) => window.id).sort()).toEqual(["explorer", "lore", "spare"]);
  expect(explorerContent(saves)!.shortcuts.map((shortcut) => shortcut.id).sort()).toEqual(["link", "other"]);
  await page.getByRole("button", { name: "重做" }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.map((window) => window.id)).toEqual(["explorer", "spare"]);
  expect(explorerContent(saves)!.shortcuts.map((shortcut) => shortcut.id)).toEqual(["other"]);

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "World.exe" });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.locator(".explorer-item").filter({ hasText: "備用" })).toContainText("視窗：備用設定.txt");
  await expect(editorTile(reloaded, "角色")).toBeVisible();
  void dialog;
});

test("shortcuts in other Explorer windows are listed and removed too, and unrelated shortcuts survive", async ({ page }) => {
  const document = withContent([], [S("a", null, "甲")]);
  const archive = makeWindow("explorer", 3);
  archive.id = "archive"; archive.title = "Archive.exe";
  if (archive.type !== "explorer") throw new Error("explorer fixture mismatch");
  archive.content = { folders: [F("deep", null, "舊檔")], shortcuts: [S("b", "deep", "乙"), S("keep", null, "留著", "explorer")] };
  document.windows.push(archive);
  await openEditor(page, document);
  await deleteLoreWindow(page);
  const confirm = page.getByRole("dialog", { name: "這項刪除會影響 2 個捷徑" });
  const list = confirm.getByRole("list", { name: "受影響的捷徑" });
  await expect(list).toContainText("World.exe / 桌面");
  await expect(list).toContainText("Archive.exe / 桌面 / 舊檔");
  await expect(list).not.toContainText("留著");
  await confirm.getByRole("button", { name: "刪除並移除 2 個捷徑" }).click();
  await expect(confirm).toBeHidden();
  await page.getByRole("tab", { name: "視窗" }).click();
  await expect(page.locator(".layer").filter({ hasText: "角色設定.txt" })).toHaveCount(0);
  await expect(page.locator(".layer").filter({ hasText: "Archive.exe" })).toHaveCount(1);
});

test("deleting a window that no shortcut points at needs no extra confirmation", async ({ page }) => {
  const document = withContent([], [S("a", null, "甲", "explorer")]);
  await openEditor(page, document);
  await deleteLoreWindow(page);
  await expect(page.getByRole("dialog", { name: /這項刪除會影響/ })).toHaveCount(0);
  await expect(page.locator(".layer").filter({ hasText: "角色設定.txt" })).toHaveCount(0);
});

test("the saved result renders on the public page with no broken shortcuts", async ({ page }) => {
  const document = withContent([], [S("link", null, "主角設定"), S("other", null, "備用", "spare")]);
  const spare = makeWindow("document", 2);
  spare.id = "spare"; spare.title = "備用設定.txt"; spare.defaultOpen = false;
  document.windows.push(spare);
  const { saves } = await openEditor(page, document);
  await deleteLoreWindow(page);
  await page.getByRole("button", { name: /刪除並移除 1 個捷徑/ }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.length).toBe(2);
  const saved = saves.at(-1)!.document;
  const visitor = await page.context().newPage();
  await visitor.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", published_document: { ...saved, windows: saved.windows.map((window) => window.id === "explorer" ? { ...window, defaultOpen: true } : window) }, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
  await visitor.setViewportSize({ width: 1440, height: 900 });
  await visitor.goto("/@demo");
  const win = visitor.getByRole("dialog", { name: "World.exe" });
  await expect(win.locator(".explorer-item")).toHaveCount(1);
  await expect(win.locator(".explorer-item").first()).toContainText("視窗：備用設定.txt");
  await expect(win).not.toContainText("目標已失效");
});

test("visitor: a single tap opens folders and shortcuts, broken shortcuts explain themselves, and mobile has no horizontal overflow", async ({ page }) => {
  const document = withContent([F("characters", null, "角色設定")], [S("lore-link", "characters", "主角完整設定"), S("dead", null, "壞掉的捷徑", "gone")]);
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "World.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "World.exe" });
  await expect(dialog.getByRole("button", { name: "⋯" })).toHaveCount(0); // no authoring controls for visitors
  await dialog.getByRole("button", { name: "壞掉的捷徑", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("目標已經不存在");
  await dialog.getByRole("button", { name: "角色設定", exact: true }).click();
  await dialog.getByRole("button", { name: "主角完整設定", exact: true }).click();
  await expect(page.locator(".visitor-mobile").getByRole("dialog", { name: "角色設定.txt" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("visitor search finds shortcuts across folders and shows where they live", async ({ page }) => {
  const document = withContent([F("characters", null, "角色設定")], [S("lore-link", "characters", "主角完整設定")]);
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "World.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "World.exe" });
  await dialog.getByRole("searchbox", { name: "搜尋捷徑" }).fill("主角");
  await expect(dialog.getByRole("list", { name: "搜尋結果" })).toContainText("桌面 / 角色設定");
  await dialog.getByRole("button", { name: /主角完整設定/ }).click();
  await expect(page.locator(".visitor-mobile").getByRole("dialog", { name: "角色設定.txt" })).toBeVisible();
});

test("phone editor: a tap opens an item, and select mode exposes a 44px action button for editing", async ({ page }) => {
  const { saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]), { width: 1440, height: 900 }).then(async (ctx) => { await page.getByRole("button", { name: "手機版" }).click(); return ctx; });
  const phone = page.locator(".visitor-mobile.framed");
  await phone.getByRole("button", { name: "World.exe", exact: true }).click();
  await phone.getByRole("button", { name: "編輯內容" }).click();
  await phone.getByRole("button", { name: "選取項目" }).click();
  await editorTile(phone, "主角設定").locator(".explorer-open").click();
  const more = phone.getByRole("button", { name: "項目操作" });
  const box = await more.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(phone.getByRole("menu")).toBeVisible();
  await phone.getByRole("menuitem", { name: "重新命名" }).click();
  await expect(phone.getByRole("textbox", { name: "捷徑名稱" })).toBeFocused();
  await page.keyboard.type("手機改名");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].label).toBe("手機改名");
  await phone.getByRole("button", { name: "選取項目" }).click();
  await editorTile(phone, "角色").locator(".explorer-open").click(); // tap opens the folder
  await expect(phone.getByRole("navigation", { name: "資料夾路徑" })).toContainText("角色");
});

test("folder depth and the per-window item limits are explained instead of failing silently", async ({ page }) => {
  const chain = Array.from({ length: 8 }, (_, index) => F(`n${index}`, index ? `n${index - 1}` : null, `層${index + 1}`));
  const { dialog } = await openEditor(page, withContent(chain, []));
  for (let index = 0; index < 8; index += 1) {
    await editorTile(dialog, `層${index + 1}`).locator(".explorer-open").press("Enter");
  }
  await dialog.getByRole("button", { name: /＋ 資料夾/ }).click();
  await expect(dialog.getByRole("alert")).toContainText("資料夾最多 8 層");
});

test("desktop visitor: shortcuts to windows are not flagged broken and open the target window", async ({ page }) => {
  const document = withContent([F("characters", null, "角色設定")], [S("lore-link", null, "主角完整設定"), S("inside", "characters", "資料夾內的捷徑")]);
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  const dialog = page.getByRole("dialog", { name: "World.exe" });
  const tile = dialog.locator(".explorer-item").filter({ hasText: "主角完整設定" });
  await expect(tile).toContainText("視窗：角色設定.txt");
  await expect(tile).not.toContainText("目標已失效");
  await expect(page.getByRole("dialog", { name: "角色設定.txt" })).toHaveCount(0); // target starts closed
  await dialog.getByRole("button", { name: "主角完整設定", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "角色設定.txt" })).toBeVisible();
  await expect(dialog.getByRole("status")).toBeHidden();
});

function socialExplorerDocument() {
  const explorer = makeWindow("explorer", 3);
  if (explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.id = "explorer"; explorer.title = "World.exe"; explorer.layout.desktop = { ...explorer.layout.desktop, x: 520, y: 30, w: 600, h: 520, z: 3 };
  const legacy = { ...structuredClone(documentFixture), windows: [igWindow(), explorer] };
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  const document = migrated.document;
  const profile = document.entities.profiles[0];
  const [post, other] = document.entities.posts;
  const world = document.windows.find((window) => window.type === "explorer");
  if (!world || world.type !== "explorer") throw new Error("explorer missing");
  world.content = {
    folders: [F("fans", null, "粉絲")],
    shortcuts: [
      { id: "to-post", parentId: "fans", label: "第一篇", order: 0, visibility: "published", target: { siteId: "site-1", id: post.id, kind: "post" } },
      { id: "to-other", parentId: null, label: "第二篇", order: 1, visibility: "published", target: { siteId: "site-1", id: other.id, kind: "post" } },
      { id: "to-profile", parentId: null, label: "主角", order: 2, visibility: "published", target: { siteId: "site-1", id: profile.id, kind: "profile" } }
    ]
  };
  return { document, postTitle: post.title };
}

test("320px author redirects an OC shortcut to an exact post, then tests it in visitor preview without writes", async ({ page }, info) => {
  const { document } = socialExplorerDocument();
  const post = document.entities.posts[0];
  const { saves } = await openEditor(page, document as unknown as SiteDocument);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.locator(".m-icon").getByText("World.exe", { exact: true }).click();
  await page.getByRole("button", { name: "編輯內容", exact: true }).click();
  const world = page.getByRole("dialog", { name: "World.exe", exact: true });
  await world.getByRole("button", { name: "選取項目" }).click();
  await editorTile(world, "主角").locator(".explorer-open").click();
  await world.getByRole("button", { name: "項目操作" }).click();
  await world.getByRole("menuitem", { name: "變更目標" }).click();
  const picker = page.getByRole("dialog", { name: "變更捷徑「主角」的目標", exact: true });
  await expect(picker.getByRole("option", { selected: true })).toContainText("Retro User");
  await expect(picker.locator(".folder-target-list")).toContainText("OC");
  await picker.getByRole("searchbox").fill(post.title);
  await picker.getByRole("option").filter({ hasText: post.title }).focus(); await page.keyboard.press("Enter");
  await expect(picker.getByRole("status")).toContainText(post.title);
  const box = await picker.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  await page.screenshot({ path: info.outputPath("retarget-picker-320.png") });
  await picker.getByRole("button", { name: "改指向這個", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts.find((shortcut) => shortcut.id === "to-profile")?.target).toEqual({ siteId: "site-1", kind: "post", id: post.id });
  expect(explorerContent(saves)?.shortcuts.find((shortcut) => shortcut.id === "to-profile")?.label).toBe("主角");
  const savedCount = saves.length;
  await page.locator(".m-tool", { hasText: "預覽" }).first().click();
  const preview = page.locator(".preview-overlay");
  await preview.locator(".m-icon").getByText("World.exe", { exact: true }).click();
  const trigger = preview.getByRole("button", { name: "主角", exact: true });
  await trigger.click();
  await expect(preview.locator(".ig-card")).toContainText(post.caption);
  await preview.locator(".m-back").click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Space"); await expect(preview.locator(".ig-card")).toContainText(post.caption);
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await preview.getByRole("button", { name: /回到編輯器/ }).click();
  await expect(page.locator("#root").getByRole("dialog", { name: "World.exe", exact: true })).toBeVisible();
  await page.waitForTimeout(1200); expect(saves).toHaveLength(savedCount);
});

test("deleting a post that shortcuts point at lists them, removes only those on confirm, and undo restores both", async ({ page }) => {
  const { document, postTitle } = socialExplorerDocument();
  const { saves } = await openEditor(page, document as unknown as SiteDocument);
  const ig = page.getByRole("dialog", { name: "Instagram.exe" });
  await ig.getByRole("tab", { name: "編輯" }).click();
  await ig.getByRole("button", { name: "編輯個人檔案", exact: true }).click();
  await ig.getByRole("tablist", { name: "OC 編輯分組" }).getByRole("tab", { name: "貼文", exact: true }).click(); // #57 groups the editor into sections
  await ig.getByRole("button", { name: "刪除貼文" }).first().click();
  const confirm = page.getByRole("dialog", { name: "這項刪除會影響 1 個捷徑" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("list", { name: "受影響的捷徑" })).toContainText("第一篇");
  await expect(confirm.getByRole("list", { name: "受影響的捷徑" })).toContainText(`貼文：${postTitle}`);
  await expect(confirm.getByRole("list", { name: "受影響的捷徑" })).toContainText("World.exe / 桌面 / 粉絲");
  await confirm.getByRole("button", { name: "取消" }).click();
  expect(saves.every((save) => (save.document as unknown as { entities: { posts: unknown[] } }).entities.posts.length === 2)).toBe(true);

  await ig.getByRole("button", { name: "刪除貼文" }).first().click();
  await page.getByRole("button", { name: "刪除並移除 1 個捷徑" }).click();
  const latest = () => saves.at(-1)?.document as unknown as { entities: { posts: Array<{ id: string }> }; windows: Array<{ type: string; content: { shortcuts?: Array<{ id: string }> } }> };
  await expect.poll(() => latest()?.entities.posts.length).toBe(1);
  expect(latest().windows.find((window) => window.type === "explorer")!.content.shortcuts!.map((shortcut) => shortcut.id)).toEqual(["to-other", "to-profile"]);
  await page.getByRole("button", { name: "復原" }).click();
  await expect.poll(() => latest()?.entities.posts.length).toBe(2);
  expect(latest().windows.find((window) => window.type === "explorer")!.content.shortcuts!.map((shortcut) => shortcut.id).sort()).toEqual(["to-other", "to-post", "to-profile"]);
});

test("phone editor: deleting a window that shortcuts point at asks first and fits at 390px", async ({ page }, testInfo) => {
  const document = withContent([], [S("link", null, "主角設定")]);
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: document, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saves.push(route.request().postDataJSON()); return route.fulfill({ json: { version: 2, updatedAt: "2026-10-17T00:01:00.000Z" } }); });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "角色設定.txt", exact: true }).click();
  await page.getByRole("button", { name: "編輯內容" }).click();
  await page.getByRole("button", { name: "完成" }).click();
  await page.locator(".m-toolbar").getByRole("button", { name: "視窗設定" }).click();
  await page.getByRole("button", { name: "刪除", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "這項刪除會影響 1 個捷徑" });
  await expect(confirm).toBeVisible();
  const box = await confirm.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  await page.screenshot({ path: testInfo.outputPath("integrity-dialog-phone-390.png") });
  await confirm.getByRole("button", { name: "刪除並移除 1 個捷徑" }).click();
  await expect.poll(() => saves.at(-1)?.document.windows.map((window) => window.id)).toEqual(["explorer"]);
  expect(explorerContent(saves)!.shortcuts).toEqual([]);
});

test("deleting a shortcut target cleans the canonical draft before save, reload and public projection", async ({ page }) => {
  const document = explorerDocument();
  const explorer = document.windows.find((window) => window.type === "explorer");
  if (!explorer || explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.content.shortcuts = [{ id: "lore-link", parentId: null, label: "主角設定", order: 0, visibility: "published", target: { siteId: "site-1", id: "lore", kind: "window" } }];

  const { saves } = await openEditor(page, document);
  await deleteLoreWindow(page);
  const confirmation = page.getByRole("dialog", { name: "這項刪除會影響 1 個捷徑" });
  await expect(confirmation.getByRole("list", { name: "受影響的捷徑" })).toContainText("主角設定");
  await confirmation.getByRole("button", { name: "刪除並移除 1 個捷徑" }).click();
  await expect(confirmation).toBeHidden();

  await expect.poll(() => {
    const saved = saves.at(-1)?.document;
    const savedExplorer = saved?.windows.find((window) => window.type === "explorer");
    return {
      hasTarget: saved?.windows.some((window) => window.id === "lore") ?? true,
      shortcuts: savedExplorer?.type === "explorer" ? savedExplorer.content.shortcuts.length : -1
    };
  }).toEqual({ hasTarget: false, shortcuts: 0 });

  const saved = saves.at(-1)?.document;
  if (!saved) throw new Error("expected an autosaved document");
  const projection = projectPublicSiteDocument(saved, "site-1");
  if (!projection.ok) throw new Error(`public projection failed: ${projection.code}`);

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "World.exe" });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.getByRole("button", { name: /主角設定/ })).toHaveCount(0);

  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: projection.document, published_version: projection.version, published_at: "2026-10-17T00:02:00.000Z" } } }));
  await page.goto("/@demo");
  const publicExplorer = page.locator(".visitor-desktop").getByRole("dialog", { name: "World.exe" });
  await expect(publicExplorer).toBeVisible();
  await expect(publicExplorer.getByRole("button", { name: /主角設定/ })).toHaveCount(0);
});

test("inline folder target draft cancels, applies once, and undo restores the shortcut", async ({ page }, testInfo) => {
  const document = withContent([], [S("link", null, "Keep this label")]);
  const second = makeWindow("document", 2); second.id = "next"; second.title = "Next target.txt"; second.defaultOpen = false; document.windows.push(second);
  const { dialog, saves } = await openEditor(page, canonicalFixture(document));
  const tile = dialog.locator('.folder-tree-editor .explorer-item[data-item="link"]');
  await dialog.locator(".retro-titlebar").click();
  await tile.getByRole("button", { name: "Keep this label" }).click();
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await page.getByRole("menuitem", { name: /變更目標/ }).click();
  let picker = page.getByRole("dialog", { name: /變更捷徑.*目標/ });
  await picker.getByRole("option", { name: /Next target.txt/ }).click();
  expect(saves).toHaveLength(0);
  await picker.getByRole("button", { name: "取消" }).click();
  expect(saves).toHaveLength(0);
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await page.getByRole("menuitem", { name: /變更目標/ }).click();
  picker = page.getByRole("dialog", { name: /變更捷徑.*目標/ });
  await picker.getByRole("option", { name: /Next target.txt/ }).click();
  await picker.getByRole("button", { name: "改指向這個" }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].target.id).toBe("next");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].target.id).toBe("lore");
  await page.screenshot({ path: testInfo.outputPath("folder-inline-desktop.png") });
});

test("inline folder selection, cut paste and folder delete remain canonical", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("a", null, "A"), S("b", null, "B")]));
  const a = dialog.locator('.folder-tree-editor .explorer-item[data-item="a"] .explorer-open');
  const b = dialog.locator('.folder-tree-editor .explorer-item[data-item="b"] .explorer-open');
  await a.click(); await b.click({ modifiers: ["Meta"] });
  await expect(a).toHaveAttribute("aria-pressed", "true"); await expect(b).toHaveAttribute("aria-pressed", "true");
  await b.press("Meta+x");
  await dialog.locator('.folder-tree .folder-tree-open').filter({ hasText: "角色" }).click();
  await dialog.getByRole("button", { name: /貼上 2 個到這裡/ }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts.map(item => item.parentId)).toEqual(["chars", "chars"]);
  await dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "桌面" }).click();
  await dialog.locator('.folder-tree-editor .explorer-item[data-item="chars"] .explorer-open').click();
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await page.getByRole("menuitem", { name: "刪除" }).click();
  const confirm = dialog.getByRole("alertdialog", { name: "刪除" });
  await expect(confirm).toContainText("2 個捷徑");
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(dialog.locator('.explorer-item[data-item="chars"]')).toBeVisible();
  await dialog.getByRole("button", { name: "項目操作" }).click();
  await page.getByRole("menuitem", { name: "刪除" }).click();
  await confirm.getByRole("button", { name: "刪除" }).click();
  await expect.poll(() => explorerContent(saves)?.folders.length).toBe(0);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect.poll(() => explorerContent(saves)?.folders.length).toBe(1);
});

for (const width of [1440, 320, 375, 390, 430]) {
  test(`inline folder target picker fits ${width}px and cancel keeps the canonical shortcut`, async ({ page }, testInfo) => {
    const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]), { width, height: 780 });
    if (width < 768) await dialog.getByRole("button", { name: "選取項目" }).click();
    const tile = editorTile(dialog, "主角設定").locator(".explorer-open");
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    const actions = dialog.getByRole("button", { name: "項目操作" });
    if (width < 768) expect((await actions.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await actions.click();
    await page.getByRole("menuitem", { name: "變更目標" }).click();
    const picker = dialog.getByRole("dialog", { name: /變更捷徑.*目標/ });
    await expect(picker.getByRole("option", { name: /角色設定.txt/ })).toHaveAttribute("aria-selected", "true");
    const box = await picker.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: testInfo.outputPath(`folder-picker-${width}.png`) });
    await picker.getByRole("searchbox").fill("沒有結果");
    await expect(picker.getByRole("option")).toHaveCount(0);
    await picker.getByRole("button", { name: "取消" }).click();
    await expect(actions).toBeFocused();
    expect(saves).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`folder-inline-${width}.png`) });
  });
}
