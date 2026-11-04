import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

function toysDocument() {
  const minesweeper = makeWindow("minesweeper");
  minesweeper.id = "mines";
  minesweeper.title = "Minesweeper.exe";
  minesweeper.defaultOpen = false;
  minesweeper.layout.desktop = { ...minesweeper.layout.desktop, x: 40, y: 40, w: 520, h: 560, z: 2 };
  const character = makeWindow("character-dialog", 1);
  character.id = "welcome";
  character.title = "Welcome.exe";
  character.defaultOpen = false;
  character.content = {
    ...character.content,
    characterName: "被被子",
    message: "<script>不可以執行</script> 歡迎來到雪國。",
    linkLabel: "角色首頁",
    linkUrl: "https://example.com/oc",
    autoShow: true
  };
  character.layout.desktop = { ...character.layout.desktop, x: 100, y: 80, w: 420, h: 360, z: 3 };
  return { ...structuredClone(documentFixture), windows: [minesweeper, character] } as SiteDocument;
}

async function mockPublicSite(page: Page, document = toysDocument()) {
  let writes = 0;
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.route("**/api/sites/**", (route) => { writes += 1; return route.fulfill({ status: 500, json: { error: "visitor must not write" } }); });
  return () => writes;
}

test("desktop character welcome is plain text, closable and shown only on initial visit", async ({ page }) => {
  const writes = await mockPublicSite(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  const dialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Welcome.exe" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("<script>不可以執行</script>");
  await expect(dialog.getByRole("link", { name: "角色首頁" })).toHaveAttribute("href", "https://example.com/oc");
  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toBeHidden();
  await page.locator(".visitor-desktop .visitor-icon").filter({ hasText: "Minesweeper.exe" }).click();
  await expect(page.locator(".visitor-desktop").getByRole("dialog", { name: "Minesweeper.exe" })).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(writes()).toBe(0);
});

test("minesweeper first click is safe and supports keyboard flagging", async ({ page }) => {
  const document = toysDocument();
  const welcome = document.windows.find((window) => window.type === "character-dialog");
  if (welcome?.type === "character-dialog") welcome.content.autoShow = false;
  const writes = await mockPublicSite(page, document);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  await page.locator(".visitor-desktop .visitor-icon").filter({ hasText: "Minesweeper.exe" }).click();
  const dialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Minesweeper.exe" });
  const cells = dialog.getByRole("gridcell");
  await cells.first().click();
  await expect(cells.first()).not.toContainText("💣");
  const availableTarget = dialog.locator('[role="gridcell"][aria-label*="未開啟"]').first();
  const targetId = await availableTarget.getAttribute("id");
  if (!targetId) throw new Error("missing flag target id");
  const flagTarget = dialog.locator(`#${targetId}`);
  await flagTarget.focus();
  await page.keyboard.press("f");
  await expect(flagTarget).toHaveAttribute("aria-label", /已標記/);
  await expect(dialog.locator(".minesweeper-status span")).toHaveText(/00[1-9]/, { timeout: 3_000 });
  await dialog.getByRole("button", { name: "最小化" }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(1_100);
  await page.locator(".visitor-taskbar").getByRole("button", { name: /Minesweeper\.exe/ }).click();
  await expect(dialog.locator(".minesweeper-status span")).toHaveText("000");
  expect(writes()).toBe(0);
});

test("mobile auto-opens the welcome and exposes touch flag mode without overflow", async ({ page }) => {
  const writes = await mockPublicSite(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  const welcome = page.locator(".visitor-mobile").getByRole("dialog", { name: "Welcome.exe" });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "關閉" }).click();
  await page.locator(".visitor-mobile").getByRole("button", { name: "Minesweeper.exe" }).click();
  const game = page.locator(".visitor-mobile").getByRole("dialog", { name: "Minesweeper.exe" });
  const flagMode = game.getByRole("button", { name: "🚩 手機標記模式" });
  await flagMode.click();
  await game.getByRole("gridcell").first().click();
  await expect(game.getByRole("gridcell").first()).toHaveAttribute("aria-label", /已標記/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(writes()).toBe(0);
});
