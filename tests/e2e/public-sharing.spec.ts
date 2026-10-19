import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { igDocument } from "./ig-fixture";

function publicV2() {
  const result = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!result.ok || result.version !== 2) throw new Error("v2 fixture migration failed");
  return result.document;
}

async function mockPublicSite(page: Page) {
  const document = publicV2();
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-17T00:00:00.000Z" } } }));
  return document;
}

test("desktop OC and post deep links survive reload and open published content", async ({ page }) => {
  await mockPublicSite(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo/oc/profile%3Aig");
  const profileDialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" });
  await expect(profileDialog).toBeVisible();
  await expect(profileDialog.locator(".ig-title strong")).toHaveText("retro");
  await page.reload();
  await expect(page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" })).toBeVisible();

  await page.goto("/@demo/post/post%3Aig%3Ap1");
  const postDialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" });
  await expect(postDialog.locator(".ig-title strong")).toHaveText("貼文");
  await expect(postDialog.locator(".ig-pre")).toContainText("caption p1");
});

test("mobile post deep link opens the requested post without horizontal overflow", async ({ page }) => {
  await mockPublicSite(page);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo/post/post%3Aig%3Ap2");
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Instagram.exe" });
  await expect(dialog.locator(".ig-title strong")).toHaveText("貼文");
  await expect(dialog.locator(".ig-pre")).toContainText("second sunset");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("missing or draft entity links use a generic public not-found response", async ({ page }) => {
  const document = await mockPublicSite(page);
  document.entities.profiles[0].visibility = "draft";
  await page.goto("/@demo/oc/profile%3Aig");
  await expect(page.getByRole("heading", { name: "找不到這個桌面" })).toBeVisible();
  await expect(page.getByText("找不到公開內容")).toBeVisible();
  await expect(page.getByText("Retro User")).toHaveCount(0);
});

test("clipboard rejection shows the real URL for manual copy instead of fake success", async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
  });
  await mockPublicSite(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo/oc/profile%3Aig");
  const dialog = page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" });
  await dialog.getByRole("button", { name: "分享個人檔案" }).click();
  const fallback = dialog.getByRole("dialog", { name: "手動複製分享連結" });
  await expect(fallback).toBeVisible();
  await expect(fallback.getByRole("textbox", { name: "分享網址" })).toHaveValue(new URL("/@demo/oc/profile%3Aig", page.url()).href);
  await expect(dialog.getByRole("status")).toHaveCount(0);
});

for (const width of [1280, 390]) {
  test(`published Explorer opens exact profile/post in memory with navigation focus and no persistence at ${width}px`, async ({ page }) => {
    const document = publicV2(), writes: string[] = [];
    const post = document.entities.posts.find((item) => item.caption === "second sunset")!;
    const explorer = makeWindow("explorer", document.windows.length);
    if (explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
    explorer.id = "world"; explorer.title = "World.exe"; explorer.defaultOpen = true;
    explorer.layout.desktop = { ...explorer.layout.desktop, x: 520, y: 30, w: 440, h: 560 };
    explorer.content.shortcuts = [
      { id: "retro-oc", parentId: null, label: "Retro User", order: 0, visibility: "published", target: { siteId: "site-1", id: "profile:ig", kind: "profile" } },
      { id: "exact-post", parentId: null, label: "Exact second post", order: 1, visibility: "published", target: { siteId: "site-1", id: post.id, kind: "post" } }
    ];
    document.windows.forEach((window) => { window.defaultOpen = false; window.layout.desktop = { ...window.layout.desktop, x: 20, y: 30, w: 420, h: 690 }; });
    document.windows.push(explorer);
    const before = structuredClone(document); let loads = 0;
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    });
    page.on("request", (request) => { if (request.method() !== "GET") writes.push(request.url()); });
    await page.route("**/api/public/sites/demo", (route) => { loads++; return route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-17T00:00:00.000Z" } } }); });
    await page.setViewportSize({ width, height: 900 }); await page.goto("/@demo");
    const surface = page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop");
    if (width < 768) await surface.getByRole("button", { name: "World.exe", exact: true }).click();
    const world = surface.getByRole("dialog", { name: "World.exe", exact: true });
    const profileTrigger = world.getByRole("button", { name: /Retro User/ });
    const postTrigger = world.getByRole("button", { name: /Exact second post/ });
    const url = page.url(), historyLength = await page.evaluate(() => history.length), initialLoads = loads;
    await profileTrigger.click();
    const ig = surface.getByRole("dialog", { name: "Instagram.exe", exact: true });
    await expect(ig.locator(".ig-title strong")).toHaveText("retro");
    if (width >= 768) await expect(surface.locator('[data-visitor-window="ig"]')).toBeFocused();
    await ig.getByRole("button", { name: "分享個人檔案", exact: true }).click();
    const fallback = ig.getByRole("dialog", { name: "手動複製分享連結", exact: true });
    await expect(fallback.getByRole("textbox", { name: "分享網址" })).toHaveValue(new URL("/@demo/oc/profile%3Aig", url).href);
    await fallback.getByRole("button", { name: "關閉", exact: true }).click();
    if (width < 768) { await surface.locator(".m-back").click(); await expect(profileTrigger).toBeFocused(); }
    await postTrigger.click();
    await expect(ig.locator(".ig-title strong")).toHaveText("貼文");
    await expect(ig.locator(".ig-card-head strong").first()).toHaveText("retro");
    await expect(ig.locator(".ig-pre")).toHaveText("retro second sunset");
    await expect(ig.locator(".ig-pre")).not.toContainText("caption p1");
    await ig.locator(".ig-card").getByRole("button", { name: "分享", exact: true }).click();
    await expect(fallback.getByRole("textbox", { name: "分享網址" })).toHaveValue(new URL(`/@demo/post/${encodeURIComponent(post.id)}`, url).href);
    await fallback.getByRole("button", { name: "關閉", exact: true }).click();
    await ig.getByRole("button", { name: "返回", exact: true }).click();
    await expect(ig.locator(".ig-title strong")).toHaveText("retro");
    if (width < 768) { await surface.locator(".m-back").click(); await expect(postTrigger).toBeFocused(); }
    else await expect(world).toBeVisible();
    await expect(page).toHaveURL(url);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(loads).toBe(initialLoads); expect(writes).toEqual([]); expect(document).toEqual(before);
    await page.reload();
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("dialog", { name: "Instagram.exe", exact: true })).toHaveCount(0);
    expect(loads).toBe(initialLoads * 2); expect(writes).toEqual([]);
  });
}
