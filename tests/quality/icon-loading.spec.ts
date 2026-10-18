import { expect, test, type Page } from '@playwright/test';
import { session } from './fixtures';

async function openEditor(page: Page) {
  await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session);
  await page.goto('/editor/fixture-normal');
  await expect(page.getByRole('dialog', { name: 'About.exe' })).toBeVisible();
}
async function picker(page: Page) {
  await page.getByRole('tab', { name: '圖示', exact: true }).click();
  await page.getByRole('button', { name: '更換圖示…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '選擇圖示', exact: true });
  await expect(dialog.locator('.ilib-tile').first()).toBeVisible();
  return dialog;
}

test('entry payload excludes the optional Windows manifest', async ({ page }) => {
  const response = page.waitForResponse(response => /\/assets\/index-.*\.js$/.test(response.url()));
  await openEditor(page);
  const entry = await (await response).text();
  expect(entry.includes('/windows-icons/icons-w2k-computer.ico'), 'optional manifest leaked into the initial shared bundle').toBe(false);
});

test('only the installed Windows tab loads its manifest, then search and apply still work', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await openEditor(page);
  expect(requests.filter(url => /windowsIconManifest-.*\.js$/.test(url))).toHaveLength(0);
  const dialog = await picker(page);
  await expect(dialog.getByRole('tab', { name: 'Windows（本機）' })).toBeVisible();
  expect(requests.filter(url => /windowsIconManifest-.*\.js$/.test(url))).toHaveLength(0);
  await dialog.getByRole('tab', { name: 'Windows（本機）' }).click();
  await expect(dialog.locator('.ilib-tile').first()).toBeVisible();
  expect(requests.filter(url => /windowsIconManifest-.*\.js$/.test(url))).toHaveLength(1);
  await dialog.getByRole('searchbox').fill('computer');
  const tile = dialog.locator('.ilib-tile').first();
  const selected = await tile.getAttribute('data-icon');
  expect(selected).toMatch(/^\/windows-icons\//);
  await tile.click();
  await dialog.getByRole('button', { name: '套用', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.canvas-window').filter({ hasText: 'About.exe' }).locator(`img[src="${selected}"]`).first()).toBeVisible();
});

test('a missing pack never fetches the manifest and built-in fallback remains usable', async ({ page, context }) => {
  await context.addCookies([{ name: 'quality-pack', value: 'missing', url: 'http://127.0.0.1:5197' }]);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await openEditor(page);
  const dialog = await picker(page);
  await expect(dialog.getByRole('tab', { name: 'Windows（本機）' })).toHaveCount(0);
  await dialog.getByRole('searchbox').fill('music');
  await expect(dialog.locator('.ilib-tile').first()).toBeVisible();
  expect(requests.filter(url => /windowsIconManifest-.*\.js$/.test(url))).toHaveLength(0);
});

test('a Windows chunk load error has retry and does not disable other categories', async ({ page }) => {
  let failed = false;
  await page.route('**/assets/windowsIconManifest-*.js', route => {
    if (!failed) { failed = true; return route.abort(); }
    return route.continue();
  });
  await openEditor(page);
  const dialog = await picker(page);
  await dialog.getByRole('tab', { name: 'Windows（本機）' }).click();
  await expect(dialog.locator('.ilib-error')).toBeVisible();
  await dialog.getByRole('button', { name: '重試', exact: true }).click();
  await expect(dialog.locator('.ilib-tile').first()).toBeVisible();
  await dialog.getByRole('tab', { name: '全部', exact: true }).click();
  await expect(dialog.locator('.ilib-error')).toHaveCount(0);
  await expect(dialog.locator('.ilib-tile').first()).toBeVisible();
});
