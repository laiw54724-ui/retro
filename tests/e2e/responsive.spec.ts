import { expect, test, type Page } from "@playwright/test";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function mockEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: documentFixture, draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z" };
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
}

async function mockPublicSite(page: Page) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({
    json: {
      site: {
        username: "demo",
        site_name: "Demo Desk",
        published_document: documentFixture,
        published_version: 1,
        published_at: "2026-10-15T00:00:00.000Z"
      }
    }
  }));
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 375, 390, 430]) {
  test(`phone editor is a single mobile surface at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await mockEditor(page);
    await page.goto("/editor/site-1");

    await expect(page.locator(".left-panel2")).toBeHidden();
    await expect(page.locator(".right-panel2")).toBeHidden();
    await expect(page.locator(".editor-stage2 .m-screen")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "手機編輯工具" })).toBeVisible();
    await expect(page.locator(".editor-topbar .brand")).toHaveCSS("font-family", /Cubic 11/);
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`landing has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /把你的小宇宙/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`auth, onboarding and public routes fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });

    await page.goto("/auth");
    await expect(page.getByRole("button", { name: "使用 Google 繼續" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await mockEditor(page);
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "幫你的桌面取個網址" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await mockPublicSite(page);
    await page.goto("/@demo");
    await expect(width <= 767 ? page.locator(".visitor-mobile") : page.locator(".visitor-desktop")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

for (const width of [768, 1024, 1440]) {
  test(`desktop editor shell fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockEditor(page);
    await page.goto("/editor/site-1");

    await expect(page.locator(".left-panel2")).toBeVisible();
    if (width < 1024) await expect(page.locator(".right-panel2")).toBeHidden();
    else await expect(page.locator(".right-panel2")).toBeVisible();
    await expect(page.locator(".editor-stage2 .desktop-canvas")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}
