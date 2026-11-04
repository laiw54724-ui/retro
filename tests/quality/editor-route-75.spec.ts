import { expect, test } from '@playwright/test';
import { session } from './fixtures';

const editorChunk = /\/assets\/CollaborativeSitePage-[^/]+\.js$/;

test('unauthenticated editor keeps return parameters without loading the editor chunk', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', request => { if (editorChunk.test(request.url())) chunks.push(request.url()); });
  await page.goto('/editor/fixture-heavy?notice=route-check#section');
  await expect(page).toHaveURL('/auth?notice=route-check#section');
  await expect(page.locator('.editor-topbar')).toHaveCount(0);
  expect(chunks).toEqual([]);
});

test('editor chunk failure shows translated recovery and retry reloads successfully', async ({ page }) => {
  await page.addInitScript(value => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(value));
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
  }, session);
  await page.route(editorChunk, route => route.abort());
  await page.goto('/editor/fixture-heavy');
  await expect(page.getByRole('alert')).toContainText('無法開啟');
  const retry = page.getByRole('button', { name: '重試', exact: true });
  await expect(retry).toBeVisible();
  await page.unroute(editorChunk);
  await retry.click();
  await expect(page.locator('.editor-topbar')).toBeVisible();
});
