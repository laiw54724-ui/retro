import { expect, test, type Page } from '@playwright/test';
import { fixtures, session } from './fixtures';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { cpus, platform, release } from 'node:os';

const label = process.env.QUALITY_LABEL ?? 'baseline';
const rows: unknown[] = [];
const repetitions = Number(process.env.QUALITY_REPETITIONS ?? 3);
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const bundle = readdirSync('apps/web/dist/assets').filter(f => /\.(js|css)$/.test(f)).map(file => {
  const bytes = readFileSync(`apps/web/dist/assets/${file}`);
  return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length };
});

test.afterAll(async ({ browser }) => {
  mkdirSync('docs/quality/raw', { recursive: true });
  writeFileSync(`docs/quality/raw/${label}.json`, JSON.stringify({
    sha, label, collectedAt: new Date().toISOString(), browser: browser.version(), node: process.version,
    os: `${platform()} ${release()}`, cpu: cpus()[0].model, cores: cpus().length,
    mode: 'production Vite build; local HTTP fixture API; uncompressed HTTP; browser cache enabled; HTTPS blocked via CDP; no CPU/network throttling; 800ms observation after ready; 3 default repetitions',
    bundle, fixtures: Object.fromEntries(Object.entries(fixtures).map(([key, doc]: [string, any]) => [key, { bytes: Buffer.byteLength(JSON.stringify(doc)), windows: doc.windows.length, profiles: doc.entities.profiles.length }])), rows,
  }, null, 2) + '\n');
});

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const state = { longTasks: [] as number[], shifts: [] as number[], lcp: 0 };
    (window as any).__quality = state;
    new PerformanceObserver(list => { for (const e of list.getEntries()) state.longTasks.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries() as any) if (!e.hadRecentInput) state.shifts.push(e.value); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const e of list.getEntries()) state.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
  });
}

async function open(page: Page, entry: string, name: string) {
  const start = performance.now();
  await page.goto(entry === 'editor' ? `/editor/fixture-${name}` : entry === 'public' ? `/@fixture-${name}` : '/');
  if (entry === 'editor') await expect(page.locator('.editor-topbar')).toBeVisible();
  if (entry === 'public') await expect(page.locator('.visitor-page')).toBeVisible();
  let interactionMs: number | null = null;
  if (entry === 'sample') {
    const index = { card: 0, ig: 1, oc: 2 }[name]!;
    await expect(page.locator('.example-card').nth(index)).toBeVisible();
    const clickStart = performance.now();
    await page.locator('.example-card').nth(index).click();
    await expect(page.locator('.preview-overlay')).toBeVisible();
    interactionMs = performance.now() - clickStart;
  }
  const readyMs = performance.now() - start;
  await page.waitForTimeout(800);
  const metrics = await page.evaluate(() => {
    const state = (window as any).__quality;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      navigationLoadMs: nav.loadEventEnd, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      lcpMs: state.lcp, cls: state.shifts.reduce((a: number, b: number) => a + b, 0),
      longTasks: state.longTasks, longTaskTotalMs: state.longTasks.reduce((a: number, b: number) => a + b, 0),
      resources: resources.map(r => ({ url: new URL(r.name).pathname, type: r.initiatorType, transferBytes: r.transferSize, encodedBytes: r.encodedBodySize, durationMs: r.duration })),
      images: Array.from(document.images, img => ({ url: new URL(img.currentSrc || img.src, location.href).pathname, width: img.naturalWidth, height: img.naturalHeight, renderedWidth: Math.round(img.getBoundingClientRect().width), loading: img.loading, decoding: img.decoding, complete: img.complete })),
      domNodes: document.querySelectorAll('*').length,
      media: { audio: document.querySelectorAll('audio').length, video: document.querySelectorAll('video').length, iframe: document.querySelectorAll('iframe').length },
    };
  });
  // Actual click-to-next-two-frames cost. Browser event/paint timing, not field INP or React commit count.
  if (entry !== 'sample' && name !== 'empty' && page.viewportSize()!.width === 1280) expect(metrics.images.some(img => img.width === 1024 && img.height === 768), 'fixture images must decode; srcUrl alone does not render').toBe(true);
  const frameStart = performance.now();
  let interactionPerformed = entry === 'sample' ? 'close sample with Escape' : 'no matching visible app opener';
  if (entry === 'sample') await page.keyboard.press('Escape');
  else if (name !== 'empty') {
    const root = entry === 'public' ? page.locator('.visitor-page') : page.locator('body');
    const button = root.getByRole('button', { name: 'Photos.exe', exact: true }).first();
    if (await button.isVisible()) { await button.click(); interactionPerformed = 'open Photos.exe'; }
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return { readyMs, interactionMs, interactionPerformed, interactionAndTwoFramesMs: performance.now() - frameStart, ...metrics };
}

const entries = [ ['editor', ['empty', 'normal', 'heavy']], ['public', ['empty', 'normal', 'heavy']], ['sample', ['card', 'ig', 'oc']] ] as const;
for (const [entry, names] of entries) for (const name of names) for (const width of [320, 390, 1280]) {
  test(`${entry} ${name} ${width}px cold/warm`, async ({ browser }) => {
    for (let repeat = 0; repeat < repetitions; repeat++) {
      const context = await browser.newContext({ locale: 'zh-TW', viewport: { width, height: 800 } });
      if (entry === 'editor') await context.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Performance.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
      await instrument(page);
      for (const cache of ['cold', 'warm']) {
        const failed: string[] = []; const onFailed = (r: any) => failed.push(new URL(r.url()).hostname);
        page.on('requestfailed', onFailed);
        const result = await open(page, entry, name);
        const runtime = await cdp.send('Performance.getMetrics');
        page.off('requestfailed', onFailed);
        rows.push({ entry, fixture: name, width, repeat, cache, ...result, runtimeMetrics: Object.fromEntries(runtime.metrics.filter(m => ['Nodes', 'LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration', 'JSHeapUsedSize'].includes(m.name)).map(m => [m.name, m.value])), failedRequestHosts: failed });
      }
      await context.close();
    }
  });
}
