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

async function openEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: explorerDocument(), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocument };
    saves.push(body); site.draft_document = structuredClone(body.document); site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const dialog = page.getByRole("dialog", { name: "World.exe" });
  await expect(dialog).toBeVisible();
  return { dialog, saves };
}

test("author builds nested folders, creates duplicate target shortcuts and reloads", async ({ page }) => {
  const { dialog, saves } = await openEditor(page);
  await dialog.getByRole("button", { name: "＋資料夾" }).click();
  await dialog.getByRole("textbox", { name: "新資料夾 名稱" }).fill("角色設定");
  await dialog.getByRole("button", { name: /角色設定/ }).click();
  await dialog.getByRole("button", { name: "＋資料夾" }).click();
  await dialog.getByRole("textbox", { name: "新資料夾 名稱" }).fill("主角組");
  await dialog.getByRole("combobox", { name: "新增內容捷徑" }).selectOption("window|lore");
  await dialog.getByRole("button", { name: "← 返回" }).click();
  await dialog.getByRole("combobox", { name: "新增內容捷徑" }).selectOption("window|lore");
  await expect.poll(() => {
    const explorer = saves.at(-1)?.document.windows.find((window) => window.type === "explorer");
    return explorer?.type === "explorer" ? { folders: explorer.content.folders.length, shortcuts: explorer.content.shortcuts.length } : null;
  }).toEqual({ folders: 2, shortcuts: 2 });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "World.exe" }).getByRole("button", { name: "角色設定", exact: true })).toBeVisible();
});

test("visitor searches and opens a shortcut without horizontal overflow on mobile", async ({ page }) => {
  const document = explorerDocument();
  const explorer = document.windows.find((window) => window.type === "explorer");
  if (!explorer || explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.content.folders = [{ id: "characters", parentId: null, name: "角色設定", order: 0, visibility: "published" }];
  explorer.content.shortcuts = [{ id: "lore-link", parentId: "characters", label: "主角完整設定", order: 0, visibility: "published", target: { siteId: "site-1", id: "lore", kind: "window" } }];
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "World.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "World.exe" });
  await dialog.getByRole("searchbox", { name: "搜尋捷徑" }).fill("主角");
  await dialog.getByRole("button", { name: /主角完整設定/ }).click();
  await expect(page.locator(".visitor-mobile").getByRole("dialog", { name: "角色設定.txt" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
