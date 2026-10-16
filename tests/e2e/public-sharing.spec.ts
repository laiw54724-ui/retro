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

test("clipboard rejection shows the real URL for manual copy instead of fake success", async ({ page }) => {
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
  await expect(fallback.getByRole("textbox", { name: "分享網址" })).toHaveValue("http://127.0.0.1:5173/@demo/oc/profile%3Aig");
  await expect(dialog.getByRole("status")).toHaveCount(0);
});

test("published Explorer OC shortcut resolves through the canonical deep link", async ({ page }) => {
  const document = publicV2();
  const explorer = makeWindow("explorer", document.windows.length);
  if (explorer.type !== "explorer") throw new Error("explorer fixture mismatch");
  explorer.id = "world"; explorer.title = "World.exe"; explorer.defaultOpen = true;
  explorer.content.shortcuts = [{ id: "retro-oc", parentId: null, label: "Retro User", order: 0, visibility: "published", target: { siteId: "site-1", id: "profile:ig", kind: "profile" } }];
  document.windows.forEach((window) => { window.defaultOpen = false; });
  document.windows.push(explorer);
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: document, published_version: 2, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  await page.locator(".visitor-desktop").getByRole("dialog", { name: "World.exe" }).getByRole("button", { name: /Retro User/ }).click();
  await expect(page).toHaveURL(/\/@demo\/oc\/profile%3Aig$/);
  await expect(page.locator(".visitor-desktop").getByRole("dialog", { name: "Instagram.exe" }).locator(".ig-title strong")).toHaveText("retro");
});
