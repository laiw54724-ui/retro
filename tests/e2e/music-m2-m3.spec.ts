import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const VIDEO = "https://media.example.com/clip.mp4?v=1";
const AUDIO = "https://media.example.com/theme.wav";
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const videoBytes = readFileSync(join(__dirname, "fixtures/music/generated.mp4"));
const embed = { kind: "providerEmbed", provider: "youtube", resourceType: "video", resourceId: "dQw4w9WgXcQ", canonicalUrl: YOUTUBE, originalUrl: YOUTUBE };
const track = (id: string, source: object) => ({ id, title: id, artist: "Creator", cover: null, coverUrl: "", lyrics: "", rightsNote: "Original", source });
function document(...tracks: ReturnType<typeof track>[]): SiteDocument {
  return { ...structuredClone(documentFixture), windows: [{ id: "music-1", type: "music", title: "Music.exe", icon: "music", defaultOpen: true, layout: { desktop: { x: 60, y: 30, w: 470, h: 650, z: 1, iconX: 16, iconY: 18 }, mobile: { order: 0 } }, content: { tracks, playlist: { id: "list", title: "Test playlist", trackIds: tracks.map((track) => track.id) } } }] } as SiteDocument;
}
const doc = () => document(track("Video", { kind: "audioUrl", url: VIDEO }), track("Audio", { kind: "audioUrl", url: AUDIO }), track("YouTube", embed));
async function openPublic(page: Page, value = doc(), width = 1280) {
  await page.addInitScript(() => localStorage.setItem("retrodesk:locale", "en"));
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Music", published_document: value, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "video/mp4", body: videoBytes }));
  await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Controlled player</p>" }));
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/@demo");
  if (width < 768) await page.getByRole("button", { name: "Music.exe", exact: true }).click();
  return page.getByRole("dialog", { name: "Music.exe", exact: true });
}
async function fakeMedia(page: Page) {
  await page.addInitScript(() => {
    const playing = new Set<HTMLMediaElement>();
    (window as unknown as { activeMedia: Set<HTMLMediaElement> }).activeMedia = playing;
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () { playing.delete(this); this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.play = function () { playing.add(this); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
  });
}
const state = (page: Page) => page.evaluate(() => ({ native: (window as unknown as { activeMedia: Set<HTMLMediaElement> }).activeMedia.size, frames: window.document.querySelectorAll("iframe").length }));

for (const width of [320, 390, 430]) {
  test(`video and provider help work with normal clicks at ${width}px`, async ({ page, context }) => {
    await fakeMedia(page);
    const requests: string[] = [];
    page.on("request", (request) => { if (/media\.example|youtube/.test(request.url())) requests.push(request.url()); });
    const player = await openPublic(page, doc(), width);
    await expect(player.locator("video")).not.toHaveAttribute("src");
    await expect(player.locator("video")).toHaveAttribute("preload", "none");
    await expect(player.locator("video")).toHaveAttribute("playsinline", "");
    expect(requests).toEqual([]);
    await player.getByRole("button", { name: "Load / play video", exact: true }).click();
    await expect.poll(() => state(page)).toEqual({ native: 1, frames: 0 });
    const size = await player.locator("video").boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(200);
    expect(size!.height).toBeGreaterThanOrEqual(112);
    await page.screenshot({ path: `docs/music-m2-m3/video-${width}.png` });
    await player.getByRole("button", { name: "Select Audio", exact: true }).click();
    await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
    await player.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(() => state(page)).toEqual({ native: 1, frames: 0 });
    await player.getByRole("button", { name: "Select YouTube", exact: true }).click();
    await player.getByRole("button", { name: "Load YouTube player", exact: true }).click();
    await expect.poll(() => state(page)).toEqual({ native: 0, frames: 1 });
    await player.getByRole("button", { name: "Can’t play?", exact: true }).click();
    const help = player.locator(".music-playback-help");
    await expect(help).toContainText("Retro cannot confirm the cause");
    const oldFrame = await player.locator("iframe").elementHandle();
    await help.getByRole("button", { name: "Try again", exact: true }).click();
    expect(await oldFrame!.evaluate((frame) => frame.isConnected)).toBe(false);
    await expect(player.locator("iframe")).toHaveCount(1);
    await player.getByRole("button", { name: "Can’t play?", exact: true }).click();
    await page.screenshot({ path: `docs/music-m2-m3/help-${width}.png` });
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    for (const button of await help.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await context.route(YOUTUBE, (route) => route.fulfill({ contentType: "text/html", body: "Original site fixture" }));
    const popupPromise = page.waitForEvent("popup");
    await player.getByRole("button", { name: "Open on YouTube ↗", exact: true }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(YOUTUBE);
    await popup.close();
    await page.setViewportSize({ width: width + 1, height: 900 });
    await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
  });
}

test("loaded iframe offers manual help without claiming playback success; close clears it", async ({ page }) => {
  const player = await openPublic(page, document(track("YouTube", embed)));
  await player.getByRole("button", { name: "Load YouTube player", exact: true }).click();
  await expect(player.locator("iframe")).toHaveCount(1);
  await expect(page.frameLocator("iframe").getByText("Controlled player")).toBeVisible();
  await expect(player.locator(".music-playback-help")).toHaveCount(0);
  await player.getByRole("button", { name: "Can’t play?", exact: true }).click();
  await expect(player.locator(".music-playback-help")).toContainText("Retro cannot confirm the cause");
  await player.getByRole("button", { name: "Close player", exact: true }).click();
  await expect(player.locator(".music-playback-help")).toHaveCount(0);
  await expect(player.locator("iframe")).toHaveCount(0);
});

test("video stops on minimize, close, same-host resize and viewport-host replacement", async ({ page }) => {
  await fakeMedia(page);
  const player = await openPublic(page);
  const play = () => player.getByRole("button", { name: "Load / play video", exact: true }).click();
  await play();
  await player.getByRole("button", { name: "Minimize", exact: true }).click();
  await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
  await page.locator(".visitor-task-buttons").getByRole("button", { name: /Music\.exe/ }).click();
  await play();
  await page.setViewportSize({ width: 1270, height: 900 });
  await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
  await play();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await play();
  await player.getByRole("button", { name: "Close", exact: true }).click();
  await expect.poll(() => state(page)).toEqual({ native: 0, frames: 0 });
});

test("real browser decodes the generated video after click; native controls pause and resume", async ({ page }) => {
  const player = await openPublic(page);
  const video = player.locator("video");
  await player.getByRole("button", { name: "Load / play video", exact: true }).click();
  await expect.poll(() => video.evaluate((node) => ({ width: node.videoWidth, playing: !node.paused }))).toEqual({ width: 320, playing: true });
  const box = await video.boundingBox();
  await video.click({ position: { x: 20, y: box!.height - 48 } });
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(true);
  await video.click({ position: { x: 20, y: box!.height - 48 } });
  await expect.poll(() => video.evaluate((node) => node.paused)).toBe(false);
  await player.getByRole("button", { name: "Select YouTube", exact: true }).click();
  await expect(page.locator("video")).toHaveCount(0);
});

test("wrong MIME or unsupported video offers an honest failure, original link and retry", async ({ page }) => {
  const player = await openPublic(page);
  await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>This is not a media file</p>" }));
  await player.getByRole("button", { name: "Load / play video", exact: true }).click();
  await expect(player.getByRole("alert")).toContainText("format or codecs");
  await expect(player.getByRole("button", { name: "Open original link ↗", exact: true })).toBeVisible();
  await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "video/mp4", body: videoBytes }));
  await player.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => player.locator("video").evaluate((node) => !node.paused && node.videoWidth === 320)).toBe(true);
  await expect(player.getByRole("alert")).toHaveCount(0);
});

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
test("old external video stays external until explicitly converted; save/reload and undo retain the source", async ({ page }) => {
  await page.addInitScript((session) => { localStorage.setItem("retrodesk:locale", "en"); localStorage.setItem("sb-example-auth-token", JSON.stringify(session)); }, session);
  const site = { id: "site-1", username: "demo", site_name: "Music", draft_document: document(track("Video", { kind: "externalLink", url: VIDEO })), draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" };
  const sources: unknown[] = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    site.draft_version += 1;
    const music = site.draft_document.windows.find((window) => window.type === "music");
    if (music?.type === "music") sources.push(music.content.tracks[0].source);
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-19T00:01:00Z" } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const editor = page.locator(".music-track-editor").first();
  await expect(editor.getByTestId("source-explanation")).toContainText("saved as an external link");
  await expect(page.locator("video")).toHaveCount(0);
  await editor.getByLabel("Paste a link or upload a file").fill(VIDEO);
  await expect(editor.getByTestId("source-explanation")).toContainText("saved as an external link");
  await editor.getByRole("button", { name: "Use the in-page player", exact: true }).click();
  await expect.poll(() => sources.at(-1)).toEqual({ kind: "audioUrl", url: VIDEO });
  await page.reload();
  await expect(editor.getByLabel("Paste a link or upload a file")).toHaveValue(VIDEO);
  await expect(editor.locator("video")).not.toHaveAttribute("src");
  await editor.getByRole("button", { name: "Use an external link instead (opens the original site)", exact: true }).click();
  await expect.poll(() => sources.at(-1)).toEqual({ kind: "externalLink", url: VIDEO });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => sources.at(-1)).toEqual({ kind: "audioUrl", url: VIDEO });
  await expect(editor.locator("video")).toHaveCount(1);
});

const previewLocales = process.env.VITE_I18N_PREVIEW_LOCALES === "true";
for (const locale of previewLocales ? ["ja", "ko"] : ["zh-Hant", "en"]) {
  test(`M2/M3 localized controls and help in ${locale}`, async ({ page }) => {
    const copy = JSON.parse(readFileSync(join(__dirname, `../../apps/web/src/i18n/locales/${locale}/music.json`), "utf8"));
    await page.addInitScript((locale) => localStorage.setItem("retrodesk:locale", locale), locale);
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Music", published_document: doc(), published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
    await page.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Controlled player</p>" }));
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/@demo");
    await page.getByRole("button", { name: "Music.exe", exact: true }).click();
    const player = page.getByRole("dialog", { name: "Music.exe", exact: true });
    await expect(player.getByRole("button", { name: copy.m3.playVideo, exact: true })).toBeVisible();
    await expect(player.locator("video")).not.toHaveAttribute("src");
    await player.getByRole("button", { name: copy.music.selectTrack.replace("{{title}}", "YouTube"), exact: true }).click();
    await player.getByRole("button", { name: copy.music.loadPlayer.replace("{{label}}", "YouTube"), exact: true }).click();
    await player.getByRole("button", { name: copy.m2.needHelp, exact: true }).click();
    await expect(player.locator(".music-playback-help")).toContainText(copy.m2.guidance.replace("{{label}}", "YouTube"));
    await expect(player.getByRole("button", { name: copy.m2.retry, exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
