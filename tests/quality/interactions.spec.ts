import { expect, test } from '@playwright/test';
import { session } from './fixtures';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const rows: unknown[] = [];
const label = process.env.QUALITY_LABEL ?? 'baseline';
test.afterAll(() => {
  mkdirSync('docs/quality/raw', { recursive: true });
  writeFileSync(`docs/quality/raw/${label}-interactions.json`, JSON.stringify({ sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), label, rows }, null, 2) + '\n');
});
for (const width of [320, 390, 1280]) test(`heavy editor preview lifecycle ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.addInitScript(value => { localStorage.setItem('sb-example-auth-token', JSON.stringify(value)); localStorage.setItem('retrodesk:locale', 'zh-Hant'); }, session);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
  await cdp.send('Performance.enable');
  await page.goto('/editor/fixture-heavy');
  await expect(page.locator('.editor-topbar')).toBeVisible();
  await page.waitForTimeout(1000);
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const opener = width < 768 ? page.locator('.m-tool', { hasText: '預覽' }).first() : page.getByRole('button', { name: /訪客預覽/ }).first();
  for (let cycle = 0; cycle < 3; cycle++) {
    const before = await metrics(); const start = performance.now();
    await opener.click(); await expect(page.locator('.preview-overlay')).toBeVisible();
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const after = await metrics();
    const openMs = performance.now() - start;
    if (width < 768) {
      await page.locator('.preview-overlay').getByRole('button', { name: 'Photos.exe', exact: true }).click();
      await expect(page.locator('.preview-overlay .gal-item').first()).toBeVisible();
      await page.keyboard.press('Escape');
    }
    const closeStart = performance.now();
    await page.keyboard.press('Escape'); await expect(page.locator('.preview-overlay')).toHaveCount(0);
    await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const closed = await metrics();
    rows.push({ width, cycle, openMs, closeMs: performance.now() - closeStart,
      scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
      layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
      layouts: after.LayoutCount - before.LayoutCount, recalcStyles: after.RecalcStyleCount - before.RecalcStyleCount,
      heapAfterClose: closed.JSHeapUsedSize,
      domAfterClose: await page.locator('*').count(),
      remainingMedia: await page.locator('audio, video, iframe').count(),
    });
  }
});
