import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockColors } from "./appearance-p2-fixture";

async function setup(page: Page) {
  const site = await mockColors(page);
  await page.route("**/api/sites/site-1/assets", (route) => route.fulfill({ json: { assets: [{
    id: "legacy-image", url: "https://example.test/legacy.png", mimeType: "image/png", size: 10, kind: "image", name: "Legacy image", createdAt: "2026-10-19T00:00:00Z", storageScope: "legacy_public", migrationRequired: true
  }] } }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("button", { name: "轉為私有素材", exact: true })).toBeEnabled();
  return { site, title: page.locator("#editor-right-panel").getByRole("textbox").first() };
}
const upgrade = (route: Route) => route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required", message: "Upgrade required" } } });
const recovery = (page: Page) => page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true });
async function expectDisabledMigrationButtons(page: Page) {
  await expect(page.getByRole("button", { name: "轉為私有素材", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "查看是哪幾個", exact: true }).click();
  const inventory = page.getByRole("dialog", { name: "舊素材遷移明細", exact: true });
  await expect(inventory.getByRole("button", { name: "轉為私有（1）", exact: true })).toBeDisabled();
  await inventory.getByRole("button", { name: "關閉", exact: true }).click();
}

test("upgrade pause keeps both migration controls disabled after local editing becomes dirty", async ({ page }) => {
  let saves = 0, migrations = 0;
  const { title } = await setup(page);
  await page.route("**/api/sites/site-1/draft", (route) => { saves++; return upgrade(route); });
  await page.route("**/api/sites/site-1/assets/migrate", (route) => { migrations++; return route.fulfill({ status: 500 }); });
  await title.fill("Unsaved before pause");
  await recovery(page).getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
  await title.fill("Unsaved after pause");
  await expectDisabledMigrationButtons(page);
  await page.waitForTimeout(800);
  expect(saves).toBe(1); expect(migrations).toBe(0);
  await expect(title).toHaveValue("Unsaved after pause");
});

for (const point of ["save", "migration"] as const) {
  test(`migration action routes ${point} 426 to upgrade recovery without replacing local edits`, async ({ page }) => {
    const { title } = await setup(page);
    let saves = 0, migrations = 0;
    await page.route("**/api/sites/site-1/draft", (route) => { saves++; return upgrade(route); });
    await page.route("**/api/sites/site-1/assets/migrate", (route) => { migrations++; return upgrade(route); });
    if (point === "save") await title.fill("Dirty migration draft");
    await page.getByRole("button", { name: "查看是哪幾個", exact: true }).click();
    await page.getByRole("dialog", { name: "舊素材遷移明細", exact: true }).getByRole("button", { name: "轉為私有（1）", exact: true }).click();
    await expect(recovery(page)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "舊素材遷移明細", exact: true })).toHaveCount(0);
    expect(saves).toBe(point === "save" ? 1 : 0);
    expect(migrations).toBe(point === "migration" ? 1 : 0);
    await recovery(page).getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
    await title.fill("Retained after migration 426");
    await expectDisabledMigrationButtons(page);
    await page.waitForTimeout(800);
    expect(migrations).toBe(point === "migration" ? 1 : 0);
    await expect(title).toHaveValue("Retained after migration 426");
  });

  test(`pending migration ${point} success is ignored after a separate 426 pause`, async ({ page }) => {
    const { site, title } = await setup(page);
    let saves = 0, migrations = 0;
    let pending: Route | null = null;
    await page.route("**/api/sites/site-1/draft", async (route) => {
      saves++;
      if (point === "save" && saves === 1) { pending = route; return; }
      await upgrade(route);
    });
    await page.route("**/api/sites/site-1/assets/migrate", async (route) => {
      migrations++;
      if (point === "migration") { pending = route; return; }
      await route.fulfill({ json: { version: 2, document: site.saved(), migratedCount: 1, cleanupWarnings: [] } });
    });
    if (point === "save") await title.fill("Dirty migration snapshot");
    await page.getByRole("button", { name: "轉為私有素材", exact: true }).click();
    await expect.poll(() => !!pending).toBe(true);
    if (point === "migration") await title.fill("Unsaved during migration");
    await recovery(page).getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
    await title.fill("Newer local edits after pause");
    if (point === "save") await pending!.fulfill({ json: { version: 2, updatedAt: "2026-10-19T00:00:00Z" } });
    else await pending!.fulfill({ json: { version: 2, document: site.saved(), migratedCount: 1, cleanupWarnings: [] } });
    await expect(page.getByRole("button", { name: "轉為私有素材", exact: true })).toBeDisabled();
    await expect(title).toHaveValue("Newer local edits after pause");
    await page.getByRole("button", { name: "編輯器需要更新", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await recovery(page).getByRole("button", { name: "下載本機復原 JSON", exact: true }).click();
    const download = await downloadPromise;
    const local = JSON.parse(await readFile((await download.path())!, "utf-8"));
    expect(local.windows[0].title).toBe("Newer local edits after pause");
    expect(local.windows[0].appearance).toEqual(site.saved().windows[0].appearance);
    await recovery(page).getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
    await expect(page.getByRole("button", { name: "復原", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "復原", exact: true }).click();
    await expect(title).not.toHaveValue("Newer local edits after pause");
    await page.getByRole("button", { name: "重做", exact: true }).click();
    await expect(title).toHaveValue("Newer local edits after pause");
    await page.waitForTimeout(800);
    expect(saves).toBe(point === "save" ? 2 : 1);
    expect(migrations).toBe(point === "migration" ? 1 : 0);
  });
}
