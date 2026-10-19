import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { migrateSiteDocumentV2, normalizeDocument } from '../../packages/shared/src';
import { documentFixture } from './fixture';

const session = { access_token: 'a.b.c', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'history-owner', email: 'history@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
const capture = process.env.HISTORY_CAPTURE_DIR;
async function shot(page: Page, name: string) {
  if (capture) await page.screenshot({ path: join(capture, `${name}.png`) });
}

async function fixture(page: Page) {
  const migrated = migrateSiteDocumentV2(normalizeDocument(documentFixture), { siteId: 'history' });
  if (!migrated.ok) throw new Error('Invalid history fixture');
  let document = migrated.document, version = 1, failure = 0, hold = false;
  let release: (() => void) | undefined;
  const saves: typeof document[] = [];
  await page.addInitScript(value => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(value));
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
  }, session);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname.endsWith('/draft')) {
      const payload = route.request().postDataJSON();
      saves.push(payload.document);
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      if (failure) return route.fulfill({ status: failure, json: { error: { code: 'request_failed', message: 'Synthetic save failure' } } });
      expect(payload.expectedVersion).toBe(version);
      document = payload.document;
      return route.fulfill({ json: { version: ++version, updatedAt: '2026-10-19T00:00:00Z' } });
    }
    if (url.pathname.endsWith('/assets')) return route.fulfill({ json: { assets: [] } });
    if (url.pathname === '/api/sites/history') return route.fulfill({ json: { site: { id: 'history', username: 'history', site_name: document.siteName, draft_document: document, draft_version: version, published_document: null, published_version: null, published_at: null, updated_at: '2026-10-19T00:00:00Z', access_role: 'owner' } } });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
  });
  await page.goto('/editor/history');
  await page.getByRole('button', { name: 'Links.exe', exact: true }).click();
  await page.getByRole('button', { name: '編輯此視窗', exact: true }).click();
  await expect(page.locator('.link-input')).toHaveValue('Example');
  return { saves, hold: () => { hold = true; }, release: () => { hold = false; release?.(); }, fail: (status: number) => { failure = status; } };
}

async function bounds(page: Page, width: number) {
  for (const control of [page.getByRole('button', { name: '復原', exact: true }), page.getByRole('button', { name: '重做', exact: true }), page.locator('.save-text'), page.getByRole('button', { name: '發布', exact: true }), page.getByRole('button', { name: '▶ 訪客預覽', exact: true })]) {
    await expect(control).toBeVisible();
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (await control.getAttribute('aria-label') === '復原' || await control.getAttribute('aria-label') === '重做') {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  const bar = (await page.locator('.editor-topbar').boundingBox())!;
  const body = (await page.locator('.m-win-body').boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(0);
  expect(body.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(body.height).toBeGreaterThan(0);
}

for (const [width, height] of [[320, 568], [390, 844], [430, 932]] as const) {
  test.describe(`mobile history ${width}`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });

    test('delete → undo → redo, empty history and saved draft', async ({ page }) => {
      const state = await fixture(page);
      await shot(page, `initial-${width}`);
      const undo = page.getByRole('button', { name: '復原', exact: true });
      const redo = page.getByRole('button', { name: '重做', exact: true });
      const status = page.locator('.save-text');
      await expect(undo).toBeDisabled(); await expect(redo).toBeDisabled();
      await expect(status).toHaveText('已儲存'); await expect(status).toHaveAttribute('role', 'status');
      await bounds(page, width);
      await page.locator('.link-editor-card').getByRole('button', { name: '刪除', exact: true }).tap();
      await expect(page.locator('.link-input')).toHaveCount(0);
      await expect(undo).toBeEnabled(); await expect(redo).toBeDisabled();
      await undo.tap(); await expect(page.locator('.link-input')).toHaveValue('Example');
      await expect(undo).toBeDisabled(); await expect(redo).toBeEnabled();
      await redo.tap(); await expect(page.locator('.link-input')).toHaveCount(0);
      await expect(redo).toBeDisabled(); await expect(status).toHaveText('已儲存');
      expect(state.saves.at(-1)?.windows.find(win => win.id === 'links')?.content).toMatchObject({ links: [] });
      await shot(page, `deleted-saved-${width}`);
    });

    test('pending save, edit during request, failure and keyboard retry', async ({ page }) => {
      const state = await fixture(page); state.hold();
      const input = page.locator('.link-input'), status = page.locator('.save-text');
      await input.fill('First change');
      await expect(status).toHaveText('尚未儲存');
      await expect(status).toHaveText('儲存中…'); await shot(page, `saving-${width}`);
      await input.fill('Latest change');
      await expect(status).not.toHaveText('已儲存');
      state.release();
      await expect.poll(() => state.saves.length).toBe(2);
      await expect(status).toHaveText('已儲存');
      expect(state.saves.at(-1)?.windows.find(win => win.id === 'links')?.content).toMatchObject({ links: [{ label: 'Latest change' }] });
      state.fail(500); await input.fill('Retry change');
      await expect(status).toHaveText('儲存失敗');
      const retry = page.getByRole('button', { name: '重試儲存', exact: true });
      await expect(retry).toBeVisible(); await bounds(page, width); await shot(page, `error-${width}`);
      state.fail(0); await retry.focus(); await page.keyboard.press('Enter');
      await expect(status).toHaveText('已儲存'); await expect(retry).toHaveCount(0);
      await page.getByRole('button', { name: '復原', exact: true }).focus(); await page.keyboard.press('Enter');
      await expect(input).toHaveValue('Example');
      await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: '重做', exact: true })).toBeFocused();
      await page.keyboard.press('Space'); await expect(input).toHaveValue('Retry change');
    });

    test('incomplete input, composition, safe area and reduced keyboard viewport', async ({ page }) => {
      await fixture(page);
      const input = page.locator('.link-input'), status = page.locator('.save-text');
      await input.fill('');
      await expect(status).toHaveText('有欄位未完成，暫不儲存');
      await input.fill('Valid again'); await expect(status).toHaveText('已儲存');
      await input.dispatchEvent('compositionstart');
      await expect(status).toHaveText('有欄位未完成，暫不儲存');
      await input.dispatchEvent('compositionend'); await expect(status).toHaveText('已儲存');
      await page.addStyleTag({ content: ':root { --m-safe-bottom: 34px; }' });
      await page.setViewportSize({ width, height: 420 });
      await input.focus();
      // Center the field in its scroll container after the simulated keyboard resize.
      await input.evaluate(element => element.scrollIntoView({ block: 'center' }));
      await bounds(page, width);
      const body = (await page.locator('.m-win-body').boundingBox())!;
      expect(body.y + body.height).toBeLessThanOrEqual(420 - 34 + 1);
      const field = (await input.boundingBox())!;
      expect(field.y).toBeGreaterThanOrEqual(body.y);
      expect(field.y + field.height).toBeLessThanOrEqual(body.y + body.height);
      await shot(page, `keyboard-viewport-${width}`);
    });
  });
}
