import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function gameDocument(rows = 5, columns = 5, mines = 1): SiteDocument {
  const game = makeWindow("minesweeper");
  game.id = "mines";
  game.title = "Minesweeper.exe";
  game.defaultOpen = true;
  game.content = { rows, columns, mines };
  game.layout.desktop = { ...game.layout.desktop, x: 40, y: 20, w: 520, h: 620, z: 2 };
  return { ...structuredClone(documentFixture), windows: [game] } as SiteDocument;
}

async function owner(page: Page, draft = gameDocument()) {
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    site.draft_version++;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: site.updated_at } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  return site;
}

for (const width of [320, 390]) {
test(`owner selects difficulties, customizes them, and reaches the board at ${width}px`, async ({ page }) => {
  const site = await owner(page);
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "Minesweeper.exe", exact: true }).click();
  await page.getByRole("button", { name: "編輯內容" }).click();
  const dialog = page.getByRole("dialog", { name: "Minesweeper.exe" });
  await dialog.getByRole("button", { name: "初級難度" }).click();
  await expect(dialog.getByRole("gridcell")).toHaveCount(25);
  await dialog.getByRole("button", { name: "中級難度" }).click();
  await expect(dialog.getByRole("gridcell")).toHaveCount(64);
  await dialog.getByRole("button", { name: "進階難度" }).click();
  await expect(dialog.getByRole("gridcell")).toHaveCount(144);
  const scroll = dialog.locator(".minesweeper-board-scroll");
  const first = dialog.getByRole("gridcell").first();
  await first.focus();
  for (let i = 0; i < 11; i++) await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("gridcell").nth(11)).toBeFocused();
  expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await dialog.getByRole("spinbutton", { name: "地雷" }).fill("20");
  await expect(dialog.getByRole("button", { name: "進階難度" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => {
    const saved = site.draft_document.windows.find((window) => window.type === "minesweeper");
    return saved?.type === "minesweeper" ? saved.content : null;
  }).toEqual({ rows: 12, columns: 12, mines: 20 });
  await page.reload();
  await page.getByRole("button", { name: "Minesweeper.exe", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Minesweeper.exe" }).getByRole("gridcell")).toHaveCount(144);
});
}

for (const outcome of ["lost", "won"] as const) {
  test(`visitor hears a truthful ${outcome} result from a deterministic board`, async ({ page }) => {
    await page.addInitScript(() => { Math.random = () => 0; });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: gameDocument(), published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
    await page.goto("/@demo");
    await page.locator(".visitor-mobile").getByRole("button", { name: "Minesweeper.exe" }).click();
    const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Minesweeper.exe" });
    const cells = dialog.getByRole("gridcell");
    await cells.nth(0).click();
    if (outcome === "lost") await cells.nth(1).click();
    else for (let i = 2; i < 25; i++) {
      if ((await dialog.getByRole("status").textContent())?.trim()) break;
      await cells.nth(i).click();
    }
    await expect(dialog.getByRole("status")).toContainText(outcome === "lost" ? "踩到地雷" : "已清除所有安全格");
    await expect(dialog.locator(".minesweeper-status strong")).toContainText(outcome === "lost" ? "踩雷" : "完成");
  });
}
