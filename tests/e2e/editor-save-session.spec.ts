import { expect, test, type Page } from '@playwright/test';
import { makeWindow, migrateSiteDocumentV2, normalizeDocument } from '../../packages/shared/src';
import { documentFixture } from './fixture';

const session = { access_token: 'a.b.c', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'save-owner', email: 'save@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
const leaveTitle = '離開編輯器？';
const stay = '保留並繼續編輯';
const leave = '仍要離開';

async function fixture(page: Page, width = 1280) {
  const win = makeWindow('about'); win.id = 'about'; win.title = 'About.exe'; win.defaultOpen = true;
  win.layout.desktop = { ...win.layout.desktop, x: 10, y: 10, w: 460, h: 650 };
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [win] }), { siteId: 'a' });
  if (!migrated.ok) throw new Error('Invalid save fixture');
  const docs = { a: migrated.document, b: { ...structuredClone(migrated.document), siteName: 'Beta Desk' } };
  docs.b.windows[0].content = { ...docs.b.windows[0].content, bio: 'Beta saved bio' } as typeof docs.b.windows[0]['content'];
  const versions = { a: 1, b: 50 };
  const saves: Array<{ id: 'a' | 'b'; expectedVersion: number; document: typeof docs.a }> = [];
  const published: Record<'a' | 'b', typeof docs.a | null> = { a: null, b: null };
  const publishes: string[] = [];
  const reloads: string[] = [];
  let holdPublish = false, holdReload = false, publishFailure = 0, reloadViewer = false;
  let releasePublish: (() => void) | undefined, releaseReload: (() => void) | undefined;
  let holdA = false;
  let fail = 0;
  let release: (() => void) | undefined;
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(value => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(value));
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
    (window as any).__saveReceipts = [];
    (window as any).__editorReceipts = [];
    const original = window.fetch;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (response.url.includes('/api/')) {
        const json = response.json.bind(response);
        response.json = async () => {
          const result = await json();
          (window as any).__editorReceipts.push(new URL(response.url).pathname);
          if (response.url.endsWith('/draft')) (window as any).__saveReceipts.push(response.url);
          return result;
        };
      }
      return response;
    };
  }, session);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const id = url.pathname.startsWith('/api/sites/b') ? 'b' : 'a';
    if (url.pathname.endsWith('/publish')) {
      publishes.push(id);
      if (holdPublish) await new Promise<void>(resolve => { releasePublish = resolve; });
      if (publishFailure) return route.fulfill({ status: publishFailure, json: { error: { code: publishFailure === 426 ? 'client_upgrade_required' : 'version_conflict', message: 'Synthetic publish failure' } } });
      published[id] = structuredClone(docs[id]);
      return route.fulfill({ json: { publishedVersion: versions[id], publishedAt: '2026-10-19T00:00:00Z', url: `/@${id}`, artifactStatus: 'synced', retryable: false } });
    }
    if (url.pathname.endsWith('/draft')) {
      const payload = route.request().postDataJSON(); saves.push({ id, ...payload });
      const failure = fail;
      if (id === 'a' && holdA) await new Promise<void>(resolve => { release = resolve; });
      if (failure) return route.fulfill({ status: failure, json: { error: { code: failure === 409 ? 'version_conflict' : failure === 426 ? 'client_upgrade_required' : 'request_failed', message: 'Synthetic save failure' } } });
      if (payload.expectedVersion !== versions[id]) return route.fulfill({ status: 409, json: { error: { code: 'version_conflict', message: 'Synthetic version conflict' } } });
      docs[id] = payload.document;
      return route.fulfill({ json: { version: ++versions[id], updatedAt: '2026-10-19T00:00:00Z' } });
    }
    if (url.pathname.endsWith('/assets')) return route.fulfill({ json: { assets: [] } });
    if (url.pathname === '/api/sites') return route.fulfill({ json: { sites: ['a', 'b'].map(id => ({ id, username: id, site_name: id === 'a' ? 'Alpha Desk' : 'Beta Desk', draft_version: versions[id as 'a' | 'b'], published_version: null, published_at: null, updated_at: '2026-10-19T00:00:00Z', access_role: 'owner' })) } });
    if (/^\/api\/sites\/[ab]$/.test(url.pathname)) {
      const site = { id, username: id, site_name: docs[id].siteName, draft_document: structuredClone(docs[id]), draft_version: versions[id], published_document: published[id], published_version: published[id] ? versions[id] : null, published_at: null, updated_at: '2026-10-19T00:00:00Z', access_role: id === 'a' && holdReload && reloadViewer ? 'viewer' : 'owner' };
      if (id === 'a' && holdReload) { reloads.push(id); await new Promise<void>(resolve => { releaseReload = resolve; }); }
      return route.fulfill({ json: { site } });
    }
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Synthetic endpoint' } } });
  });
  await page.goto('/auth');
  await page.locator('a[href="/editor/a"]').click();
  await openAbout(page, width);
  return { docs, versions, saves, published, publishes, reloads,
    fail: (status: number) => { fail = status; }, hold: () => { holdA = true; }, release: () => { holdA = false; release?.(); },
    holdPublish: (failure = 0) => { holdPublish = true; publishFailure = failure; }, releasePublish: () => { holdPublish = false; releasePublish?.(); },
    holdReload: (viewer = false) => { holdReload = true; reloadViewer = viewer; }, allowReloadReads: () => { holdReload = false; }, releaseReload: () => { holdReload = false; releaseReload?.(); },
  };
}

async function openAbout(page: Page, width = 1280) {
  await expect(page.locator('.editor-topbar')).toBeVisible();
  if (width < 768) {
    await page.getByRole('button', { name: 'About.exe', exact: true }).click();
    await page.getByRole('button', { name: '編輯此視窗', exact: true }).click();
  }
  await expect(page.getByLabel('簡介', { exact: true })).toBeVisible();
}
async function exitAnyway(page: Page) {
  await page.locator('.editor-topbar .brand').click();
  // Allows these end-to-end repros to run against the old unguarded base as well.
  const prompt = page.getByRole('dialog', { name: leaveTitle, exact: true });
  await expect.poll(async () => await prompt.isVisible() || /\/auth$/.test(page.url())).toBe(true);
  if (await prompt.isVisible()) await prompt.getByRole('button', { name: leave, exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
}
async function consumed(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as any).__saveReceipts.length)).toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function received(page: Page, path: string, count: number) {
  await expect.poll(() => page.evaluate(path => (window as any).__editorReceipts.filter((item: string) => item === path).length, path)).toBe(count);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
const receiptCount = (page: Page, path: string) => page.evaluate(path => (window as any).__editorReceipts.filter((item: string) => item === path).length as number, path);

async function startPublish(page: Page) {
  await page.getByRole('button', { name: '發布', exact: true }).click();
  await page.getByRole('button', { name: '確認發布', exact: true }).click();
}

for (const failure of [0, 409, 426]) test(`publish receipt ${failure || 'success'} from ended A leaves B unchanged`, async ({ page }) => {
  const state = await fixture(page); state.holdPublish(failure);
  await startPublish(page); await expect.poll(() => state.publishes.length).toBe(1);
  await page.goBack(); await expect(page).toHaveURL(/\/auth$/);
  await page.locator('a[href="/editor/b"]').click(); await openAbout(page);
  state.releasePublish(); await received(page, '/api/sites/a/publish', 1);
  await expect(page.locator('.status-badge')).toHaveText('尚未發布');
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Beta saved bio');
  await expect(page.locator('.editor-message')).toHaveCount(0);
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  await expect(page).toHaveURL(/\/editor\/b$/);
  await expect(page.getByRole('button', { name: '發布', exact: true })).toBeEnabled();
  expect(state.published.b).toBeNull();
  if (!failure) expect(state.published.a).not.toBeNull(); // The actual A server write is not cancelled.
});

test('publish receipt after unmount cannot mark a reopened A session published', async ({ page }) => {
  const state = await fixture(page); state.holdPublish();
  await startPublish(page); await expect.poll(() => state.publishes.length).toBe(1);
  await page.goBack(); await page.locator('a[href="/editor/a"]').click(); await openAbout(page);
  state.releasePublish(); await received(page, '/api/sites/a/publish', 1);
  await expect(page.locator('.status-badge')).toHaveText('尚未發布');
  expect(state.published.a).not.toBeNull();
});

test('ordinary publish completion still marks its current editor published', async ({ page }) => {
  const state = await fixture(page); await startPublish(page);
  await expect(page.getByRole('dialog', { name: '發布完成', exact: true })).toBeVisible();
  await expect(page.locator('.status-badge')).not.toHaveText('尚未發布');
  expect(state.published.a).not.toBeNull();
});

async function startRemoteReload(page: Page, state: Awaited<ReturnType<typeof fixture>>) {
  state.fail(409); await page.getByLabel('簡介', { exact: true }).fill('Retained conflicting local bio');
  await expect(page.getByRole('alertdialog')).toBeVisible(); state.fail(0);
  state.docs.a = structuredClone(state.docs.a);
  state.docs.a.windows[0].content = { ...state.docs.a.windows[0].content, bio: 'Remote A bio' } as typeof state.docs.a.windows[0]['content'];
  state.versions.a = 8;
  await page.getByRole('button', { name: '重新載入雲端版本', exact: true }).click();
}

for (const viewer of [false, true]) test(`reload receipt from ended A (${viewer ? 'viewer' : 'owner'}) leaves B unchanged`, async ({ page }) => {
  const state = await fixture(page); state.holdReload(viewer);
  await startRemoteReload(page, state); await expect.poll(() => state.reloads.length).toBe(1);
  await page.evaluate(() => history.back());
  await page.getByRole('dialog', { name: leaveTitle, exact: true }).getByRole('button', { name: leave, exact: true }).click();
  await page.locator('a[href="/editor/b"]').click(); await openAbout(page);
  const beforeRelease = await receiptCount(page, '/api/sites/a');
  state.releaseReload(); await received(page, '/api/sites/a', beforeRelease + 1);
  await expect(page).toHaveURL(/\/editor\/b$/);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Beta saved bio');
  await expect(page.locator('.editor-message')).toHaveCount(0);
  await page.getByLabel('簡介', { exact: true }).fill('B after remote A');
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[1]).toMatchObject({ id: 'b', expectedVersion: 50 });
});

test('reload receipt cannot replace a remounted A with an older response', async ({ page }) => {
  const state = await fixture(page); state.holdReload(); await startRemoteReload(page, state);
  await expect.poll(() => state.reloads.length).toBe(1);
  await page.evaluate(() => history.back());
  await page.getByRole('dialog', { name: leaveTitle, exact: true }).getByRole('button', { name: leave, exact: true }).click();
  state.docs.a.windows[0].content = { ...state.docs.a.windows[0].content, bio: 'Newest re-entry bio' } as typeof state.docs.a.windows[0]['content'];
  state.versions.a = 9;
  state.allowReloadReads();
  await page.locator('a[href="/editor/a"]').click(); await openAbout(page);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Newest re-entry bio');
  const beforeRelease = await receiptCount(page, '/api/sites/a');
  state.releaseReload();
  await received(page, '/api/sites/a', beforeRelease + 1);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Newest re-entry bio');
});

test('ordinary remote reload still replaces the conflicting local draft', async ({ page }) => {
  const state = await fixture(page); await startRemoteReload(page, state);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Remote A bio');
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('ordinary remote reload to viewer retains its access-loss redirect', async ({ page }) => {
  const state = await fixture(page); state.holdReload(true); await startRemoteReload(page, state);
  await expect.poll(() => state.reloads.length).toBe(1); state.releaseReload();
  await expect(page).toHaveURL(/\/auth\?notice=/);
  await expect(page.getByRole('dialog', { name: leaveTitle, exact: true })).toHaveCount(0);
});

for (const width of [1280, 390]) test(`immediate exit at ${width}px retains the canonical edit until confirmed`, async ({ page }, testInfo) => {
  const state = await fixture(page, width);
  await page.getByLabel('簡介', { exact: true }).fill('Keep this unsaved bio');
  await page.locator('.editor-topbar .brand').click();
  const prompt = page.getByRole('dialog', { name: leaveTitle, exact: true });
  await expect(prompt).toBeVisible();
  if (width === 390) await page.screenshot({ path: testInfo.outputPath('phone-leave-guard.png') });
  await prompt.getByRole('button', { name: stay, exact: true }).click();
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Keep this unsaved bio');
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  await page.locator('.editor-topbar .brand').click();
  await expect(page).toHaveURL(/\/auth$/);
});

for (const failure of [0, 500, 403, 409, 426]) test(`late ${failure || 'success'} from A cannot change B's save session`, async ({ page }) => {
  const state = await fixture(page); state.hold(); state.fail(failure);
  await page.getByLabel('簡介', { exact: true }).fill('A pending bio');
  await expect.poll(() => state.saves.length).toBe(1);
  await exitAnyway(page);
  state.fail(0);
  await page.locator('a[href="/editor/b"]').click(); await openAbout(page);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Beta saved bio');
  state.release(); await consumed(page); await page.waitForTimeout(750);
  expect(state.saves).toHaveLength(1);
  await expect(page).toHaveURL(/\/editor\/b$/);
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  await expect(page.locator('.editor-message')).toHaveCount(0);
  await page.getByLabel('簡介', { exact: true }).fill('B new bio');
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[1]).toMatchObject({ id: 'b', expectedVersion: 50 });
});

test('old A completion cannot affect a remounted A session', async ({ page }) => {
  const state = await fixture(page); state.hold();
  await page.getByLabel('簡介', { exact: true }).fill('Old A pending');
  await expect.poll(() => state.saves.length).toBe(1);
  await exitAnyway(page); await page.locator('a[href="/editor/a"]').click(); await openAbout(page);
  state.release(); await consumed(page); await page.waitForTimeout(750);
  expect(state.saves).toHaveLength(1);
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  await expect(page.getByLabel('簡介', { exact: true })).not.toHaveValue('Old A pending');
});

test('normal in-flight edits save again using the acknowledged version', async ({ page }) => {
  const state = await fixture(page); state.hold();
  await page.getByLabel('簡介', { exact: true }).fill('First edit');
  await expect.poll(() => state.saves.length).toBe(1);
  await page.getByLabel('簡介', { exact: true }).fill('Newer edit');
  state.release(); await consumed(page);
  await expect.poll(() => state.saves.length).toBe(2);
  expect(state.saves[1]).toMatchObject({ id: 'a', expectedVersion: 2 });
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  expect(state.docs.a.windows[0].content).toMatchObject({ bio: 'Newer edit' });
});

test('390px save failure retains Retry after the notice closes', async ({ page }, testInfo) => {
  const state = await fixture(page, 390); state.fail(500);
  await page.getByLabel('簡介', { exact: true }).fill('Retry this exact bio');
  await expect(page.locator('.editor-message')).toBeVisible();
  await page.getByRole('button', { name: '關閉通知', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('phone-persistent-retry.png') });
  state.fail(0);
  await page.getByRole('button', { name: '重試儲存', exact: true }).click();
  await expect.poll(() => state.saves.length).toBe(2);
  await expect(page.locator('.save-text')).toHaveText('已儲存');
  expect(state.docs.a.windows[0].content).toMatchObject({ bio: 'Retry this exact bio' });
});

test('real current-session conflict still pauses saving and retains the edit', async ({ page }) => {
  const state = await fixture(page); state.fail(409);
  await page.getByLabel('簡介', { exact: true }).fill('Conflict bio');
  await expect(page.locator('.editor-message')).toContainText('另一個分頁');
  await expect(page.getByRole('button', { name: '重試儲存', exact: true })).toHaveCount(0);
  await page.waitForTimeout(750); expect(state.saves).toHaveLength(1);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Conflict bio');
});

for (const failure of [403, 404]) test(`current-session ${failure} keeps the access-loss redirect`, async ({ page }) => {
  const state = await fixture(page); state.fail(failure);
  await page.getByLabel('簡介', { exact: true }).fill('Access was revoked');
  await expect(page).toHaveURL(/\/auth\?notice=/);
  await expect(page.getByRole('dialog', { name: leaveTitle, exact: true })).toHaveCount(0);
  expect(state.saves).toHaveLength(1);
});

test('Back can be cancelled; reload warns; confirmed leaving does not claim to cancel a sent save', async ({ page }) => {
  const state = await fixture(page); state.hold();
  await page.getByLabel('簡介', { exact: true }).fill('Pending exit');
  await page.goBack();
  const prompt = page.getByRole('dialog', { name: leaveTitle, exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: stay, exact: true }).click();
  await expect(page).toHaveURL(/\/editor\/a$/);
  const warning = page.waitForEvent('dialog');
  // A cancelled reload has no load event for page.reload() to await.
  const reload = page.evaluate(() => window.location.reload());
  const dialog = await warning; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); await reload;
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Pending exit');
  await expect.poll(() => state.saves.length).toBe(1);
  await exitAnyway(page); state.release(); await consumed(page);
  await expect(page).toHaveURL(/\/auth$/);
});

test('router preserves auth return parameters, direct entry, unknown route and preview history', async ({ page, browser }) => {
  await fixture(page);
  await page.getByRole('button', { name: /訪客預覽/ }).click();
  await expect(page.locator('.preview-overlay')).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/editor\/a$/);
  await expect(page.locator('.preview-overlay')).toHaveCount(0);
  await page.goForward(); await expect(page).toHaveURL(/\/editor\/a$/);
  await expect(page.locator('.preview-overlay')).toHaveCount(0);
  await page.goBack(); await page.goBack(); await expect(page).toHaveURL(/\/auth$/);
  await page.goForward(); await openAbout(page);
  await page.goto('/editor/b'); await openAbout(page);
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Beta saved bio');
  await page.goto('/route/that/does/not/exist'); await expect(page).toHaveURL('/');
  const anonymous = await browser.newContext();
  const signedOut = await anonymous.newPage();
  const origin = new URL(page.url()).origin;
  await signedOut.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await signedOut.goto(origin + '/editor/a?notice=return-check#anchor');
  await expect(signedOut).toHaveURL(origin + '/auth?notice=return-check#anchor');
  await anonymous.close();
});

test('unapplied registered theme preview blocks leaving without writing it', async ({ page }) => {
  const state = await fixture(page);
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/features/editor/store.ts' as string);
    useEditorStore.setState({ themePreview: { ...useEditorStore.getState().document.theme, wall: '#123456' } });
  });
  await page.locator('.editor-topbar .brand').click();
  const prompt = page.getByRole('dialog', { name: leaveTitle, exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: stay, exact: true }).click();
  expect(state.saves).toHaveLength(0);
  await page.evaluate(async () => {
    const { useEditorStore } = await import('/src/features/editor/store.ts' as string);
    useEditorStore.setState({ themePreview: null });
  });
  await page.locator('.editor-topbar .brand').click(); await expect(page).toHaveURL(/\/auth$/);
  expect(state.saves).toHaveLength(0);
});

test('sign-out confirmation happens before the authentication session is removed', async ({ page }) => {
  await fixture(page);
  await page.getByLabel('簡介', { exact: true }).fill('Keep before sign-out');
  await page.getByRole('button', { name: '登出', exact: true }).click();
  const prompt = page.getByRole('dialog', { name: leaveTitle, exact: true });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: stay, exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('sb-example-auth-token'))).not.toBeNull();
  await expect(page.getByLabel('簡介', { exact: true })).toHaveValue('Keep before sign-out');
});
