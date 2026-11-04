import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { mockColors } from "./appearance-p2-fixture";

for (const [label, advertisement, visible] of [
  ["missing", undefined, false], ["unknown", { appearanceP2: 2 }, false], ["wrong type", { appearanceP2: "1" }, false], ["compatible", { appearanceP2: 1 }, true]
] as const) {
  test(`appearance controls require current API advertisement: ${label}`, async ({ page }) => {
    test.skip(process.env.VITE_APPEARANCE_P2_WRITER !== "true", "Local opted-in writer harness");
    await mockColors(page, { advertisement });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.goto("/editor/site-1");
    await page.getByRole("button", { name: "First.exe", exact: true }).click();
    await page.getByRole("button", { name: "視窗設定", exact: true }).click();
    await expect(page.locator("[data-appearance-p2-writer]")).toHaveCount(visible ? 1 : 0);
  });
}

test("426 pauses saves/publishing, retains canonical edits, and recovers without replacing this tab", async ({ page }, testInfo) => {
  const site = await mockColors(page);
  let writes = 0;
  let capability: unknown;
  await page.route("**/api/sites/site-1/draft", (route) => {
    writes++; capability = route.request().postDataJSON().clientAppearanceContract;
    return route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required", message: "Upgrade required" } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("dialog", { name: "First.exe", exact: true }).locator(".retro-titlebar").click();
  const title = page.locator("#editor-right-panel").getByRole("textbox").first();
  await title.fill("Local unsaved title");
  const recovery = page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true });
  await expect(recovery).toBeVisible();
  expect(capability).toBe(1);
  await recovery.getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
  await title.fill("More local edits after 426");
  await page.waitForTimeout(900);
  expect(writes).toBe(1);
  await expect(page.getByRole("button", { name: "重試儲存", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "編輯器需要更新", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await recovery.getByRole("button", { name: "下載本機復原 JSON", exact: true }).click();
  const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, "utf-8"));
  expect(backup.schemaVersion).toBe(2);
  expect(backup.windows[0].title).toBe("More local edits after 426");
  expect(backup.windows[0].appearance).toEqual(site.saved().windows[0].appearance);
  expect(backup.theme.appearance).toEqual(site.saved().theme.appearance);
  await recovery.getByRole("button", { name: "檢查更新後的伺服器", exact: true }).click();
  const fresh = recovery.getByRole("link", { name: "在新分頁開啟最新編輯器", exact: true });
  await expect(fresh).toHaveAttribute("target", "_blank");
  await expect(fresh).toHaveAttribute("href", "/editor/site-1");
  await expect(title).toHaveValue("More local edits after 426");
  await page.screenshot({ path: testInfo.outputPath("appearance-upgrade-recovery.png") });
  await recovery.getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "More local edits after 426", exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test("recovery stays closed to an unknown server without dropping local edits", async ({ page }) => {
  await mockColors(page, { advertisement: { appearanceP2: 2 } });
  let writes = 0;
  await page.route("**/api/sites/site-1/draft", (route) => { writes++; return route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required" } } }); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("dialog", { name: "First.exe", exact: true }).locator(".retro-titlebar").click();
  const title = page.locator("#editor-right-panel").getByRole("textbox").first();
  await title.fill("Retained for unknown API");
  const recovery = page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true });
  await recovery.getByRole("button", { name: "檢查更新後的伺服器", exact: true }).click();
  await expect(recovery.getByRole("link")).toHaveCount(0);
  await expect(recovery.getByRole("status")).toContainText("本機編輯保持不變");
  await expect(title).toHaveValue("Retained for unknown API");
  expect(writes).toBe(1);
});

for (const point of ["publish", "retry"] as const) {
  test(`426 during ${point} stops publish retry controls`, async ({ page }) => {
    await mockColors(page);
    let publishes = 0, retries = 0;
    await page.route("**/api/sites/site-1/publish", (route) => {
      publishes++;
      return point === "publish"
        ? route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required" } } })
        : route.fulfill({ json: { publishedVersion: 1, publishedAt: "2026-10-19T00:00:00Z", url: "/@demo", artifactStatus: "failed", retryable: true } });
    });
    await page.route("**/api/sites/site-1/publish/retry", (route) => { retries++; return route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required" } } }); });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/editor/site-1");
    await page.getByRole("button", { name: "發布", exact: true }).click();
    await page.getByRole("button", { name: "確認發布", exact: true }).click();
    if (point === "retry") await page.getByRole("button", { name: "重試同步", exact: true }).click();
    await expect(page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    expect(publishes).toBe(1);
    expect(retries).toBe(point === "retry" ? 1 : 0);
    await expect(page.getByRole("button", { name: "重試同步", exact: true })).toHaveCount(0);
  });
}
