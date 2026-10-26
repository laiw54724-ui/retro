import { expect, test, type Page } from "@playwright/test";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument } from "@retrodesk/shared";

type Source = "public" | "preview" | "editor";
const auth = { access_token: "a.b.c", refresh_token: "fixture", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "fixture", email: "mobile-focus@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function openHome(page: Page, source: Source, width: number, count = 3) {
  const legacy = createStarterDocument("Mobile focus", "classic98", "blank");
  legacy.windows = Array.from({ length: count }, (_, index) => {
    const window = makeWindow("document", index);
    window.id = `notes-${index}`; window.title = `Notes ${index}`;
    window.defaultOpen = false;
    return window;
  });
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "mobile-focus" });
  if (!migrated.ok) throw new Error("Invalid mobile focus fixture");
  const projection = projectPublicSiteDocument(migrated.document, "mobile-focus");
  if (!projection.ok) throw new Error("Invalid public mobile focus fixture");
  await page.setViewportSize({ width, height: 568 });
  if (source !== "public") await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), auth);
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/public/sites/mobile-focus") return route.fulfill({ json: { site: { username: "mobile-focus", site_name: "Mobile focus", published_document: projection.document, published_version: 1, published_at: "2026-10-26T00:00:00Z" } } });
    if (url.pathname === "/api/sites/mobile-focus") return route.fulfill({ json: { site: { id: "mobile-focus", username: "mobile-focus", site_name: "Mobile focus", draft_document: migrated.document, draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto(source === "public" ? "/@mobile-focus" : "/editor/mobile-focus");
  if (source === "preview") await page.getByRole("button", { name: /訪客預覽/ }).first().click();
  const scope = page.locator(source === "public" ? ".visitor-page" : source === "preview" ? ".preview-overlay" : ".editor-app");
  await expect(scope.locator(".m-icon")).toHaveCount(count);
  return scope;
}

for (const width of [320, 390, 430]) {
  for (const source of ["public", "preview"] as const) {
    test(`${source} phone home keyboard focus stays visible at ${width}px`, async ({ page }) => {
      const scope = await openHome(page, source, width);
      const icon = scope.locator(".m-icon").first();
      await page.keyboard.press("Tab");
      await icon.focus();
      await expect(icon).toBeFocused();
      expect(await icon.evaluate(node => node.matches(":focus-visible"))).toBe(true);
      await expect(icon).not.toHaveCSS("outline-style", "none");
      expect(await icon.evaluate(node => parseFloat(getComputedStyle(node).outlineWidth))).toBeGreaterThan(0);
    });
  }

  for (const source of ["public", "preview", "editor"] as const) {
    test(`${source} phone app leaves covered home icons out of focus at ${width}px`, async ({ page }) => {
      const scope = await openHome(page, source, width);
      const icon = scope.locator(".m-icon").first();
      await icon.focus(); await page.keyboard.press("Enter");
      const app = scope.locator(".m-window");
      await expect(app).toBeVisible();
      await expect.soft.poll(() => app.evaluate(node => node.contains(document.activeElement))).toBe(true);
      const coveredIcon = scope.locator(".m-icon").nth(1);
      await coveredIcon.evaluate(node => (node as HTMLElement).focus());
      await expect.soft(coveredIcon).not.toBeFocused();
      for (let index = 0; index < 6; index++) {
        await page.keyboard.press("Tab");
        expect.soft(await scope.evaluate(node => !!node.querySelector(".m-scroll")?.contains(document.activeElement))).toBe(false);
      }
      await app.locator(".m-back").click();
      await expect(app).toHaveCount(0);
      await expect(icon).toBeFocused();
      await page.keyboard.press("Space");
      await expect(app).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(app).toHaveCount(0);
      await expect(icon).toBeFocused();
    });
  }
}

test("phone home scroll position survives opening and returning from a document", async ({ page }) => {
  const scope = await openHome(page, "public", 320, 24);
  const icon = scope.locator(".m-icon").last();
  await icon.focus();
  const home = scope.locator(".m-scroll");
  const scrollTop = await home.evaluate(node => node.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(scope.locator(".m-window")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(icon).toBeFocused();
  expect(await home.evaluate(node => node.scrollTop)).toBe(scrollTop);
});
