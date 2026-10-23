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


for (const width of [320, 375, 390, 430, 1440]) {
  test(`purpose catalog and selected actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    const add = width < 768 ? page.locator('.m-toolbar').getByRole('button', { name: '新增', exact: true }) : page.getByRole('button', { name: '新增元件', exact: true });
    await expect(add).toBeInViewport({ ratio: 1 });
    await add.click();
    const dialog = page.getByRole('dialog', { name: '新增元件', exact: true });
    await expect(dialog.getByRole('heading', { name: '介紹與文字' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: '圖片與靈感' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^圖片 單張圖片/ })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`catalog-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(add).toBeFocused();
    await add.click();
    await dialog.getByRole('button', { name: /^文件視窗/ }).click();
    await expect(dialog).toHaveCount(0);
    if (width < 768) {
      await expect(page.locator('.m-edit-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.m-win-body textarea').first()).toBeVisible();
      const icon = page.locator('.m-toolbar').getByRole('button', { name: '圖示', exact: true });
      await icon.click();
      await expect(page.getByRole('dialog', { name: '圖示', exact: true })).toBeVisible();
      await expect(page.getByLabel('視窗標題', { exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(icon).toBeFocused();
      await expect(page.locator('.m-edit-toggle')).toHaveAttribute('aria-pressed', 'true');
    } else {
      const toolbar = page.getByRole('group', { name: '已選取元件操作' });
      await expect(toolbar).toBeVisible();
      await toolbar.getByRole('button', { name: '完成', exact: true }).click();
      await expect(page.locator('.canvas-window.selected textarea')).toHaveCount(0);
      await toolbar.getByRole('button', { name: '編輯內容', exact: true }).click();
      await expect(page.locator('.canvas-window.selected textarea').first()).toBeVisible();
      await toolbar.getByRole('button', { name: '圖示', exact: true }).click();
      await expect(page.locator('#editor-right-panel').getByRole('tab', { name: '圖示', exact: true })).toHaveAttribute('aria-selected', 'true');
      await toolbar.getByRole('button', { name: '視窗設定', exact: true }).click();
      await expect(page.locator('#editor-right-panel').getByLabel('視窗標題', { exact: true })).toBeFocused();
    }
    await page.screenshot({ path: test.info().outputPath(`selected-${width}.png`) });
    await page.getByRole('button', { name: '復原', exact: true }).click();
    await expect(page.locator(width < 768 ? '.m-icon' : '.deskicon')).toHaveCount(1);
  });
}

test('fixed add survives collapsed sidebars and Done returns keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page);
  await page.getByRole('button', { name: '收合左側工具欄', exact: true }).click();
  await page.getByRole('button', { name: '收合右側屬性欄', exact: true }).click();
  await page.getByRole('button', { name: '新增元件', exact: true }).click();
  await page.getByRole('dialog', { name: '新增元件', exact: true }).getByRole('button', { name: /^文件視窗/ }).click();
  const toolbar = page.getByRole('group', { name: '已選取元件操作' });
  await toolbar.getByRole('button', { name: '完成', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: '編輯內容', exact: true })).toBeFocused();
  await toolbar.getByRole('button', { name: '圖示', exact: true }).click();
  await expect(page.locator('#editor-right-panel').getByRole('tab', { name: '圖示', exact: true })).toHaveAttribute('aria-selected', 'true');
});

for (const [locale, addLabel, iconLabel] of [['en', 'Add', 'Icon']]) {
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

test('Edit content preserves a maximized window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page);
  await page.getByRole('button', { name: '開啟 Gallery.exe', exact: true }).click();
  const window = page.getByRole('dialog', { name: 'Gallery.exe', exact: true });
  await window.getByRole('button', { name: '最大化', exact: true }).click();
  const maximized = await page.locator('.canvas-window.selected').boundingBox();
  await page.getByRole('group', { name: '已選取元件操作' }).getByRole('button', { name: '編輯內容', exact: true }).click();
  await expect.poll(() => page.locator('.canvas-window.selected').boundingBox()).toEqual(maximized);
});

test('adding the same module type does not carry unfinished input into the new window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.locator('.m-icon').click();
  await page.locator('.m-edit-toggle').click();
  await page.locator('.gal-editor-toolbar button[aria-expanded]').click();
  await page.getByLabel('新增圖片網址', { exact: true }).fill('https://unfinished-old-window');
  await page.locator('.m-toolbar').getByRole('button', { name: '新增', exact: true }).click();
  await page.getByRole('dialog', { name: '新增元件', exact: true }).getByRole('button', { name: /^相簿視窗/ }).click();
  await expect(page.locator('.m-edit-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.gal-editor-toolbar button[aria-expanded]').click();
  await expect(page.getByLabel('新增圖片網址', { exact: true })).toHaveValue('');
  await expect(page.locator('.m-icon')).toHaveCount(2);
});
