import { expect, test, type Page } from "@playwright/test";
import { makeWindow, SiteDocumentSchema, type SiteDocument } from "../../packages/shared/src/site";
import { migrateSiteDocumentV2, SiteDocumentV2Schema } from "../../packages/shared/src/site-versioning";
import { resolveWindowChrome, type WindowChromePreset } from "../../packages/shared/src/window-chrome";
import { documentFixture } from "./fixture";

function chromeDocument() {
  const document = SiteDocumentSchema.parse(structuredClone(documentFixture));
  document.windows[0].appearance = { titleFrom: "#ffffff", titleTo: "#000000", titleGradient: false };
  document.windows[1].appearance = { titleFrom: "#001144", titleTo: "#004444", titleGradient: true };
  // The first window is already selected and on top. Inspecting it should not
  // be conflated with the existing editor's intentional z-order persistence.
  document.windows[0].layout.desktop.z = 3;
  return document;
}

async function mockCanonicalSite(page: Page, source: SiteDocument = chromeDocument()) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const migrated = migrateSiteDocumentV2(source, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("Chrome fixture migration failed");
  let saved = SiteDocumentV2Schema.parse(migrated.document);
  const initial = structuredClone(saved);
  let writes = 0;
  let version = 1;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/sites/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) writes++;
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: source.siteName, draft_document: saved, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saved = SiteDocumentV2Schema.parse(route.request().postDataJSON().document);
    version++;
    return route.fulfill({ json: { version, updatedAt: "2026-10-17T00:00:00Z" } });
  });
  // Use the same serialized payload to exercise the public rendering boundary;
  // publication authorization itself is covered by the existing publish tests.
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: source.siteName, published_document: saved, published_version: version, published_at: "2026-10-17T00:00:00Z" } } }));
  return { saved: () => saved, writes: () => writes, initial };
}

async function desktopChromeEditor(page: Page) {
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  return page.getByRole("group", { name: "視窗樣式", exact: true });
}

type ChromeAudioAudit = {
  elements: HTMLMediaElement[];
  calls: { load: number; play: number; pause: number };
  interruptions: string[];
};
type AudioAuditWindow = Window & { __retroChromeAudioAudit: ChromeAudioAudit };

/** Observe the native media element without replacing playback or the music coordinator. */
async function observeNativeAudio(page: Page) {
  await page.addInitScript(() => {
    const audit: ChromeAudioAudit = { elements: [], calls: { load: 0, play: 0, pause: 0 }, interruptions: [] };
    (window as AudioAuditWindow).__retroChromeAudioAudit = audit;
    const observe = (audio: HTMLMediaElement) => {
      if (audit.elements.includes(audio)) return;
      audit.elements.push(audio);
      // These native lifecycle events expose reloads or pauses even if a caller
      // changes src directly instead of invoking the public media methods.
      for (const event of ["loadstart", "emptied", "pause", "ended", "error"]) {
        audio.addEventListener(event, () => audit.interruptions.push(event));
      }
    };
    const nativeLoad = HTMLMediaElement.prototype.load;
    const nativePlay = HTMLMediaElement.prototype.play;
    const nativePause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.load = function () { observe(this); audit.calls.load++; return nativeLoad.call(this); };
    HTMLMediaElement.prototype.play = function () { observe(this); audit.calls.play++; return nativePlay.call(this); };
    HTMLMediaElement.prototype.pause = function () { observe(this); audit.calls.pause++; return nativePause.call(this); };
  });
}

/** A self-authored, silent PCM WAV makes real decoding independent of remote media or codecs. */
function silentPcmWave(seconds = 60) {
  const sampleRate = 8_000;
  const sampleBytes = 2;
  const dataBytes = seconds * sampleRate * sampleBytes;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20); // PCM
  wave.writeUInt16LE(1, 22); // mono
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * sampleBytes, 28);
  wave.writeUInt16LE(sampleBytes, 32);
  wave.writeUInt16LE(sampleBytes * 8, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(dataBytes, 40);
  return wave;
}

test("chrome previews locally, cancels without writes and survives apply, reload, visitor preview and public rendering", async ({ page }, testInfo) => {
  const site = await mockCanonicalSite(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const live = page.getByRole("dialog", { name: "About.exe", exact: true });
  const editor = await desktopChromeEditor(page);
  const preview = editor.getByRole("group", { name: "樣式預覽", exact: true });
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-98");
  for (const name of ["選單列", "工具列", "底部操作列"]) await expect(editor.getByRole("checkbox", { name, exact: true })).toBeDisabled();
  await expect(editor.getByRole("checkbox", { name: "狀態列", exact: true })).toBeEnabled();

  await editor.getByRole("button", { name: /^Classic 95/ }).click();
  await expect(preview).toHaveAttribute("data-chrome-preset", "classic-95");
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-98");
  await expect(editor.getByRole("status")).toContainText("預覽中，尚未套用");
  // Observe longer than the actual 650ms save debounce.
  await page.waitForTimeout(800);
  expect(site.writes()).toBe(0);
  await editor.getByRole("button", { name: "取消樣式變更", exact: true }).click();
  await expect(preview).toHaveAttribute("data-chrome-preset", "classic-98");
  await expect(editor.getByRole("button", { name: "套用視窗樣式", exact: true })).toBeDisabled();

  await editor.getByRole("button", { name: /^Compact 98/ }).click();
  await editor.getByRole("combobox", { name: "視窗控制鈕", exact: true }).selectOption("close");
  await editor.getByRole("checkbox", { name: "顯示標題圖示", exact: true }).uncheck();
  await editor.getByRole("checkbox", { name: "狀態列", exact: true }).check();
  await expect(preview.locator(".retro-titlebar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await editor.getByRole("button", { name: "套用視窗樣式", exact: true }).click();
  await expect(live).toHaveAttribute("data-chrome-preset", "compact-98");
  await expect(live.locator('[data-chrome-slot="statusBar"]')).toBeVisible();
  await expect(live.locator('[data-chrome-slot="menuBar"]')).toBeHidden();
  await expect(live.locator(".retro-titlebar .w98-icon")).toHaveCount(0);
  await expect(live.getByRole("button", { name: "最小化", exact: true })).toHaveCount(0);
  await expect(live.getByRole("button", { name: "關閉", exact: true })).toBeVisible();
  await expect.poll(() => site.writes()).toBe(1);
  await expect.poll(() => site.saved().windows[0].chrome?.preset).toBe("compact-98");
  expect(site.saved().windows[0].chrome).toEqual(resolveWindowChrome({ preset: "compact-98", controls: ["close"], showIcon: false, sections: { statusBar: true } }));
  expect(site.saved().windows[0].content).toEqual(site.initial.windows[0].content);
  expect(site.saved().windows[0].appearance).toEqual(site.initial.windows[0].appearance);
  expect(site.saved().windows[0].layout).toEqual(site.initial.windows[0].layout);
  await page.screenshot({ path: testInfo.outputPath("desktop-chrome-editor.png") });

  await page.reload();
  await expect(live).toHaveAttribute("data-chrome-preset", "compact-98");
  await page.getByRole("button", { name: "▶ 訪客預覽", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "訪客預覽", exact: true });
  const visitor = overlay.getByRole("dialog", { name: "About.exe", exact: true });
  await expect(visitor).toHaveAttribute("data-chrome-preset", "compact-98");
  await expect(visitor.locator(".retro-titlebar")).toHaveCSS("color", "rgb(0, 0, 0)");
  await overlay.getByRole("button", { name: "手機版", exact: true }).click();
  await overlay.getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(visitor).toHaveAttribute("data-chrome-preset", "compact-98");
  await expect(visitor.locator(".m-win-title .w98-icon")).toHaveCount(0);
  await expect(visitor.getByRole("button", { name: "‹ 桌面", exact: true })).toBeVisible();
  await overlay.getByRole("button", { name: "‹ 回到編輯器", exact: true }).click();
  await page.goto("/@demo");
  const published = page.getByRole("dialog", { name: "About.exe", exact: true });
  await expect(published).toHaveAttribute("data-chrome-preset", "compact-98");
  await expect(published.locator(".retro-titlebar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(published.locator('[data-chrome-slot="statusBar"]')).toBeVisible();
  expect(site.writes()).toBe(1);
});

test("mobile chrome edits and reset remain local until Apply and retain custom appearance and content", async ({ page }) => {
  const site = await mockCanonicalSite(page);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await page.getByRole("button", { name: "視窗設定", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "視窗設定", exact: true });
  await sheet.locator("summary").filter({hasText:"更多視窗設定"}).click();
  const editor = sheet.getByRole("group", { name: "視窗樣式", exact: true });
  const live = page.getByRole("dialog", { name: "About.exe", exact: true });
  await editor.getByRole("button", { name: /^Classic 95/ }).click();
  await expect(editor.getByRole("group", { name: "樣式預覽", exact: true })).toHaveAttribute("data-chrome-preset", "classic-95");
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-98");
  await editor.getByRole("button", { name: "取消樣式變更", exact: true }).click();
  await page.waitForTimeout(800);
  expect(site.writes()).toBe(0);
  await editor.getByRole("button", { name: /^Classic 95/ }).click();
  await editor.getByRole("checkbox", { name: "顯示標題圖示", exact: true }).uncheck();
  await editor.getByRole("button", { name: "套用視窗樣式", exact: true }).click();
  await expect.poll(() => site.writes()).toBe(1);
  await expect.poll(() => site.saved().windows[0].chrome?.preset).toBe("classic-95");
  await sheet.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-95");
  await expect(live.locator(".m-inline-titlebar .w98-icon")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-95");
  await page.getByRole("button", { name: "視窗設定", exact: true }).click();
  await sheet.locator("summary").filter({hasText:"更多視窗設定"}).click();
  await editor.getByRole("button", { name: "重設視窗樣式", exact: true }).click();
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-95");
  await page.waitForTimeout(800);
  expect(site.writes()).toBe(1);
  await editor.getByRole("button", { name: "套用視窗樣式", exact: true }).click();
  await expect.poll(() => site.writes()).toBe(2);
  await expect.poll(() => site.saved().windows[0].chrome).toBeUndefined();
  expect(site.saved().windows[0].appearance).toEqual(site.initial.windows[0].appearance);
  expect(site.saved().windows[0].content).toEqual(site.initial.windows[0].content);
  expect(site.saved().windows[0].layout).toEqual(site.initial.windows[0].layout);
  await sheet.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(live).toHaveAttribute("data-chrome-preset", "classic-98");
  await expect(live.locator(".m-inline-titlebar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

const phoneCases: Array<{ width: number; preset: WindowChromePreset }> = [
  { width: 320, preset: "classic-95" }, { width: 375, preset: "classic-98" }, { width: 430, preset: "compact-98" }
];
for (const { width, preset } of phoneCases) {
  test(`mobile ${preset} at ${width}px keeps stored colors, icon visibility and an accessible way back`, async ({ page }, testInfo) => {
    const source = chromeDocument();
    source.windows[0].chrome = resolveWindowChrome({ preset, controls: [], showIcon: false });
    source.windows[1].chrome = resolveWindowChrome({ preset: "classic-98", controls: ["close"] });
    const site = await mockCanonicalSite(page, source);
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    await page.getByRole("button", { name: "About.exe", exact: true }).click();
    const about = page.getByRole("dialog", { name: "About.exe", exact: true });
    await expect(about).toHaveAttribute("data-chrome-preset", preset);
    await expect(about.locator(".m-win-title")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(about.locator(".m-win-title")).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(about.locator(".m-win-title .w98-icon")).toHaveCount(0);
    await expect(about.getByRole("button", { name: "關閉", exact: true })).toHaveCount(0);
    const back = about.getByRole("button", { name: "‹ 桌面", exact: true });
    const backBounds = await back.boundingBox();
    if (!backBounds) throw new Error("Missing mobile back button bounds");
    expect(backBounds.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    if (width === 375) await page.screenshot({ path: testInfo.outputPath("mobile-window-chrome.png") });
    await back.click();
    await expect(about).toBeHidden();
    await page.getByRole("button", { name: "Links.exe", exact: true }).click();
    const links = page.getByRole("dialog", { name: "Links.exe", exact: true });
    await expect(links.locator(".m-win-title .w98-icon")).toHaveCount(1);
    await expect(links.locator(".m-win-title")).toHaveCSS("background-image", "linear-gradient(90deg, rgb(0, 17, 68), rgb(0, 68, 68))");
    await expect(links.getByRole("button", { name: "最大化", exact: true })).toHaveCount(0);
    const close = links.getByRole("button", { name: "關閉", exact: true });
    const closeBounds = await close.boundingBox();
    if (!closeBounds) throw new Error("Missing mobile close button bounds");
    expect(closeBounds.height).toBeGreaterThanOrEqual(44);
    expect(closeBounds.width).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(links).toBeHidden();
    expect(site.writes()).toBe(0);
    expect(site.saved()).toEqual(site.initial);
  });
}

test("visitor window drag, resize, focus and controls remain runtime-only inside editor preview", async ({ page }) => {
  const source = chromeDocument();
  source.windows[0].chrome = resolveWindowChrome({ preset: "classic-95" });
  const site = await mockCanonicalSite(page, source);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "▶ 訪客預覽", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "訪客預覽", exact: true });
  const desktop = overlay.locator(".visitor-desktop");
  const about = desktop.getByRole("dialog", { name: "About.exe", exact: true });
  const frame = about.locator("..");
  const initialBounds = await frame.boundingBox();
  const title = await about.locator(".retro-titlebar").boundingBox();
  if (!initialBounds || !title) throw new Error("Missing window bounds");
  await page.mouse.move(title.x + 60, title.y + title.height / 2);
  await page.mouse.down();
  await page.mouse.move(title.x + 108, title.y + title.height / 2 + 36, { steps: 6 });
  await page.mouse.up();
  const moved = await frame.boundingBox();
  expect(moved!.x).toBeCloseTo(initialBounds.x + 48, 0);
  expect(moved!.y).toBeCloseTo(initialBounds.y + 36, 0);
  const grip = await frame.locator(".window-resize-handle").boundingBox();
  if (!grip || !moved) throw new Error("Missing resize handle");
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 64, grip.y + grip.height / 2 + 48, { steps: 6 });
  await page.mouse.up();
  const resized = await frame.boundingBox();
  expect(resized!.width).toBeCloseTo(moved.width + 64, 0);
  expect(resized!.height).toBeCloseTo(moved.height + 48, 0);

  await desktop.locator(".visitor-icon").filter({ hasText: "Links.exe" }).click();
  const links = desktop.getByRole("dialog", { name: "Links.exe", exact: true });
  await expect(links).toHaveAttribute("data-active", "true");
  await expect(about).toHaveAttribute("data-active", "false");
  await about.locator(".retro-titlebar").click({ position: { x: 45, y: 10 } });
  await expect(about).toHaveAttribute("data-active", "true");
  await about.getByRole("button", { name: "最大化", exact: true }).click();
  await expect(about).toHaveAttribute("data-maximized", "true");
  await about.getByRole("button", { name: "還原", exact: true }).click();
  await expect(about).toHaveAttribute("data-maximized", "false");
  await about.getByRole("button", { name: "最小化", exact: true }).click();
  await expect(about).toBeHidden();
  await desktop.locator(".visitor-taskbar").getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(about).toBeVisible();
  await about.getByRole("button", { name: "關閉", exact: true }).click();
  await expect(about).toBeHidden();
  await desktop.locator(".visitor-icon").filter({ hasText: "About.exe" }).click();
  await expect(about).toBeVisible();
  await overlay.getByRole("button", { name: "‹ 回到編輯器", exact: true }).click();
  await page.waitForTimeout(800);
  expect(site.writes()).toBe(0);
  expect(site.saved()).toEqual(site.initial);
});

test("switching presets preserves the same real Minesweeper game's local state", async ({ page }) => {
  const source = chromeDocument();
  const game = makeWindow("minesweeper", 0);
  game.id = "chrome-mines";
  game.defaultOpen = true;
  game.layout.desktop = { ...game.layout.desktop, x: 40, y: 40, w: 520, h: 600 };
  source.windows = [game];
  const site = await mockCanonicalSite(page, source);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const live = page.getByRole("dialog", { name: "Minesweeper.exe", exact: true });
  const firstCell = live.getByRole("gridcell").first();
  const flagMode = live.getByRole("button", { name: /手機標記模式/ });
  await flagMode.click();
  await firstCell.click();
  await expect(firstCell).toHaveAttribute("aria-label", /已標記/);
  const editor = await desktopChromeEditor(page);
  for (const [index, preset] of ["Classic 95", "Compact 98"].entries()) {
    await editor.getByRole("button", { name: new RegExp(`^${preset}`) }).click();
    await editor.getByRole("button", { name: "套用視窗樣式", exact: true }).click();
    await expect(live).toHaveAttribute("data-chrome-preset", index === 0 ? "classic-95" : "compact-98");
    await expect(firstCell).toHaveAttribute("aria-label", /已標記/);
    await expect(flagMode).toHaveAttribute("aria-pressed", "true");
    await expect(live.getByRole("gridcell")).toHaveCount(64);
    await expect(page.getByLabel("標題列預覽", { exact: true })).toHaveCSS("background-image", index === 0 ? "none" : "linear-gradient(90deg, rgb(0, 0, 128), rgb(16, 132, 208))");
    await expect.poll(() => site.writes()).toBe(index + 1);
    await expect.poll(() => site.saved().windows[0].chrome?.preset).toBe(index === 0 ? "classic-95" : "compact-98");
    expect(site.saved().windows[0].content).toEqual(site.initial.windows[0].content);
    expect(site.saved().windows[0].layout).toEqual(site.initial.windows[0].layout);
  }
});

test.describe("desktop touch chrome", () => {
  test.use({ hasTouch: true, viewport: { width: 1440, height: 1000 } });
  test("layout overlay leaves the entire enlarged control target clickable", async ({ page }) => {
    const site = await mockCanonicalSite(page);
    await page.goto("/editor/site-1");
    await page.locator(".icon-layer").click({ position: { x: 90, y: 440 } });
    await page.getByRole("button", { name: "▦ 進入桌面排版模式", exact: true }).click();
    const live = page.getByRole("dialog", { name: "About.exe", exact: true });
    for (const name of ["最小化", "最大化", "關閉"]) {
      const button = live.getByRole("button", { name, exact: true });
      const hits = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, accessible: [0.25, 0.5, 0.75].every((fraction) => element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height * fraction))) };
      });
      expect(hits.width).toBeGreaterThanOrEqual(44);
      expect(hits.height).toBeGreaterThanOrEqual(44);
      expect(hits.accessible).toBe(true);
    }
    await live.getByRole("button", { name: "關閉", exact: true }).click({ position: { x: 22, y: 35 } });
    await expect(live).toBeHidden();
    await page.waitForTimeout(800);
    expect(site.writes()).toBe(0);
  });
});

test("applying chrome presets preserves real music playback, native audio identity and its running position without reloads", async ({ page }) => {
  await observeNativeAudio(page);
  const mediaUrl = "https://media.example.com/window-chrome-silence.wav";
  const wave = silentPcmWave();
  await page.route(mediaUrl, (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wave.length - 1) : wave.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "audio/wav",
      headers: {
        "accept-ranges": "bytes", "cache-control": "no-store",
        ...(range ? { "content-range": `bytes ${start}-${end}/${wave.length}` } : {})
      },
      body: wave.subarray(start, end + 1)
    });
  });
  const source = chromeDocument();
  const music = makeWindow("music", 0);
  if (music.type !== "music") throw new Error("Expected a music fixture");
  music.id = "chrome-music";
  music.layout.desktop = { ...music.layout.desktop, x: 40, y: 40, w: 520, h: 680 };
  music.content = {
    tracks: [{ id: "chrome-track", title: "Native continuity fixture", artist: "Local test", cover: null, coverUrl: "", source: { kind: "audioUrl", url: mediaUrl }, lyrics: "", rightsNote: "Self-authored silent PCM fixture" }],
    playlist: { id: "chrome-playlist", title: "Chrome continuity", trackIds: ["chrome-track"] }
  };
  source.windows = [music];
  const site = await mockCanonicalSite(page, source);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const live = page.getByRole("dialog", { name: "Music Player.exe", exact: true });
  const trackInput = live.getByLabel("曲名", { exact: true });
  const originalInput = await trackInput.elementHandle();
  await live.getByRole("button", { name: "▶ 試聽", exact: true }).click();
  const playingTask = page.getByRole("button", { name: "Music Player.exe · 播放中", exact: true });
  await expect(live.getByRole("button", { name: "Ⅱ 停止試聽", exact: true })).toBeVisible();
  await expect(playingTask).toBeVisible();

  // The production coordinator owns a detached new Audio(), so use a handle to
  // that native element instead of adding a test-only <audio> to the component.
  const originalAudio = await page.evaluateHandle(() => (window as AudioAuditWindow).__retroChromeAudioAudit.elements[0]);
  expect(await originalAudio.evaluate((audio) => audio instanceof HTMLAudioElement)).toBe(true);
  await expect.poll(() => originalAudio.evaluate((audio) => audio.duration)).toBeCloseTo(60, 2);
  await expect.poll(() => originalAudio.evaluate((audio) => audio.currentTime)).toBeGreaterThan(0.1);
  await originalAudio.evaluate((audio) => { audio.currentTime = 12; });
  await expect.poll(() => originalAudio.evaluate((audio) => audio.currentTime)).toBeGreaterThan(12.2);
  await expect.poll(() => originalAudio.evaluate((audio) => audio.seeking)).toBe(false);
  const baseline = await page.evaluate(() => {
    const audit = (window as AudioAuditWindow).__retroChromeAudioAudit;
    return { calls: { ...audit.calls }, interruptions: [...audit.interruptions] };
  });
  expect(baseline.calls).toEqual({ load: 1, play: 1, pause: 1 });
  const editor = await desktopChromeEditor(page);

  for (const [index, [label, preset]] of [["Classic 95", "classic-95"], ["Compact 98", "compact-98"]].entries()) {
    const beforeTime = await originalAudio.evaluate((audio) => audio.currentTime);
    await editor.getByRole("button", { name: new RegExp(`^${label}`) }).click();
    await editor.getByRole("button", { name: "套用視窗樣式", exact: true }).click();
    await expect(live).toHaveAttribute("data-chrome-preset", preset);
    // Wait through the actual autosave boundary before checking continuity.
    await expect.poll(() => site.writes()).toBe(index + 1);
    await expect.poll(() => site.saved().windows[0].chrome?.preset).toBe(preset);
    await expect(playingTask).toBeVisible();
    await expect(live.getByRole("button", { name: "Ⅱ 停止試聽", exact: true })).toBeVisible();
    expect(await trackInput.evaluate((input, original) => input === original, originalInput)).toBe(true);
    expect(await page.evaluate((original) => {
      const elements = (window as AudioAuditWindow).__retroChromeAudioAudit.elements;
      return elements.length === 1 && elements[0] === original;
    }, originalAudio)).toBe(true);
    const audioState = await originalAudio.evaluate((audio) => ({ currentTime: audio.currentTime, paused: audio.paused, ended: audio.ended, src: audio.currentSrc, error: audio.error?.code ?? null }));
    expect(audioState).toMatchObject({ paused: false, ended: false, src: mediaUrl, error: null });
    expect(audioState.currentTime).toBeGreaterThan(beforeTime);
    expect(await page.evaluate(() => {
      const audit = (window as AudioAuditWindow).__retroChromeAudioAudit;
      return { calls: audit.calls, interruptions: audit.interruptions };
    })).toEqual(baseline);
    expect(site.saved().windows[0].content).toEqual(site.initial.windows[0].content);
    expect(site.saved().windows[0].layout).toEqual(site.initial.windows[0].layout);
  }
});
