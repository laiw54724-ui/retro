import { expect, test, type Page } from "@playwright/test";
import { igDocument } from "./ig-fixture";

// Exercise React Router navigation without reloading the HTML shell.
async function navigate(page: Page, path: string) {
  await page.evaluate((url) => {
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("landing HTML provides social text without an assumed deployment origin", async ({ request }) => {
  const response = await request.get("/");
  const html = await response.text();
  expect(html).toContain('<meta property="og:title" content="Retro Desktop"');
  expect(html).toContain('<meta name="twitter:title" content="Retro Desktop"');
  expect(html).toContain('<meta property="og:description" content="Retro Desktop — 把你的小宇宙裝進一台復古電腦。"');
  expect(html).toContain('<meta name="twitter:description" content="Retro Desktop — 把你的小宇宙裝進一台復古電腦。"');
  expect(html).not.toContain('property="og:url"');
});

test("public title is cleared on SPA landing/auth navigation and restored on return", async ({ page }) => {
  await page.route("**/api/public/sites/seo-fixture", route => route.fulfill({ json: { site: {
    username: "seo-fixture", site_name: "SEO Fixture Desk", published_document: igDocument(),
    published_version: 1, published_at: "2026-10-17T00:00:00.000Z"
  } } }));
  await page.goto("/@seo-fixture");
  await expect(page).toHaveTitle("SEO Fixture Desk — Retro Desktop");
  await navigate(page, "/");
  await expect(page.locator(".landing-shell")).toBeVisible();
  await expect(page).toHaveTitle("Retro Desktop");
  await page.goBack();
  await expect(page).toHaveTitle("SEO Fixture Desk — Retro Desktop");
  await navigate(page, "/auth");
  await expect(page.locator(".auth-shell")).toBeVisible();
  await expect(page).toHaveTitle("Retro Desktop");
});
