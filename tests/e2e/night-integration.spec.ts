import { expect, test } from '@playwright/test';
import { duplicateProfile, migrateSiteDocumentV2 } from '@retrodesk/shared';
import { igDocument } from './ig-fixture';

const session = { access_token: 'a.b.c', refresh_token: 'fixture', expires_at: 4102444800, expires_in: 3600, token_type: 'bearer', user: { id: 'night-owner', email: 'night@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } };
function documentFixture() {
  const migrated = migrateSiteDocumentV2(igDocument(), { siteId: 'night-site' });
  if (!migrated.ok || migrated.version !== 2) throw new Error('night fixture migration');
  const next = duplicateProfile(migrated.document, migrated.document.entities.profiles[0].id, { siteId: 'night-site', id: 'night-private', handle: 'nightprivate' });
  if (!next.ok) throw new Error('night fixture duplicate');
  const profile = next.document.entities.profiles.find(p => p.id === 'night-private')!;
  profile.visibility = 'draft'; profile.displayName = 'Night Private'; profile.name = 'Night Private';
  profile.pronouns = 'NIGHT_PRIVATE_PRONOUNS'; profile.worldTags = ['NIGHT_PRIVATE_WORLD'];
  profile.customFields = [{ key: 'Rank', value: 'NIGHT_PRIVATE_DETAIL' }];
  // A public directory is shown only when at least two published profiles exist.
  const publicCopy = duplicateProfile(next.document, next.document.entities.profiles[0].id, { siteId: 'night-site', id: 'night-public', handle: 'nightpublic' });
  if (!publicCopy.ok) throw new Error('night public fixture duplicate');
  publicCopy.document.entities.profiles.find(p => p.id === 'night-public')!.visibility = 'published';
  return publicCopy.document;
}
for (const width of [320, 390]) for (const role of ['owner', 'viewer']) {
  test(`night integration: ${role} private details on ${width}px stay out of public`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session);
    const doc = documentFixture();
    const site = { id: 'night-site', username: 'night', site_name: 'Night', draft_document: doc, draft_version: 2, published_document: null, published_version: null, published_at: null, updated_at: '2026-10-18T00:00:00Z', access_role: role };
    await page.route('**/api/sites/night-site', route => route.fulfill({ json: { site } }));
    await page.route('**/api/sites/night-site/assets**', route => route.fulfill({ json: { assets: [] } }));
    await page.goto('/editor/night-site');
    const root = page.locator(role === 'owner' ? '.preview-overlay' : '.draft-viewer-body');
    if (role === 'owner') {
      await page.locator('.m-tool', { hasText: '預覽' }).first().click();
      await root.getByRole('button', { name: '目前草稿', exact: true }).click();
    }
    await root.getByRole('button', { name: 'Instagram.exe', exact: true }).click();
    const ig = root.getByRole('dialog', { name: 'Instagram.exe', exact: true });
    await ig.getByRole('button', { name: '所有角色', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await ig.getByRole('button', { name: 'Night Private @nightprivate', exact: true }).click();
    await ig.locator('summary', { hasText: '角色資料' }).click();
    for (const value of ['NIGHT_PRIVATE_PRONOUNS', 'NIGHT_PRIVATE_WORLD', 'NIGHT_PRIVATE_DETAIL']) await expect(ig.getByText(value, { exact: true })).toBeVisible();
    await page.route('**/api/public/sites/night', route => route.fulfill({ json: { site: { username: 'night', site_name: 'Night', published_document: doc, published_version: 2, published_at: '2026-10-18T00:00:00Z' } } }));
    await page.goto('/@night');
    await page.locator('.visitor-page').getByRole('button', { name: 'Instagram.exe', exact: true }).click();
    const publicIg = page.locator('.visitor-page').getByRole('dialog', { name: 'Instagram.exe', exact: true });
    await publicIg.getByRole('button', { name: '所有角色', exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    expect(await page.locator('body').innerText()).not.toMatch(/NIGHT_PRIVATE_|Night Private|nightprivate/);
  });
}
