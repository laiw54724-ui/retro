import { expect, test, type Page, type CDPSession } from '@playwright/test';
import { fixtures, session } from './fixtures';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const output = 'docs/quality/followup-75/raw';
const label = process.env.FOLLOWUP_LABEL ?? 'baseline';
const rows: unknown[] = [];
const cycles: unknown[] = [];
const repeats = 3;
const selected = [['editor', 'heavy'], ['public', 'heavy'], ['sample', 'ig']] as const;
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const bundle = readdirSync('apps/web/dist/assets').filter(file => /\.(js|css)$/.test(file)).map(file => {
  const value = readFileSync(`apps/web/dist/assets/${file}`);
  return { file, bytes: value.length, gzipBytes: gzipSync(value).length, brotliBytes: brotliCompressSync(value).length, sha256: hash(value) };
});
const entry = bundle.find(file => /^index-.*\.js$/.test(file.file))!;
const entryMap = JSON.parse(readFileSync(`apps/web/dist/assets/${entry.file}.map`, 'utf8'));
const sources = entryMap.sources.map((source: string, index: number) => ({ source, originalSourceBytes: Buffer.byteLength(entryMap.sourcesContent[index] ?? '') }));
const metrics = async (cdp: CDPSession) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
const twoFrames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function setup(page: Page, cdp: CDPSession, editor: boolean) {
  if (editor) await page.addInitScript(value => localStorage.setItem('sb-example-auth-token', JSON.stringify(value)), session);
  await page.addInitScript(() => {
    localStorage.setItem('retrodesk:locale', 'zh-Hant');
    const state = { longTasks: [] as number[], shifts: [] as number[], lcp: 0 };
    (window as any).__followup75 = state;
    new PerformanceObserver(list => { for (const item of list.getEntries()) state.longTasks.push(item.duration); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(list => { for (const item of list.getEntries() as any) if (!item.hadRecentInput) state.shifts.push(item.value); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const item of list.getEntries()) state.lcp = item.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
  await cdp.send('Performance.enable');
}
async function open(page: Page, entry: string) {
  const start = performance.now();
  await page.goto(entry === 'editor' ? '/editor/fixture-heavy' : entry === 'public' ? '/@fixture-heavy' : '/');
  if (entry === 'editor') await expect(page.locator('.editor-topbar')).toBeVisible();
  if (entry === 'public') await expect(page.locator('.visitor-page')).toBeVisible();
  let sampleOpenAndTwoFramesMs: number | null = null;
  if (entry === 'sample') {
    const before = performance.now();
    await page.locator('.example-card').nth(1).click();
    await expect(page.locator('.preview-overlay')).toBeVisible();
    await twoFrames(page); sampleOpenAndTwoFramesMs = performance.now() - before;
  }
  const readyMs = performance.now() - start;
  await page.waitForTimeout(800);
  return { readyMs, sampleOpenAndTwoFramesMs, ...await page.evaluate(() => {
    const state = (window as any).__followup75;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      loadMs: nav.loadEventEnd,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      observedLcpMs: state.lcp, cls: state.shifts.reduce((sum: number, value: number) => sum + value, 0),
      longTasks: state.longTasks,
      resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(item => ({ path: new URL(item.name).pathname, kind: item.initiatorType, transferBytes: item.transferSize, encodedBytes: item.encodedBodySize, durationMs: item.duration })),
      images: Array.from(document.images, image => ({ path: new URL(image.currentSrc || image.src, location.href).pathname, width: image.naturalWidth, height: image.naturalHeight, renderedWidth: image.getBoundingClientRect().width, renderedHeight: image.getBoundingClientRect().height, complete: image.complete, loading: image.loading, decoding: image.decoding })),
      dom: document.querySelectorAll('*').length,
      media: document.querySelectorAll('audio,video,iframe').length,
    };
  }) };
}
async function previewCycle(page: Page, cdp: CDPSession, width: number) {
  const before = await metrics(cdp);
  const domBefore = await page.locator('*').count();
  const opener = width < 768 ? page.locator('.m-tool', { hasText: '預覽' }).first() : page.getByRole('button', { name: /訪客預覽/ }).first();
  const start = performance.now();
  await opener.click(); await expect(page.locator('.preview-overlay')).toBeVisible(); await twoFrames(page);
  const opened = await metrics(cdp); const openAndTwoFramesMs = performance.now() - start;
  const closing = performance.now();
  await page.locator('.preview-overlay').getByRole('button', { name: /回到編輯器/ }).click();
  await expect(page.locator('.preview-overlay')).toHaveCount(0); await twoFrames(page);
  const closed = await metrics(cdp);
  return { openAndTwoFramesMs, closeAndTwoFramesMs: performance.now() - closing,
    openScriptMs: 1000 * (opened.ScriptDuration - before.ScriptDuration), openLayoutMs: 1000 * (opened.LayoutDuration - before.LayoutDuration),
    closeScriptMs: 1000 * (closed.ScriptDuration - opened.ScriptDuration),
    domBefore, domAfter: await page.locator('*').count(), heapBefore: before.JSHeapUsedSize, heapAfter: closed.JSHeapUsedSize,
    mediaAfter: await page.locator('audio,video,iframe').count() };
}
for (const [entryName, fixture] of selected) for (const width of [390, 1280]) {
  test(`followup ${entryName} ${fixture} ${width}px`, async ({ browser }) => {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const context = await browser.newContext({ locale: 'zh-TW', viewport: { width, height: 800 } });
      const page = await context.newPage(); const cdp = await context.newCDPSession(page);
      await setup(page, cdp, entryName === 'editor');
      for (const cache of ['cold', 'warm']) {
        const result = await open(page, entryName);
        const editorChunk = bundle.find(file => /^CollaborativeSitePage-.*\.js$/.test(file.file));
        if (editorChunk) expect(result.resources.some(resource => resource.path.endsWith(editorChunk.file))).toBe(entryName === 'editor');
        if (width === 1280 && entryName !== 'sample') expect(result.images.some(image => image.width === 1024 && image.height === 768)).toBe(true);
        rows.push({ entry: entryName, fixture, width, repeat, cache, ...result, runtime: await metrics(cdp) });
      }
      if (entryName === 'editor') cycles.push({ width, repeat, ...await previewCycle(page, cdp, width) });
      await context.close();
    }
  });
}

test('one separate public heavy desktop CPU diagnostic', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage(); const cdp = await context.newCDPSession(page);
  await setup(page, cdp, false);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
  await open(page, 'public');
  const { profile } = await cdp.send('Profiler.stop');
  const require = createRequire(resolve('package.json'));
  const mapPackage = readdirSync('node_modules/.pnpm').find(name => name.startsWith('source-map-js@'))!;
  const { SourceMapConsumer } = require(resolve(`node_modules/.pnpm/${mapPackage}/node_modules/source-map-js`));
  const consumer = new SourceMapConsumer(entryMap);
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const self = new Map<string, number>();
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const frame = nodes.get(profile.samples![index])!.callFrame;
    let source = frame.functionName || '(anonymous)';
    if (frame.url.endsWith(entry.file)) {
      const original = consumer.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber });
      source = original.source ?? `${entry.file}:${frame.lineNumber}`;
    } else if (frame.url) source = new URL(frame.url).pathname;
    self.set(source, (self.get(source) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000);
  }
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/${label}-cpu.json`, JSON.stringify({ sha, separateDiagnostic: true, intervalUs: 1000, sampledSelfMs: [...self].sort((a, b) => b[1] - a[1]), profile }, null, 2) + '\n');
  await context.close();
});

test.afterAll(async ({ browser }) => {
  mkdirSync(output, { recursive: true });
  writeFileSync(`${output}/${label}.json`, JSON.stringify({ sha, label, collectedAt: new Date().toISOString(), browser: browser.version(), node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0].model, cores: cpus().length,
    setup: { mode: 'production Vite', repetitions: repeats, viewportHeight: 800, network: 'loopback uncompressed fixture server; HTTPS blocked with CDP; no request routing/proxy', cpuThrottle: 1, networkThrottle: 'none', cache: 'fresh context cold then same-context warm; hashed assets/images max-age=3600, font no-cache without validators', observationAfterReadyMs: 800, sampleLcp: 'landing document LCP; not app-open LCP', latency: 'lab readiness/click-to-two-frames proxies, not field INP or React commits' },
    fixtures: { heavy: { sha256: hash(JSON.stringify(fixtures.heavy)), bytes: Buffer.byteLength(JSON.stringify(fixtures.heavy)), windows: fixtures.heavy.windows.length, profiles: fixtures.heavy.entities.profiles.length, galleryImages: fixtures.heavy.windows.find((window: any) => window.type === 'gallery').content.images.length }, png: { sha256: hash(readFileSync('tests/tmp/quality-image.png')), bytes: readFileSync('tests/tmp/quality-image.png').length, width: 1024, height: 768 }, sample: 'existing built-in ig sample; no injected private fixture' },
    bundle, sources, rows, cycles }, null, 2) + '\n');
});
