import { expect, test, type Page } from "@playwright/test";
import type { SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

const SPOTIFY = "https://open.spotify.com/track/50q2aUjWoTn6CJIfSPRJQA";
const SPOTIFY_WITH_PARAMS = `${SPOTIFY}?si=abc123`;
const YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

type Source = Record<string, unknown>;
const track = (id: string, title: string, source: Source) => ({ id, title, artist: "", cover: null, coverUrl: "", source, lyrics: "", rightsNote: "" });
const embedSource = (provider: "spotify" | "youtube", url: string): Source => provider === "spotify"
  ? { kind: "providerEmbed", provider, resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: SPOTIFY, originalUrl: url }
  : { kind: "providerEmbed", provider, resourceType: "video", resourceId: "dQw4w9WgXcQ", canonicalUrl: YOUTUBE, originalUrl: url };

function musicWindow(title: string, tracks: ReturnType<typeof track>[], index = 0) {
  return {
    id: "music-1", type: "music" as const, title, icon: "music", defaultOpen: true,
    layout: { desktop: { x: 80 + index * 430, y: 40, w: 420, h: 520, z: index + 1, iconX: 16, iconY: 18 }, mobile: { order: index } },
    content: { tracks, playlist: { id: "pl", title: "List", trackIds: tracks.map((t) => t.id) } }
  };
}
const doc = (...windows: ReturnType<typeof musicWindow>[]): SiteDocument => ({ ...structuredClone(documentFixture), windows } as SiteDocument);

async function stubPlatforms(page: Page, opts: { hang?: boolean } = {}) {
  await page.route(/https:\/\/(open\.spotify\.com|www\.youtube-nocookie\.com)\/.*/, (route) => {
    if (opts.hang) return; // never answers
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>stub player</title><p>stub</p>" });
  });
}

/** Valid, self-authored PCM: even a mocked play() must not load a corrupt file. */
function silentPcmWave() {
  const sampleRate = 8_000;
  const dataBytes = sampleRate * 2;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(dataBytes, 40);
  return wave;
}

async function installFakeMedia(page: Page) {
  await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "audio/wav", body: silentPcmWave() }));
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
    Object.defineProperty(HTMLMediaElement.prototype, "seekable", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 90 }) });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
  });
}

async function openPublic(page: Page, document: SiteDocument, viewport = { width: 1280, height: 800 }) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: document, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
  await page.setViewportSize(viewport);
  await page.goto("/@demo");
  if (viewport.width < 768) await page.locator(".visitor-mobile").getByRole("button", { name: "Music.exe" }).click();
  return page.getByRole("dialog", { name: "Music.exe" });
}

async function openEditor(page: Page, document: SiteDocument) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: structuredClone(document), draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" };
  const saves: SiteDocument[] = [];
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocument };
    saves.push(body.document);
    site.draft_document = structuredClone(body.document) as typeof site.draft_document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-17T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const player = page.getByRole("dialog", { name: "Music.exe" });
  await expect(player).toBeVisible();
  return { player, saves };
}

const lastTrackSource = (saves: SiteDocument[]) => {
  const window = saves.at(-1)?.windows.find((w) => w.type === "music");
  return window && window.type === "music" ? (window.content.tracks[0].source as Record<string, unknown>) : undefined;
};

test.describe("author: platform links stored as audio", () => {
  test("explains that a Spotify page is not an audio file, keeps the pasted URL and never plays it", async ({ page }) => {
    await stubPlatforms(page);
    const { player, saves } = await openEditor(page, doc(musicWindow("Music.exe", [track("t1", "Pasted", { kind: "audioUrl", url: SPOTIFY_WITH_PARAMS })])));
    const editor = player.locator(".music-track-editor").first();
    await expect(editor.getByRole("note")).toContainText("這是 Spotify 的網頁連結，不是音訊檔");
    await expect(editor.getByRole("button", { name: "▶ 試聽" })).toBeDisabled();
    await expect(editor.getByLabel("音訊直連（HTTPS）")).toHaveValue(SPOTIFY_WITH_PARAMS);

    // switching types never replaces the link with "https://"
    await editor.getByRole("button", { name: "改成外部連結" }).click();
    await expect(editor.getByLabel("平台／作品頁連結")).toHaveValue(SPOTIFY_WITH_PARAMS);
    await editor.getByRole("button", { name: "HTTPS 音訊" }).click();
    await expect(editor.getByLabel("音訊直連（HTTPS）")).toHaveValue(SPOTIFY_WITH_PARAMS);
    await editor.getByRole("button", { name: "外部連結", exact: true }).click();
    await expect(editor.getByLabel("平台／作品頁連結")).toHaveValue(SPOTIFY_WITH_PARAMS);
    await expect.poll(() => lastTrackSource(saves)).toMatchObject({ kind: "externalLink", url: SPOTIFY_WITH_PARAMS });
  });

  test("offers an official player for Spotify/YouTube and stores only validated ids", async ({ page }) => {
    await stubPlatforms(page);
    const { player, saves } = await openEditor(page, doc(musicWindow("Music.exe", [track("t1", "Pasted", { kind: "externalLink", url: SPOTIFY_WITH_PARAMS })])));
    const editor = player.locator(".music-track-editor").first();
    await expect(editor.getByRole("note")).toContainText("Spotify 的單曲");
    await editor.getByRole("button", { name: "改為平台播放器" }).click();
    await expect(editor.getByText("已辨識：Spotify 單曲")).toBeVisible();
    await expect(editor.locator("iframe")).toHaveCount(0); // nothing loads until someone clicks
    await expect.poll(() => lastTrackSource(saves)).toEqual({ kind: "providerEmbed", provider: "spotify", resourceType: "track", resourceId: "50q2aUjWoTn6CJIfSPRJQA", canonicalUrl: SPOTIFY, originalUrl: SPOTIFY_WITH_PARAMS });

    // pasting a YouTube link into the player field switches provider; unsupported links stay external with an explanation
    const field = editor.getByLabel("Spotify / YouTube 網址");
    await field.fill(YOUTUBE);
    await expect(editor.getByText("已辨識：YouTube 影片")).toBeVisible();
    await expect.poll(() => lastTrackSource(saves)).toMatchObject({ kind: "providerEmbed", provider: "youtube", resourceId: "dQw4w9WgXcQ", originalUrl: YOUTUBE });
    await field.fill("https://soundcloud.com/artist/song");
    await expect(editor.getByRole("status")).toContainText("SoundCloud");
    await expect.poll(() => lastTrackSource(saves)).toMatchObject({ kind: "externalLink", url: "https://soundcloud.com/artist/song" });
    await field.fill("https://open.spotify.com.evil.example/track/50q2aUjWoTn6CJIfSPRJQA");
    await expect.poll(() => lastTrackSource(saves)).toMatchObject({ kind: "externalLink" });
    expect(JSON.stringify(saves.at(-1))).not.toContain('"providerEmbed"');
  });
});

test.describe("visitor: official platform players", () => {
  const spotify = track("sp", "Spotify Song", embedSource("spotify", SPOTIFY_WITH_PARAMS));
  const youtube = track("yt", "YouTube Song", embedSource("youtube", YOUTUBE));
  const native = track("nat", "Native Song", { kind: "audioUrl", url: "https://media.example.com/a.mp3" });

  test("nothing loads until the visitor asks; the iframe is exactly the official, sandboxed URL", async ({ page }) => {
    await stubPlatforms(page);
    const requested: string[] = [];
    page.on("request", (request) => { if (/spotify|youtube/.test(request.url())) requested.push(request.url()); });
    const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify, youtube, native])));
    await expect(player.locator("iframe")).toHaveCount(0);
    await expect(player.getByText("按下「載入」才會連線到 open.spotify.com")).toBeVisible();
    expect(requested).toEqual([]);

    await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    const frame = player.locator("iframe");
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute("src", "https://open.spotify.com/embed/track/50q2aUjWoTn6CJIfSPRJQA");
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    await expect(frame).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    await expect(frame).toHaveAttribute("title", /Spotify 播放器：Spotify Song/);
    expect(await frame.getAttribute("src")).not.toMatch(/autoplay|si=/);
    expect(await frame.getAttribute("allow")).toContain("encrypted-media");
    await expect(player.getByRole("button", { name: "在 Spotify 開啟 ↗" })).toBeVisible();
  });

  test("only one platform or native source can run: switching stops and unmounts the previous one", async ({ page }) => {
    await stubPlatforms(page);
    await installFakeMedia(page);
    const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify, youtube, native])));
    await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    await expect(player.locator("iframe")).toHaveAttribute("src", /open\.spotify\.com\/embed\/track/);

    await player.getByRole("button", { name: "選擇 YouTube Song" }).click();
    await expect(player.locator("iframe")).toHaveCount(0); // the old frame is gone, the new one waits for a click
    await player.getByRole("button", { name: "載入 YouTube 播放器" }).click();
    await expect(player.locator("iframe")).toHaveCount(1);
    await expect(player.locator("iframe")).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1");
    const box = await player.locator("iframe").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    expect(box!.height).toBeGreaterThanOrEqual(200);

    // native audio takes over: the embed disappears, and the embed stops the native track
    await player.getByRole("button", { name: "選擇 Native Song" }).click();
    await expect(player.locator("iframe")).toHaveCount(0);
    await player.getByRole("button", { name: "播放" }).click();
    await expect(page.locator(".visitor-task-buttons").getByRole("button", { name: /Music\.exe · 播放中/ })).toBeVisible();
    await player.getByRole("button", { name: "選擇 Spotify Song" }).click();
    await expect(page.locator(".visitor-task-buttons").getByText("播放中")).toHaveCount(0);
    await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    await expect(page.locator(".visitor-task-buttons").getByText("播放中")).toHaveCount(0);
    await expect(player.locator("iframe")).toHaveCount(1);
  });

  test("minimizing or closing the window removes the iframe and nothing reloads by itself", async ({ page }) => {
    await stubPlatforms(page);
    const player = await openPublic(page, doc(musicWindow("Music.exe", [youtube])));
    await player.getByRole("button", { name: "載入 YouTube 播放器" }).click();
    await expect(player.locator("iframe")).toHaveCount(1);
    await player.getByRole("button", { name: "最小化" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.locator(".visitor-task-buttons").getByRole("button", { name: "Music.exe" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(player.getByRole("button", { name: "載入 YouTube 播放器" })).toBeVisible();
    await player.getByRole("button", { name: "載入 YouTube 播放器" }).click();
    await player.getByRole("button", { name: "關閉播放器" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
    await player.getByRole("button", { name: "載入 YouTube 播放器" }).click();
    await player.getByRole("button", { name: "關閉", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("when the platform never answers, the visitor is told what to do and the original link stays available", async ({ page }) => {
    await page.clock.install();
    await stubPlatforms(page, { hang: true });
    const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify])));
    await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    await expect(player.getByRole("status")).toHaveCount(0);
    await page.clock.fastForward(9000);
    await expect(player.getByRole("status")).toContainText("還沒有回應");
    const popup = page.context().waitForEvent("page");
    await player.getByRole("button", { name: "在 Spotify 開啟 ↗" }).click();
    expect((await popup).url()).toBe(SPOTIFY);
  });

  test("a blocked or failing platform leaves the original link working and never leaves a frame running", async ({ page }) => {
    // 1) the network refuses the connection; 2) the platform answers but forbids framing
    for (const mode of ["abort", "deny-framing"] as const) {
      await page.unroute(/https:\/\/(open\.spotify\.com|www\.youtube-nocookie\.com)\/.*/).catch(() => undefined);
      await page.route(/https:\/\/(open\.spotify\.com|www\.youtube-nocookie\.com)\/.*/, (route) => mode === "abort"
        ? route.abort("blockedbyclient")
        : route.fulfill({ status: 200, contentType: "text/html", headers: { "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" }, body: "<p>no framing</p>" }));
      const popupTarget = page.context().waitForEvent("page");
      const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify])));
      await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
      // whatever the frame shows, the explanation and the original-site button stay reachable
      await expect(player.getByRole("button", { name: "在 Spotify 開啟 ↗" })).toBeVisible();
      await expect(player.getByText("能否完整播放取決於你的 Spotify 帳號")).toBeVisible();
      await player.getByRole("button", { name: "在 Spotify 開啟 ↗" }).click();
      expect((await popupTarget).url()).toBe(SPOTIFY);
      await player.getByRole("button", { name: "關閉播放器" }).click();
      await expect(page.locator("iframe")).toHaveCount(0);
      await page.goto("about:blank");
    }
  });

  test("no hidden player keeps sound going after switching source, minimizing or closing", async ({ page }) => {
    await stubPlatforms(page);
    await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "audio/wav", body: silentPcmWave() }));
    await page.addInitScript(() => {
      (window as unknown as { __playing: Set<HTMLMediaElement> }).__playing = new Set();
      Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
      Object.defineProperty(HTMLMediaElement.prototype, "seekable", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 90 }) });
      HTMLMediaElement.prototype.load = function () {};
      HTMLMediaElement.prototype.pause = function () { (window as unknown as { __playing: Set<HTMLMediaElement> }).__playing.delete(this); this.dispatchEvent(new Event("pause")); };
      HTMLMediaElement.prototype.play = function () { (window as unknown as { __playing: Set<HTMLMediaElement> }).__playing.add(this); this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
    });
    const sound = () => page.evaluate(() => ({
      // any element still playing counts, attached to the page or not
      audible: (window as unknown as { __playing: Set<HTMLMediaElement> }).__playing.size,
      frames: document.querySelectorAll("iframe").length
    }));
    const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify, youtube, native])));

    await player.getByRole("button", { name: "選擇 Native Song" }).click();
    await player.getByRole("button", { name: "播放" }).click();
    await expect.poll(async () => (await sound()).audible).toBe(1);
    // switching to a platform source stops the native track
    await player.getByRole("button", { name: "選擇 Spotify Song" }).click();
    await player.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    expect(await sound()).toEqual({ audible: 0, frames: 1 });
    // and starting native audio unmounts the platform frame
    await player.getByRole("button", { name: "選擇 Native Song" }).click();
    await player.getByRole("button", { name: "播放" }).click();
    await expect.poll(sound).toEqual({ audible: 1, frames: 0 });
    // minimizing the window stops native audio too
    await player.getByRole("button", { name: "最小化" }).click();
    expect(await sound()).toMatchObject({ audible: 0, frames: 0 });
    await page.locator(".visitor-task-buttons").getByRole("button", { name: /Music\.exe/ }).click();
    expect(await sound()).toMatchObject({ audible: 0, frames: 0 });
    // closing with a platform frame active
    await player.getByRole("button", { name: "選擇 YouTube Song" }).click();
    await player.getByRole("button", { name: "載入 YouTube 播放器" }).click();
    expect((await sound()).frames).toBe(1);
    await player.getByRole("button", { name: "關閉", exact: true }).click();
    expect(await sound()).toEqual({ audible: 0, frames: 0 });
  });

  test("native audio does not keep playing in a hidden tree when the viewport switches between desktop and phone", async ({ page }) => {
    await page.route("https://media.example.com/**", (route) => route.fulfill({ contentType: "audio/mpeg", body: Buffer.alloc(64) }));
    await page.addInitScript(() => {
      type W = { __playing: Set<HTMLMediaElement> };
      (window as unknown as W).__playing = new Set();
      Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
      Object.defineProperty(HTMLMediaElement.prototype, "seekable", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 90 }) });
      HTMLMediaElement.prototype.load = function () {};
      HTMLMediaElement.prototype.pause = function () { (window as unknown as W).__playing.delete(this); this.dispatchEvent(new Event("pause")); };
      HTMLMediaElement.prototype.play = function () { (window as unknown as W).__playing.add(this); this.dispatchEvent(new Event("loadedmetadata")); this.dispatchEvent(new Event("playing")); return Promise.resolve(); };
    });
    const playing = () => page.evaluate(() => (window as unknown as { __playing: Set<HTMLMediaElement> }).__playing.size);
    const player = await openPublic(page, doc(musicWindow("Music.exe", [spotify, native])));
    await player.getByRole("button", { name: "選擇 Native Song" }).click();
    await player.getByRole("button", { name: "播放" }).click();
    await expect.poll(playing).toBe(1);
    await page.setViewportSize({ width: 390, height: 840 }); // desktop host unmounts, phone host mounts
    await expect(page.locator(".visitor-desktop")).toHaveCount(0);
    await expect.poll(playing).toBe(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator(".visitor-mobile")).toHaveCount(0);
    await expect.poll(playing).toBe(0);
  });

  test("a platform link saved as a direct audio file shows why it cannot play and offers the original", async ({ page }) => {
    const player = await openPublic(page, doc(musicWindow("Music.exe", [track("bad", "Bad", { kind: "audioUrl", url: SPOTIFY })])));
    await expect(player.getByRole("note")).toContainText("Spotify 的網頁連結，不是音訊檔");
    await expect(player.getByRole("button", { name: "播放" })).toHaveCount(0);
    await expect(player.getByRole("button", { name: "開啟原連結 ↗" })).toBeVisible();
  });

  test("player controls fit a 320px phone", async ({ page }) => {
    await stubPlatforms(page);
    await openPublic(page, doc(musicWindow("Music.exe", [spotify])), { width: 320, height: 720 });
    const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Music.exe" });
    await dialog.getByRole("button", { name: "載入 Spotify 播放器" }).click();
    await expect(dialog.locator("iframe")).toHaveCount(1);
    // Only the current viewport host may mount; there must never be a hidden second player.
    await expect(page.locator("iframe")).toHaveCount(1);
    expect(await page.locator("iframe").evaluate((node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; })).toBe(true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const load = await dialog.getByRole("button", { name: "關閉播放器" }).boundingBox();
    expect(load!.height).toBeGreaterThanOrEqual(30);
  });
});

test("track list labels a platform page saved as audio as a web link, not as in-site audio", async ({ page }) => {
  const player = await openPublic(page, doc(musicWindow("Music.exe", [track("bad", "Bad", { kind: "audioUrl", url: SPOTIFY }), track("ok", "Good", { kind: "audioUrl", url: "https://media.example.com/a.mp3" })])));
  await expect(player.getByRole("button", { name: "選擇 Bad" })).toContainText("網頁連結（不能站內播放）");
  await expect(player.getByRole("button", { name: "選擇 Good" })).toContainText("站內播放");
});

for (const width of [320, 390, 430]) {
  test(`only the visible public player tree exists and closes on viewport change at ${width}px`, async ({ page }) => {
    await stubPlatforms(page);
    await openPublic(page, doc(musicWindow("Music.exe", [track("s", "Spotify", embedSource("spotify", SPOTIFY))])), { width, height: 840 });
    await expect(page.locator(".visitor-desktop")).toHaveCount(0);
    await page.getByRole("button", { name: "載入 Spotify 播放器", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await page.setViewportSize({ width: 1280, height: 840 });
    await expect(page.locator(".visitor-mobile")).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Music.exe", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "載入 Spotify 播放器", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(1);
    await page.getByRole("dialog", { name: "Music.exe", exact: true }).getByRole("button", { name: "最小化", exact: true }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
  });
}
