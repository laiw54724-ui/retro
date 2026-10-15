import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

async function mockPublicSite(page: Page, publishedDocument = documentFixture) {
  await page.route("**/api/public/sites/demo", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        site: {
          username: "demo",
          site_name: "Demo Desk",
          published_document: publishedDocument,
          published_version: 1,
          published_at: "2026-10-15T00:00:00.000Z"
        }
      })
    });
  });
}

test("published image wallpaper covers the desktop without tiling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublicSite(page, {
    ...documentFixture,
    theme: {
      ...documentFixture.theme,
      pattern: "image",
      wallImage: "https://example.com/wallpaper.png"
    }
  });
  await page.goto("/@demo");

  const visitor = page.locator(".visitor-page");
  await expect(visitor).toHaveCSS("background-size", "cover");
  await expect(visitor).toHaveCSS("background-position", "50% 50%");
  await expect(visitor).toHaveCSS("background-repeat", "no-repeat");
});

test("landing page has no critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /把你的小宇宙/ })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const critical = results.violations.filter((violation) => violation.impact === "critical");
  expect(critical).toEqual([]);
});

test("desktop visitor can minimize, restore, close and reopen windows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublicSite(page);
  await page.goto("/@demo");

  const dialog = page.getByRole("dialog", { name: "About.exe" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "最小化" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".visitor-task-buttons").getByRole("button", { name: "About.exe" }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "最大化" }).click();
  await expect(dialog.getByRole("button", { name: "還原" })).toBeVisible();

  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toBeHidden();

  await page.locator(".visitor-icon").filter({ hasText: "About.exe" }).click();
  await expect(dialog).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`mobile visitor remains reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockPublicSite(page);
    await page.goto("/@demo");

    await expect(page.locator(".visitor-mobile")).toBeVisible();
    await page.locator(".visitor-mobile").getByRole("button", { name: "About.exe" }).click();
    await expect(page.locator(".visitor-mobile").getByRole("dialog", { name: "About.exe" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
