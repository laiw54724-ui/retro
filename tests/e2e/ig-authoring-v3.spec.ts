import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createAssetReference, duplicateProfile, migrateSiteDocumentV2 } from "../../packages/shared/src";
import { igDocument } from "./ig-fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
async function open(page: Page, width = 1400) {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture");
  const duplicated = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: "site-1", id: "other", handle: "other" });
  if (!duplicated.ok) throw new Error("fixture duplicate");
  let saved = duplicated.document; let version = 1;
  const calls: string[] = []; const assets: Array<{ id: string; url: string; name: string; kind: string }> = []; const held = new Map<string, () => void>();
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "D", draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.route("**/api/sites/site-1/assets**", async (route) => {
    if (route.request().url().endsWith("/content")) return route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const name = /filename="([^"]+)"/.exec(route.request().postDataBuffer()?.toString() ?? "")?.[1] ?? "unknown"; calls.push(name);
    if (name.startsWith("held")) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name.startsWith("fail") && calls.filter((item) => item === name).length === 1) return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    const id = randomUUID(); const asset = { id, url: createAssetReference(id), name, kind: "image", mimeType: "image/png", size: PNG.length, createdAt: "2026-10-19T00:00:00Z" }; assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.setViewportSize({ width, height: 950 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "Instagram.exe", exact: true }).click(); await page.getByRole("button", { name: "編輯內容" }).click(); }
  const win = page.getByRole("dialog", { name: "Instagram.exe", exact: true });
  await win.getByRole("region", { name: "Instagram 角色編輯視窗" }).getByRole("button", { name: "管理編輯欄位" }).click();
  await expect(win.getByRole("textbox", { name: "Handle", exact: true })).toBeVisible();

  const posts = win.locator(".ig-canonical-posts");
  return { win, posts, calls, assets, saved: () => saved, post: (title: string) => saved.entities.posts.find((post) => post.title === title)!, src: (name: string) => assets.find((asset) => asset.name === name)!.url,
    release: (name: string) => { const done = held.get(name); if (!done) throw new Error("not held"); held.delete(name); done(); } };
}

for (const width of [1400, 320, 375, 390, 430]) test(`profile to post and highlight authoring at ${width}px`, async ({ page }, testInfo) => {
  const s = await open(page, width);
  await s.win.getByRole('button', { name: '管理貼文', exact: true }).click();
  await s.posts.getByRole('button', { name: '新增貼文', exact: true }).click();
  const title = s.posts.getByLabel('標題', { exact: true });
  await expect(title).toBeFocused();
  await title.fill('New work');
  await s.posts.getByRole('textbox', { name: '貼文內容', exact: true }).fill('A caption');
  const picker = s.posts.locator('article:visible input[type="file"][multiple]');
  await expect(picker).toHaveJSProperty('multiple', true);
  await picker.setInputFiles([file('one.png'), file('two.png')]);
  await expect.poll(() => s.post('New work')?.media?.length).toBe(2);
  await s.posts.getByRole('button', { name: '刪除圖片 2', exact: true }).click();
  await s.posts.getByRole('button', { name: '刪除圖片 1', exact: true }).click();
  await expect.poll(() => s.post('New work')?.media?.length).toBe(0);
  await expect(picker).toBeAttached();
  await picker.setInputFiles(file('restored.png'));
  await expect.poll(() => s.post('New work')?.media?.length).toBe(1);
  const pending = s.posts.getByRole('textbox', { name: '新增輪播圖片網址', exact: true });
  await pending.fill('https:');
  await s.posts.getByRole('button', { name: '完成編輯', exact: true }).click();
  const row = s.posts.locator('article').filter({ hasText: 'New work' });
  await expect(row.locator('[data-ig-edit]')).toBeFocused();
  await expect(row.getByText('有待續輸入', { exact: true })).toBeVisible();
  await row.locator('[data-ig-edit]').click();
  await expect(pending).toHaveValue('https:');
  await expect(s.posts.getByRole('textbox', { name: '貼文內容', exact: true })).toHaveValue('A caption');
  await pending.fill('');
  await s.posts.getByRole('button', { name: '完成編輯', exact: true }).click();
  await expect(row.getByText('有待續輸入', { exact: true })).toBeHidden();
  await s.win.getByRole('tab', { name: '角色資料', exact: true }).click();
  await s.win.getByRole('button', { name: '管理精選', exact: true }).click();
  const highlights = s.win.locator('.ig-canonical-highlights');
  await highlights.getByRole('button', { name: '＋ 新增精選', exact: true }).click();
  const highlightTitle = highlights.getByLabel('精選標題', { exact: true });
  await expect(highlightTitle).toBeFocused();
  await highlightTitle.fill('New highlight');
  await highlights.locator('article:visible input[type="file"]').setInputFiles([file('page-one.png'), file('page-two.png')]);
  await expect.poll(() => s.saved().entities.highlights?.find(h => h.title === 'New highlight')?.frames.length).toBe(2);
  await highlights.getByRole('button', { name: '完成編輯', exact: true }).click();
  const highlightRow = highlights.locator('[data-ig-edit]').filter({ hasText: 'New highlight' });
  await expect(highlightRow).toBeFocused();
  await highlightRow.click();
  await expect(highlightTitle).toHaveValue('New highlight');
  await highlights.getByRole('button', { name: '完成編輯', exact: true }).scrollIntoViewIfNeeded();
  await expect(highlights.getByRole('button', { name: '完成編輯', exact: true })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => s.win.locator('.ig-edit-scroll').evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`authoring-${width}.png`) });
});

test('replacement keeps the original until success, retries without losing later metadata', async ({ page }) => {
  const s = await open(page);
  await s.win.getByRole('tab', { name: '貼文', exact: true }).click();
  await s.posts.locator('[data-ig-edit]').filter({ hasText: 'p1' }).click();
  const original = structuredClone(s.post('p1').media![0]);
  await s.posts.getByLabel('替換圖片 1', { exact: true }).setInputFiles(file('fail-replace.png'));
  await expect(s.posts.getByRole('button', { name: '重試 fail-replace.png', exact: true })).toBeVisible();
  expect(s.post('p1').media![0]).toEqual(original);
  await s.posts.getByRole('textbox', { name: '圖片 1 替代文字', exact: true }).fill('New alt');
  await s.posts.getByRole('button', { name: '重試 fail-replace.png', exact: true }).click();
  await expect.poll(() => s.post('p1').media![0].src === s.assets.find(a => a.name === 'fail-replace.png')?.url).toBe(true);
  expect(s.post('p1').media![0]).toMatchObject({ id: original.id, alt: 'New alt', srcUrl: '' });
  expect(s.post('p1').media).toHaveLength(3);
});

for (const action of ['cancel', 'source', 'delete', 'undo', 'profile'] as const) test(`delayed replacement respects ${action}`, async ({ page }) => {
  const s = await open(page);
  await s.win.getByRole('tab', { name: '貼文', exact: true }).click();
  await s.posts.locator('[data-ig-edit]').filter({ hasText: 'p1' }).click();
  const original = structuredClone(s.post('p1').media![0]);
  const filename = `held-${action}.png`;
  await s.posts.getByLabel('替換圖片 1', { exact: true }).setInputFiles(file(filename));
  await expect.poll(() => s.calls.includes(filename)).toBe(true);
  expect(s.post('p1').media![0]).toEqual(original);
  if (action === 'cancel') await s.posts.getByRole('button', { name: `取消 ${filename}`, exact: true }).click();
  if (action === 'source') {
    const url = s.posts.getByRole('textbox', { name: '圖片 1 網址', exact: true });
    await url.fill('https://assets.test/newer.png'); await url.press('Enter');
  }
  if (action === 'delete') await s.posts.getByRole('button', { name: '刪除圖片 1', exact: true }).click();
  if (action === 'undo') {
    await s.posts.getByLabel('標題', { exact: true }).fill('Updated');
    await page.evaluate(async () => {
      const path = '/src/features/editor/store.ts';
      const { useEditorStore } = await import(path);
      useEditorStore.getState().undo();
    });
  }
  if (action === 'profile') await s.win.getByRole('region', { name: '角色切換器' }).locator('select').first().selectOption('other');
  s.release(filename);
  await expect.poll(() => s.assets.some(a => a.name === filename)).toBe(true);
  if (action === 'profile') {
    await expect.poll(() => s.post('p1').media![0].src).toBe(s.src(filename));
    expect(s.post('p1').authorProfileId).toBe('profile:ig');
    await expect(s.win.getByText(filename, { exact: true })).toBeHidden();
  } else {
    await expect(s.posts.getByRole('button', { name: `重試 ${filename}`, exact: true })).toBeHidden();
    await expect.poll(() => s.post('p1')?.media?.some(m => m.src === s.src(filename))).toBe(false);
    if (action === 'source') await expect.poll(() => s.post('p1').media![0].src).toBe('https://assets.test/newer.png');
    if (action === 'delete') await expect.poll(() => s.post('p1').media!.some(m => m.id === original.id)).toBe(false);
  }
});

test('deleted content cannot leave an unreachable pending input badge', async ({ page }) => {
  const s = await open(page);
  await s.win.getByRole('tab', { name: '貼文', exact: true }).click();
  const postRow = s.posts.locator('article').filter({ has: s.posts.page().locator('[data-ig-edit]').filter({ hasText: 'p1' }) });
  await postRow.locator('[data-ig-edit]').click();
  const source = postRow.getByRole('textbox', { name: '圖片 1 網址', exact: true });
  await source.fill('https:'); await source.press('Enter');
  await postRow.getByRole('button', { name: '刪除圖片 1', exact: true }).click();
  await s.posts.getByRole('button', { name: '完成編輯', exact: true }).click();
  await expect(postRow.getByText('有待續輸入', { exact: true })).toBeHidden();
  await s.win.getByRole('tab', { name: '精選／合集', exact: true }).click();
  const highlights = s.win.locator('.ig-canonical-highlights');
  await highlights.locator('[data-ig-edit]').filter({ hasText: 'Trip' }).click();
  const frameSource = highlights.getByRole('textbox', { name: '精選第 1 頁圖片網址', exact: true });
  await frameSource.fill('https:'); await frameSource.press('Enter');
  await highlights.getByRole('button', { name: '刪除精選第 1 頁', exact: true }).click();
  await highlights.getByRole('button', { name: '完成編輯', exact: true }).click();
  await expect(highlights.getByText('有待續輸入', { exact: true })).toBeHidden();
  await expect(s.win.locator('[data-ig-pending-drafts]')).toBeHidden();
});

test('new authoring actions have touch-sized targets at 320px', async ({ page }) => {
  const s = await open(page, 320);
  const manage = s.win.getByRole('button', { name: '管理貼文', exact: true });
  expect((await manage.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await manage.click();
  await s.posts.locator('[data-ig-edit]').filter({ hasText: 'p1' }).click();
  const done = s.posts.getByRole('button', { name: '完成編輯', exact: true });
  expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const replacement = s.posts.locator('label').filter({ hasText: '替換圖片 1' });
  expect((await replacement.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
