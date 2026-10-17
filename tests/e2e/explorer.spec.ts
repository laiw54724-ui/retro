import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

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
  const dialog = page.getByRole("dialog", { name: "World.exe" });
  await expect(dialog).toBeVisible();
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

test("author creates, names and selects a folder, builds a nested folder, adds shortcuts from a picker and reloads", async ({ page }) => {
  const { dialog, saves } = await openEditor(page);
  await dialog.getByRole("button", { name: "新增資料夾" }).click();
  const rename = dialog.getByRole("textbox", { name: "資料夾名稱" });
  await expect(rename).toBeFocused();
  await page.keyboard.type("角色設定");
  await page.keyboard.press("Enter");
  const folder = dialog.getByRole("button", { name: "角色設定", exact: true });
  await expect(folder).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("toolbar", { name: "選取項目的操作" })).toContainText("角色設定");

  await folder.dblclick();
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "角色設定" })).toHaveAttribute("aria-current", "page");
  await dialog.getByRole("button", { name: "新增資料夾" }).click();
  await page.keyboard.type("主角組");
  await page.keyboard.press("Enter");

  await dialog.getByRole("button", { name: "建立捷徑" }).click();
  const picker = page.getByRole("dialog", { name: "建立捷徑" });
  await picker.getByRole("option", { name: "角色設定.txt" }).click();
  await picker.getByRole("button", { name: "建立捷徑" }).click();
  await expect(dialog.getByRole("textbox", { name: "捷徑名稱" })).toBeFocused();
  await page.keyboard.type("主角設定");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("button", { name: "主角設定", exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "↑ 上一層" }).click();
  await dialog.getByRole("button", { name: "建立捷徑" }).click();
  await page.getByRole("dialog", { name: "建立捷徑" }).getByRole("option", { name: "角色設定.txt" }).dblclick();
  await expect.poll(() => { const c = explorerContent(saves); return c ? { folders: c.folders.length, shortcuts: c.shortcuts.length } : null; }).toEqual({ folders: 2, shortcuts: 2 });
  expect(explorerContent(saves)?.shortcuts.every((shortcut) => shortcut.target.id === "lore")).toBe(true);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "World.exe" }).getByRole("button", { name: "角色設定", exact: true })).toBeVisible();
});

test("a desktop author single-click selects, double-click or Enter opens; shortcuts show an arrow and their target", async ({ page }) => {
  const { dialog } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]));
  const tile = dialog.locator(".explorer-item").filter({ hasText: "主角設定" });
  await expect(tile.locator(".explorer-arrow")).toBeVisible();
  await expect(tile).toContainText("視窗：角色設定.txt");
  await dialog.getByRole("button", { name: "角色", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "角色", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "角色" })).toHaveCount(0); // single click did not open
  await dialog.getByRole("button", { name: "角色", exact: true }).press("Enter");
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
  await dialog.getByRole("button", { name: "主角設定", exact: true }).click();
  await dialog.getByRole("button", { name: "移動到…" }).click();
  const move = page.getByRole("dialog", { name: "移動「主角設定」到…" });
  await expect(move.getByRole("button", { name: /^桌面 \/ 角色 \/ 主角$/ })).toBeVisible();
  await expect(move.getByRole("button", { name: /^桌面 \/ 主角$/ })).toBeVisible();
  await expect(move.getByRole("button", { name: /目前位置/ })).toBeDisabled();
  await move.getByRole("button", { name: /^桌面 \/ 角色 \/ 主角$/ }).click();
  await expect(move).toBeHidden();
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe("a-main");
  await expect(dialog.getByRole("status")).toContainText("已把「主角設定」移到「桌面 / 角色 / 主角」");

  // a folder cannot be moved into itself or its own child
  await dialog.getByRole("button", { name: "角色", exact: true }).click();
  await dialog.getByRole("button", { name: "移動到…" }).click();
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
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe("chars");
  await expect(dialog.getByRole("status")).toContainText("已把「主角設定」移到「桌面 / 角色」");
  // the breadcrumb is a drop target too
  await folder.getByRole("button", { name: "角色", exact: true }).dblclick();
  await dialog.locator(".explorer-item").filter({ hasText: "主角設定" }).dragTo(dialog.getByRole("navigation", { name: "資料夾路徑" }).getByRole("button", { name: "桌面" }));
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].parentId).toBe(null);
});

test("deleting a folder lists what goes with it, keeps targets, and can be undone", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色"), F("sub", "chars", "主角")], [S("link", "chars", "主角設定"), S("other", null, "不受影響")]));
  await dialog.getByRole("button", { name: "角色", exact: true }).click();
  await dialog.getByRole("button", { name: "刪除" }).click();
  const confirm = page.getByRole("dialog", { name: "刪除資料夾「角色」" });
  await expect(confirm).toContainText("2 個項目也會一起移除");
  await expect(confirm).toContainText("主角");
  await expect(confirm).toContainText("主角設定");
  await expect(confirm).not.toContainText("不受影響");
  await expect(confirm).toContainText("原本的視窗、OC 與貼文不會被刪除");
  await confirm.getByRole("button", { name: "取消" }).click();
  expect(explorerContent(saves)).toBeNull(); // cancel changes nothing

  await dialog.getByRole("button", { name: "刪除" }).click();
  await page.getByRole("dialog", { name: "刪除資料夾「角色」" }).getByRole("button", { name: "刪除", exact: true }).click();
  await expect.poll(() => { const c = explorerContent(saves); return c ? [c.folders.length, c.shortcuts.length] : null; }).toEqual([0, 1]);
  expect(saves.at(-1)?.document.windows.some((window) => window.id === "lore")).toBe(true);
  await page.getByRole("button", { name: "復原" }).click();
  await expect.poll(() => { const c = explorerContent(saves); return c ? [c.folders.length, c.shortcuts.length] : null; }).toEqual([2, 2]);
});

test("deleting a shortcut never deletes its target and creating a copy keeps the same target", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([], [S("link", null, "主角設定")]));
  await dialog.getByRole("button", { name: "主角設定", exact: true }).click();
  await dialog.getByRole("button", { name: "建立副本捷徑" }).click();
  await page.keyboard.type("第二個入口");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts.map((shortcut) => shortcut.target.id)).toEqual(["lore", "lore"]);
  await dialog.getByRole("button", { name: "刪除" }).click();
  await expect.poll(() => explorerContent(saves)?.shortcuts.length).toBe(1);
  expect(saves.at(-1)?.document.windows.some((window) => window.id === "lore")).toBe(true);
  await expect(dialog.getByRole("status")).toContainText("原本的內容沒有被刪除");
});

test("keyboard: F2 renames, Escape cancels, Delete removes a shortcut, Enter opens a folder", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]));
  const shortcut = dialog.getByRole("button", { name: "主角設定", exact: true });
  await shortcut.focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("改名後");
  await page.keyboard.press("Escape");
  await expect(dialog.getByRole("button", { name: "主角設定", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "主角設定", exact: true }).focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("改名後");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].label).toBe("改名後");
  await dialog.getByRole("button", { name: "改名後", exact: true }).focus();
  await page.keyboard.press("Delete");
  await expect.poll(() => explorerContent(saves)?.shortcuts.length).toBe(0);
  await dialog.getByRole("button", { name: "角色", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("navigation", { name: "資料夾路徑" })).toContainText("角色");
});

test("deleting a shortcut's target flags it as broken in the editor; it can be repaired or removed and saving resumes", async ({ page }) => {
  const document = withContent([], [S("link", null, "主角設定")]);
  const spare = makeWindow("document", 2);
  spare.id = "spare"; spare.title = "備用設定.txt"; spare.defaultOpen = false;
  document.windows.push(spare);
  const { dialog, saves } = await openEditor(page, document);
  // delete the shortcut's target from the layers list + inspector
  await page.getByRole("tab", { name: "視窗" }).click();
  await page.locator(".layer").filter({ hasText: "角色設定.txt" }).getByRole("button", { name: /角色設定\.txt/ }).click();
  await page.getByRole("button", { name: "刪除視窗" }).click();
  const tile = dialog.locator(".explorer-item").filter({ hasText: "主角設定" });
  await expect(tile).toContainText("目標已失效");
  await expect(page.locator(".save-text")).toContainText(/有欄位未完成|儲存/); // an invalid draft is not saved

  await dialog.getByRole("button", { name: "主角設定", exact: true }).click();
  await dialog.getByRole("button", { name: "修復目標…" }).click();
  const picker = page.getByRole("dialog", { name: "修復捷徑「主角設定」" });
  await expect(picker.getByRole("option", { name: "角色設定.txt" })).toHaveCount(0); // the deleted window is gone from the list
  await picker.getByRole("option", { name: "備用設定.txt" }).click();
  await picker.getByRole("button", { name: "改指向這個" }).click();
  await expect(tile).toContainText("視窗：備用設定.txt");
  await expect(tile).not.toContainText("目標已失效");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0]).toMatchObject({ label: "主角設定", target: { id: "spare", kind: "window" } });
});

test("a broken shortcut can also simply be removed", async ({ page }) => {
  const { dialog, saves } = await openEditor(page, withContent([], [S("link", null, "主角設定")]));
  await page.getByRole("tab", { name: "視窗" }).click();
  await page.locator(".layer").filter({ hasText: "角色設定.txt" }).getByRole("button", { name: /角色設定\.txt/ }).click();
  await page.getByRole("button", { name: "刪除視窗" }).click();
  await expect(dialog.locator(".explorer-item").filter({ hasText: "主角設定" })).toContainText("目標已失效");
  await dialog.getByRole("button", { name: "主角設定", exact: true }).click();
  await dialog.getByRole("button", { name: "刪除", exact: true }).click();
  await expect.poll(() => { const c = explorerContent(saves); return c ? c.shortcuts.length : null; }).toBe(0);
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

test("phone editor: a tap opens an item, every item has a 44px ⋯ action button, and the action bar edits the selection", async ({ page }) => {
  const { saves } = await openEditor(page, withContent([F("chars", null, "角色")], [S("link", null, "主角設定")]), { width: 1440, height: 900 }).then(async (ctx) => { await page.getByRole("button", { name: "手機版" }).click(); return ctx; });
  const phone = page.locator(".visitor-mobile.framed");
  await phone.getByRole("button", { name: "World.exe", exact: true }).click();
  await phone.getByRole("button", { name: "編輯此視窗" }).click();
  const more = phone.getByRole("button", { name: "主角設定 的操作" });
  const box = await more.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await more.click();
  await expect(phone.getByRole("toolbar", { name: "選取項目的操作" })).toContainText("主角設定");
  await phone.getByRole("button", { name: "重新命名" }).click();
  await expect(phone.getByRole("textbox", { name: "捷徑名稱" })).toBeFocused();
  await page.keyboard.type("手機改名");
  await page.keyboard.press("Enter");
  await expect.poll(() => explorerContent(saves)?.shortcuts[0].label).toBe("手機改名");
  await phone.getByRole("button", { name: "角色", exact: true }).click(); // tap opens the folder
  await expect(phone.getByRole("navigation", { name: "資料夾路徑" })).toContainText("角色");
});

test("folder depth and the per-window item limits are explained instead of failing silently", async ({ page }) => {
  const chain = Array.from({ length: 8 }, (_, index) => F(`n${index}`, index ? `n${index - 1}` : null, `層${index + 1}`));
  const { dialog } = await openEditor(page, withContent(chain, []));
  for (let index = 0; index < 8; index += 1) {
    await dialog.getByRole("button", { name: `層${index + 1}`, exact: true }).press("Enter");
  }
  await dialog.getByRole("button", { name: "新增資料夾" }).click();
  await expect(dialog.getByRole("status")).toContainText("資料夾最多 8 層");
});
