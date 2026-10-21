import { expect, test, type Page } from "@playwright/test";
import { createStarterDocument, makeGalleryImage, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";

// Synthetic local API only. Viewport resizing is not a real-device keyboard test.
async function fixture(page: Page) {
  await page.addInitScript(() => localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "mobile@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } })));
  const legacy = createStarterDocument("Mobile authoring", "classic98", "blank");
  const window = makeWindow("gallery");
  window.id = "gallery"; window.title = "Gallery.exe"; window.defaultOpen = false;
  window.content.images = Array.from({ length: 8 }, (_, index) => makeGalleryImage({ id: `image-${index}`, title: `Image ${index}`, src: null, srcUrl: "" }));
  legacy.windows = [window];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "mobile" });
  if (!migrated.ok) throw new Error("Invalid mobile fixture");
  let document = migrated.document, version = 1;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/draft")) {
      document = route.request().postDataJSON().document;
      return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-22T00:00:00Z" } });
    }
    if (url.pathname === "/api/sites/mobile") return route.fulfill({ json: { site: { id: "mobile", username: "mobile", site_name: document.siteName, draft_document: document, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto("/editor/mobile");
  await expect(page.locator(".editor-topbar")).toBeVisible();
}


for (const [locale, addLabel, iconLabel] of [['ja', '追加', 'アイコン'], ['ko', '추가', '아이콘']]) {
  test(`${locale} phone catalog and actions fit 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(locale => localStorage.setItem('retrodesk:locale', locale), locale);
    await fixture(page);
    const add = page.locator('.m-toolbar').getByRole('button', { name: addLabel, exact: true });
    await add.click();
    const dialog = page.getByRole('dialog', { name: locale === 'en' ? 'Add component' : locale === 'ja' ? 'コンポーネントを追加' : '구성 요소 추가', exact: true });
    await dialog.locator('.add-card').nth(1).click();
    await expect(page.locator('.m-edit-toggle')).toHaveAttribute('aria-pressed', 'true');
    for (const button of await page.locator('.m-toolbar button').all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate(element => {
        const box = element.getBoundingClientRect();
        return [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).every(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          return text.top >= box.top && text.bottom <= box.bottom;
        });
      })).toBe(true);
    }
    await expect(page.locator('.m-toolbar').getByRole('button', { name: iconLabel, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await page.screenshot({ path: test.info().outputPath(`phone-${locale}-320.png`) });
  });
}
