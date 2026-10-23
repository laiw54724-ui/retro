import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Page, type Route } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
async function signIn(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
}
async function openGame(page: Page, mobile: boolean) {
  await signIn(page);
  const game = makeWindow("minesweeper");
  game.id = "mines";
  game.defaultOpen = true;
  game.layout.desktop = { ...game.layout.desktop, x: 40, y: 20, w: 520, h: 620 };
  const draft = { ...structuredClone(documentFixture), windows: [game] } as SiteDocument;
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-19T00:00:00.000Z", access_role: "owner" };
  const saves: SiteDocument[] = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    saves.push(site.draft_document);
    return route.fulfill({ json: { version: ++site.draft_version, updatedAt: site.updated_at } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.goto("/editor/site-1");
  if (mobile) {
    await page.getByRole("button", { name: "Minesweeper.exe", exact: true }).click();
    await enterContentEditor(page);
  }
  const dialog = page.getByRole("dialog", { name: "Minesweeper.exe" });
  await expect(dialog.getByRole("spinbutton", { name: "列", exact: true })).toBeVisible();
  // Wait out initial v1 -> v2 migration before counting field saves.
  await expect.poll(() => site.draft_document.schemaVersion).toBe(2);
  return { dialog, saves, content: () => site.draft_document.windows[0].content };
}

for (const width of [1440, 320, 390, 430]) {
  test.describe(`numeric drafts ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 500, isMobile: width < 500 });
    test("clearing stays local until commit; touch blur, bounds and Escape work", async ({ page }, testInfo) => {
      const { dialog, saves, content } = await openGame(page, width < 500);
      const rows = dialog.getByRole("spinbutton", { name: "列", exact: true });
      const columns = dialog.getByRole("spinbutton", { name: "欄", exact: true });
      const mines = dialog.getByRole("spinbutton", { name: "地雷", exact: true });
      const baseline = saves.length;
      await rows.fill("");
      await expect(rows).toHaveValue("");
      await page.waitForTimeout(1100); // Exceed the 650ms autosave delay.
      expect(saves.length).toBe(baseline);
      await expect(dialog.getByRole("gridcell")).toHaveCount(64);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("numeric-draft-empty-390.png") });
      await rows.fill("1");
      await expect(rows).toHaveValue("1");
      await rows.fill("12");
      await rows.press("Enter");
      await expect(dialog.getByRole("gridcell")).toHaveCount(96);
      await expect.poll(content).toEqual({ rows: 12, columns: 8, mines: 10 });
      const committed = saves.length;
      await rows.fill("6");
      await rows.press("Escape");
      await expect(rows).toHaveValue("12");
      await expect(dialog).toBeVisible();
      await columns.fill("5");
      if (width < 500) await mines.tap(); else await mines.click();
      await expect.poll(content).toEqual({ rows: 12, columns: 5, mines: 10 });
      expect(saves.length).toBe(committed + 1);
      await mines.fill("0");
      await expect(mines).toHaveValue("0");
      await mines.press("Enter");
      await expect(mines).toHaveValue("1");
      await mines.fill("40");
      await mines.press("Enter");
      await expect(mines).toHaveValue("40");
      await rows.fill("5");
      await rows.press("Enter");
      await expect(mines).toHaveValue("24");
      await mines.fill("1.5");
      await mines.press("Enter");
      await expect(mines).toHaveValue("24");
      await rows.fill("");
      await rows.press("Tab");
      await expect(rows).toHaveValue("5");
      await columns.fill("99");
      await columns.press("Enter");
      await expect(columns).toHaveValue("12");
      await expect.poll(content).toEqual({ rows: 5, columns: 12, mines: 24 });
    });
  });
}

for (const width of [1440, 390]) {
  test.describe(`URL recovery ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 500, isMobile: width < 500 });
    test("network failure exposes retry without losing input", async ({ page }, testInfo) => {
      await signIn(page);
      let checks = 0;
      await page.route("**/api/usernames/*/availability", (route) => {
        checks++;
        return checks === 1 ? route.abort("failed") : route.fulfill({ json: { available: true } });
      });
      await page.goto("/onboarding");
      const url = page.getByPlaceholder("your-name");
      const next = page.getByRole("button", { name: "下一步 ›" });
      await url.fill("my-desktop");
      await page.getByLabel("桌面名稱").fill("Keep this name");
      const retry = page.getByRole("button", { name: "重試檢查" });
      await expect(retry).toBeVisible();
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("status")).toContainText("無法檢查網址");
      await expect(next).toBeDisabled();
      if (width === 390) await page.screenshot({ path: testInfo.outputPath("url-failure-390.png") });
      if (width < 500) await retry.tap(); else await retry.click();
      await expect(page.getByText("這個網址可以使用")).toBeVisible();
      await expect(url).toHaveValue("my-desktop");
      await expect(page.getByLabel("桌面名稱")).toHaveValue("Keep this name");
      await expect(next).toBeEnabled();
      expect(checks).toBe(2);
    });
  });
}

for (const late of ["available", "taken", "failed"] as const) {
  test(`late ${late} response cannot replace a newer name result`, async ({ page }) => {
    await signIn(page);
    let oldRoute: Route | undefined;
    const checks: string[] = [];
    await page.route("**/api/usernames/*/availability", (route) => {
      checks.push(route.request().url());
      if (route.request().url().includes("/old-name/")) { oldRoute = route; return; }
      return route.fulfill({ json: { available: late !== "available" } });
    });
    await page.goto("/onboarding");
    const url = page.getByPlaceholder("your-name");
    await url.fill("old-name");
    await expect.poll(() => !!oldRoute).toBe(true);
    await url.fill("intermediate");
    await url.fill("new-name");
    const message = late === "available" ? "這個網址已有人使用" : "這個網址可以使用";
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    if (late === "failed") await oldRoute!.abort("failed");
    else await oldRoute!.fulfill({ json: { available: late === "available" } });
    await page.waitForTimeout(400);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(url).toHaveValue("new-name");
    expect(checks).toHaveLength(2);
    if (late === "available") await expect(page.getByRole("button", { name: "下一步 ›" })).toBeDisabled();
    else await expect(page.getByRole("button", { name: "下一步 ›" })).toBeEnabled();
  });
}

test("numeric composition defers commit; undo/redo and presets replace canonical values", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog, saves, content } = await openGame(page, false);
  const rows = dialog.getByRole("spinbutton", { name: "列", exact: true });
  const baseline = saves.length;
  await rows.fill("10");
  await rows.dispatchEvent("compositionstart");
  await rows.press("Enter");
  await expect(rows).toBeFocused();
  await expect(dialog.getByRole("gridcell")).toHaveCount(64);
  await rows.evaluate((input) => (input as HTMLInputElement).blur());
  await page.waitForTimeout(1100);
  expect(saves.length).toBe(baseline);
  await rows.dispatchEvent("compositionend");
  await expect.poll(content).toEqual({ rows: 10, columns: 8, mines: 10 });
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(rows).toHaveValue("8");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(rows).toHaveValue("10");
  await dialog.getByRole("button", { name: "初級難度", exact: true }).click();
  await expect(rows).toHaveValue("5");
  await expect(dialog.getByRole("spinbutton", { name: "欄", exact: true })).toHaveValue("5");
  await expect(dialog.getByRole("spinbutton", { name: "地雷", exact: true })).toHaveValue("3");
  await expect.poll(content).toEqual({ rows: 5, columns: 5, mines: 3 });
  const committed = saves.length;
  await rows.fill("5");
  await rows.press("Enter");
  await page.waitForTimeout(1100);
  expect(saves.length).toBe(committed);
});

test("failed retry and a late retry result preserve the current name and pending guard", async ({ page }) => {
  await signIn(page);
  let checks = 0;
  let retryRoute: Route | undefined;
  await page.route("**/api/usernames/*/availability", (route) => {
    checks++;
    if (checks <= 2) return route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "offline" } } });
    retryRoute = route;
  });
  await page.goto("/onboarding");
  const url = page.getByPlaceholder("your-name");
  const next = page.getByRole("button", { name: "下一步 ›" });
  const retry = page.getByRole("button", { name: "重試檢查" });
  await url.fill("retry-name");
  await expect(retry).toBeVisible();
  await url.fill("RETRY-NAME"); // #117 also applies to failed checks.
  await expect(retry).toBeVisible();
  expect(checks).toBe(1);
  await retry.click();
  await expect(retry).toBeVisible();
  expect(checks).toBe(2);
  await retry.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => !!retryRoute).toBe(true);
  await expect(next).toBeDisabled();
  await expect(retry).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("正在檢查...");
  expect(checks).toBe(3);
  await url.fill("ab");
  await expect(page.getByRole("status")).toHaveText("網址格式不符合規則");
  await retryRoute!.fulfill({ json: { available: true } });
  await page.waitForTimeout(400);
  await expect(next).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("網址格式不符合規則");
  expect(checks).toBe(3);
});
