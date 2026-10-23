import { expect, test, type Page } from '@playwright/test';
import { migrateSiteDocumentV2 } from '../../packages/shared/src';
import { igDocument } from './ig-fixture';

async function fixture(page: Page, width: number) {
  const loaded = migrateSiteDocumentV2(igDocument(), { siteId: 'ig-status' });
  if (!loaded.ok) throw new Error('Invalid IG fixture');
  let document = loaded.document, version = 1, fail = false, hold = false;
  let release: (() => void) | undefined;
  let saves = 0;
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
    localStorage.setItem('sb-example-auth-token', JSON.stringify({ access_token: 'a.b.c', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'fixture', email: 'fixture@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }));
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/draft')) {
      saves++;
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (fail) return route.fulfill({ status: 500, json: { error: { code: 'request_failed' } } });
      document = route.request().postDataJSON().document;
      return route.fulfill({ json: { version: ++version, updatedAt: '2026-10-20T00:00:00Z' } });
    }
    if (url.pathname.endsWith('/assets')) return route.fulfill({ json: { assets: [] } });
    if (url.pathname === '/api/sites/ig-status') return route.fulfill({ json: { site: { id: 'ig-status', username: 'demo', site_name: document.siteName, draft_document: document, draft_version: version, published_document: null, published_version: null, access_role: 'owner' } } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
  });
  await page.goto('/editor/ig-status');
  await page.getByRole('button', { name: 'Instagram.exe', exact: true }).click();
  await page.getByRole('button', { name: '編輯內容', exact: true }).click();
  const win = page.getByRole('dialog', { name: 'Instagram.exe', exact: true });
  await win.getByRole('button', { name: '編輯個人檔案', exact: true }).click();
  const handle = win.getByRole('textbox', { name: 'Handle', exact: true });
  await expect(handle).toHaveValue('retro');
  return { win, handle, saves: () => saves, fail: (value: boolean) => { fail = value; }, hold: () => { hold = true; }, release: () => { hold = false; release?.(); } };
}

for (const width of [320, 390, 430]) test(`local IG input qualifies saved after Done/reentry and clears on cancel at ${width}px`, async ({ page }) => {
  const state = await fixture(page, width), status = page.locator('.save-text');
  await expect(status).toHaveText('已儲存');
  await state.handle.fill(''); await state.handle.press('Enter');
  await expect(status).toHaveText('有欄位未完成，暫不儲存');
  await expect(status).toHaveClass(/dirty/);
  await state.win.getByRole('button', { name: '完成', exact: true }).click();
  await expect(status).toBeVisible(); await expect(status).toHaveText('有欄位未完成，暫不儲存');
  await state.win.getByRole('button', { name: '編輯內容', exact: true }).click();
  await state.win.getByRole('button', { name: '編輯個人檔案', exact: true }).click();
  await expect(state.handle).toHaveValue(''); await expect(state.handle).toHaveAttribute('aria-invalid', 'true');
  await expect(status).toHaveText('有欄位未完成，暫不儲存');
  expect(state.saves()).toBe(0);
  await state.win.getByRole('button', { name: '取消編輯Handle', exact: true }).click();
  await expect(status).toHaveText('已儲存'); await expect(status).toHaveClass(/saved/);
  expect(state.saves()).toBe(0);
});

test('local pending input does not mask saving/error/retry and becomes saved after valid commit', async ({ page }) => {
  const state = await fixture(page, 390), status = page.locator('.save-text');
  await state.handle.fill(''); await state.handle.press('Enter');
  state.hold();
  const bio = state.win.getByRole('textbox', { name: '簡介', exact: true });
  await bio.fill('Canonical change'); await bio.press('Tab');
  await expect(status).toHaveText('儲存中…');
  state.fail(true); state.release();
  await expect(status).toHaveText('儲存失敗');
  state.fail(false);
  await page.getByRole('button', { name: '重試儲存', exact: true }).click();
  await expect(status).toHaveText('有欄位未完成，暫不儲存');
  expect(state.saves()).toBe(2);
  await state.handle.fill('finished'); await state.handle.press('Enter');
  await expect(status).toHaveText('已儲存');
  expect(state.saves()).toBe(3);
  await state.win.getByRole('button', { name: '完成', exact: true }).click();
  await state.win.getByRole('button', { name: '編輯內容', exact: true }).click();
  await state.win.getByRole('button', { name: '編輯個人檔案', exact: true }).click();
  await expect(state.handle).toHaveValue('finished'); await expect(status).toHaveText('已儲存');
});
