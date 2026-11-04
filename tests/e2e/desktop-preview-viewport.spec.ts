import { expect, test, type Locator, type Page } from "@playwright/test";
import { migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
async function editor(page: Page, role: "owner" | "viewer" = "owner") {
  const migrated = migrateSiteDocumentV2(documentFixture, { siteId: "viewport-site" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration");
  let writes = 0;
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/viewport-site", (route) => route.fulfill({ json: { site: { id: "viewport-site", username: "demo", site_name: "Viewport", draft_document: migrated.document, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00Z", access_role: role } } }));
  await page.route("**/api/sites/viewport-site/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/viewport-site/draft", (route) => { writes++; return route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00Z" } }); });
  await page.goto("/editor/viewport-site");
  if (role === "owner") {
    await expect(page.locator(".canvas-window, .m-screen").first()).toBeVisible();
    await openOwner(page);
  } else await expect(page.locator(".draft-viewer")).toBeVisible();
  return () => writes;
}
async function openOwner(page: Page) {
  const mobile = page.locator(".m-tool", { hasText: "預覽" });
  if (await mobile.first().isVisible()) await mobile.first().click();
  else await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  await expect(page.locator(".preview-overlay")).toBeVisible();
}
const device = (page: Page, name: RegExp) => page.locator(".preview-bar .device-toggle, .draft-viewer-bar .device-toggle").getByRole("button", { name });
const viewport = (page: Page) => page.locator("[data-desktop-preview-viewport]");
const region = (page: Page) => viewport(page).getByRole("region", { name: "桌面預覽畫布" });
const fit = (page: Page) => viewport(page).getByRole("button", { name: "適合畫面", exact: true });
const actual = (page: Page) => viewport(page).getByRole("button", { name: "100%", exact: true });
const scale = async (page: Page) => Number(await viewport(page).getAttribute("data-preview-scale"));
const scroll = (page: Page) => region(page).evaluate((node) => ({ left: node.scrollLeft, top: node.scrollTop }));
async function windowGeometry(win: Locator) { return win.evaluate((node) => { const style = (node as HTMLElement).style; return { x: parseFloat(style.left), y: parseFloat(style.top), w: parseFloat(style.width), h: parseFloat(style.height) }; }); }
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox(); if (!box) throw new Error("drag target missing");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 6 }); await page.mouse.up();
}

for (const zoom of ["fit", "150%"] as const) {
test(`${zoom} at phone size: real scaled drag and resize change visitor geometry only`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await editor(page);
  await device(page, /桌面版/).click();
  if (zoom === "150%") {
    await actual(page).click();
    await viewport(page).getByRole("button", { name: "放大桌面", exact: true }).click({ clickCount: 2 });
  }
  const win = viewport(page).locator(".visitor-window").filter({ hasText: "About.exe" });
  const initial = await windowGeometry(win), factor = await scale(page);
  if (zoom === "fit") expect(factor).toBeLessThan(1);
  else expect(factor).toBe(1.5);
  await drag(page, win.locator(".retro-titlebar .retro-title-text"), 100 * factor, 60 * factor);
  const moved = await windowGeometry(win);
  expect(moved.x - initial.x).toBeCloseTo(100, 0); expect(moved.y - initial.y).toBeCloseTo(60, 0);
  await drag(page, win.locator(".window-resize-handle"), 80 * factor, 60 * factor);
  const resized = await windowGeometry(win);
  expect(resized.w - moved.w).toBeCloseTo(80, 0); expect(resized.h - moved.h).toBeCloseTo(60, 0);
  await page.keyboard.press("Escape"); await expect(viewport(page)).toHaveCount(0);
  await openOwner(page); await device(page, /桌面版/).click();
  expect(await windowGeometry(viewport(page).locator(".visitor-window").filter({ hasText: "About.exe" }))).toEqual(initial);
  await page.waitForTimeout(1200);
  expect(writes()).toBe(0);
});
}

for (const width of [320, 390, 430, 767, 768]) {
  test(`owner zoom/pan controls remain reachable at ${width}px; view state survives device choice`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const writes = await editor(page);
    const historyBefore = await page.evaluate(() => ({ length: history.length, state: history.state }));
    if (width < 768) { await expect(page.locator(".preview-overlay .m-screen")).toBeVisible(); await device(page, /桌面版/).click(); }
    await expect(fit(page)).toHaveAttribute("aria-pressed", "true");
    const canvas = viewport(page).locator("[data-desktop-preview-canvas]");
    const bounds = await canvas.boundingBox(), host = await region(page).boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(host!.width + 1); expect(bounds!.height).toBeLessThanOrEqual(host!.height + 1);
    if ([320, 390, 430, 768].includes(width)) await page.screenshot({ path: testInfo.outputPath(`desktop-fit-${width}.png`) });
    await actual(page).click(); expect(await scale(page)).toBe(1);
    if (width === 320) await page.screenshot({ path: testInfo.outputPath("desktop-100-320.png") });
    await region(page).focus(); const before = await scroll(page); await page.keyboard.press("ArrowRight");
    expect((await scroll(page)).left).toBeGreaterThan(before.left);
    await viewport(page).getByRole("button", { name: "平移", exact: true }).click();
    const panBefore = await scroll(page);
    await drag(page, region(page), -40, -20);
    expect((await scroll(page)).left).toBeGreaterThan(panBefore.left);
    await device(page, /手機版/).click(); await expect(viewport(page)).toHaveCount(0);
    await device(page, /桌面版/).click(); expect(await scale(page)).toBe(1);
    await expect(viewport(page).getByRole("button", { name: "平移", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await scroll(page)).left).toBeGreaterThan(panBefore.left);
    await fit(page).click(); expect(await scale(page)).toBeLessThan(1);
    await page.waitForTimeout(1000); expect(writes()).toBe(0);
    expect(await page.evaluate(() => ({ length: history.length, state: history.state }))).toEqual(historyBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("bounded zoom, explicit desktop through rotation, Escape/focus and Back/reopen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/"); const opener = page.getByRole("button", { name: /開啟互動範例/ }).first(); await opener.click();
  await device(page, /桌面版/).click();
  const plus = viewport(page).getByRole("button", { name: "放大桌面", exact: true });
  const minus = viewport(page).getByRole("button", { name: "縮小桌面", exact: true });
  await actual(page).click(); for (let i = 0; i < 4; i++) await plus.click();
  expect(await scale(page)).toBe(2); await expect(plus).toBeDisabled();
  for (let i = 0; i < 7; i++) await minus.click();
  expect(await scale(page)).toBe(.25); await expect(minus).toBeDisabled();
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(device(page, /桌面版/)).toHaveAttribute("aria-pressed", "true");
  await fit(page).click();
  const canvas = await viewport(page).locator("[data-desktop-preview-canvas]").boundingBox(), host = await region(page).boundingBox();
  expect(canvas!.height).toBeLessThanOrEqual(host!.height + 1);
  await page.keyboard.press("Escape"); await expect(page.locator(".preview-overlay")).toHaveCount(0); await expect(opener).toBeFocused();
  await opener.click(); await expect(page.locator(".preview-overlay .m-screen")).toBeVisible();
  await device(page, /桌面版/).click(); await expect(fit(page)).toHaveAttribute("aria-pressed", "true");
  await page.goBack(); await expect(page.locator(".preview-overlay")).toHaveCount(0); await expect(page).toHaveURL(/\/$/);
});

test.describe("touch input", () => {
  test.use({ hasTouch: true });
  test("320px collaborator can tap desktop, close and reopen an app at 100%, with no draft writes", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const writes = await editor(page, "viewer");
    await device(page, /桌面版/).tap(); await actual(page).tap();
    // Move the physical viewport to its origin using its public keyboard scroll support.
    await region(page).focus(); for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
    const win = viewport(page).locator(".visitor-window").filter({ hasText: "About.exe" });
    await win.getByRole("button", { name: /關閉/ }).tap(); await expect(win).toHaveCount(0);
    await viewport(page).getByRole("button", { name: "About.exe", exact: true }).tap(); await expect(win).toBeVisible();
    await expect(page.locator(".draft-viewer .m-screen")).toHaveCount(0);
    await page.waitForTimeout(1000); expect(writes()).toBe(0);
  });
});
