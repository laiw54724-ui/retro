import { expect, test, type Page } from "@playwright/test";
import type { SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function musicWindow(id: string, title: string, index: number, urls = ["https://media.example.com/theme.mp3"]) {
  const tracks = urls.map((url, trackIndex) => ({
    id: `${id}-track-${trackIndex + 1}`,
    title: trackIndex ? "作品頁" : `${title} Theme`,
    artist: "Original Creator",
    cover: null,
    coverUrl: "",
    source: trackIndex ? { kind: "externalLink" as const, url } : { kind: "audioUrl" as const, url },
    lyrics: trackIndex ? "" : "Original lyrics",
    rightsNote: "Original work"
  }));
  return {
    id, type: "music" as const, title, icon: "music", defaultOpen: true,
    layout: { desktop: { x: 80 + index * 430, y: 50, w: 390, h: 430, z: index + 1, iconX: 16 + index * 88, iconY: 18 }, mobile: { order: index } },
    content: { tracks, playlist: { id: `${id}-playlist`, title: "Original Playlist", trackIds: tracks.map((track) => track.id) } }
  };
}

function publicMusicDocument(...windows: ReturnType<typeof musicWindow>[]): SiteDocument {
  return { ...structuredClone(documentFixture), windows } as SiteDocument;
}

async function mockPublicSite(page: Page, document: SiteDocument) {
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: document.siteName, published_document: document, published_version: 1, published_at: "2026-10-16T00:00:00.000Z" } } }));
}

async function installFakeMedia(page: Page) {
  await page.addInitScript(() => {
    const nativeAddEventListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type === "error") return;
      nativeAddEventListener.call(this, type, listener, options);
    };
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
    Object.defineProperty(HTMLMediaElement.prototype, "seekable", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 90 }) });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes("reject")) return Promise.reject(new Error("blocked"));
      this.dispatchEvent(new Event("loadedmetadata"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
  });
}

async function openEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: structuredClone(documentFixture), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
  const saves: Array<{ document: SiteDocument }> = [];
  const uploadedId = "11111111-1111-4111-8111-111111111111";
  await page.route(`**/api/sites/site-1/assets/${uploadedId}/content`, (route) => route.fulfill({ contentType: "audio/wav", body: "RIFF0000WAVEfmt " }));
  await page.route("**/api/sites/site-1/assets", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 201, json: { asset: { id: uploadedId, url: `retro-asset:${uploadedId}`, mimeType: "audio/wav", size: 16, kind: "audio", name: "theme" } } })
    : route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocument };
    saves.push(body);
    site.draft_document = structuredClone(body.document) as typeof site.draft_document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: "2026-10-16T00:01:00.000Z" } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("dialog", { name: "About.exe" })).toBeVisible();
  await expect.poll(() => saves.at(-1)?.document.schemaVersion).toBe(2);
  return { saves };
}

test("author uploads private audio, records rights, saves and reloads the stable reference", async ({ page }) => {
  await installFakeMedia(page);
  const { saves } = await openEditor(page);
  await page.getByRole("button", { name: /音樂播放器/ }).click();
  const player = page.getByRole("dialog", { name: "Music Player.exe" });
  await player.getByRole("button", { name: "新增第一首" }).click();
  const editor = player.locator(".music-track-editor").first();
  await editor.locator(".music-source-field input[type=file]").setInputFiles({ name: "theme.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF0000WAVEfmt ") });
  await expect(editor.getByText("檔案會保存在私有草稿")).toBeVisible();
  await expect(editor.getByRole("button", { name: /試聽上傳檔|正在準備音訊/ })).toBeVisible();
  await editor.getByLabel("權利說明（發布必填）").fill("本人原創");

  await expect.poll(() => {
    const music = saves.at(-1)?.document.windows.find((window) => window.type === "music");
    return music?.type === "music" ? music.content.tracks[0] : null;
  }).toMatchObject({ source: { kind: "uploadedAudio", asset: "retro-asset:11111111-1111-4111-8111-111111111111" }, rightsNote: "本人原創" });

  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Music Player.exe" });
  await expect(reloaded.getByText("檔案會保存在私有草稿")).toBeVisible();
  await expect(reloaded.getByLabel("權利說明（發布必填）")).toHaveValue("本人原創");
});

test("author adds, reorders, deletes and reloads a music playlist", async ({ page }) => {
  const { saves } = await openEditor(page);
  await page.getByRole("button", { name: /音樂播放器/ }).click();
  const player = page.getByRole("dialog", { name: "Music Player.exe" });
  await expect(player).toBeVisible();
  await player.getByRole("button", { name: "新增第一首" }).click();
  let editors = player.locator(".music-track-editor");
  await editors.nth(0).getByLabel("曲名").fill("First Theme");
  await editors.nth(0).getByLabel("演出者").fill("Creator A");
  await editors.nth(0).getByLabel("貼上連結或上傳檔案").fill("https://media.example.com/first.mp3");
  await player.getByRole("button", { name: "新增曲目" }).click();
  editors = player.locator(".music-track-editor");
  await editors.nth(0).getByLabel("曲名").fill("Second Theme");
  await editors.nth(0).getByLabel("演出者").fill("Creator B");
  await editors.nth(0).getByRole("button", { name: "往前" }).click();
  await expect(player.locator(".music-track-editor").first().getByLabel("曲名")).toHaveValue("Second Theme");
  await player.locator(".music-authoring-track").filter({ hasText: "First Theme" }).click();
  await player.locator(".music-track-editor").getByRole("button", { name: "刪除" }).click();
  await expect(player.locator(".music-track-editor")).toHaveCount(1);

  await expect.poll(() => {
    const music = saves.at(-1)?.document.windows.find((window) => window.type === "music");
    return music?.type === "music" ? music.content.tracks.map((track) => track.title) : [];
  }).toEqual(["Second Theme"]);
  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Music Player.exe" });
  await expect(reloaded).toBeVisible();
  await expect(reloaded.locator(".music-track-editor")).toHaveCount(1);
  await expect(reloaded.getByLabel("曲名")).toHaveValue("Second Theme");
});

test("editing an active preview source stops the old audio", async ({ page }) => {
  await installFakeMedia(page);
  await openEditor(page);
  await page.getByRole("button", { name: /音樂播放器/ }).click();
  const player = page.getByRole("dialog", { name: "Music Player.exe" });
  await player.getByRole("button", { name: "新增第一首" }).click();
  const source = player.getByLabel("貼上連結或上傳檔案");
  await source.fill("https://media.example.com/first.mp3");
  await player.getByRole("button", { name: "試聽" }).click();
  await expect(player.getByRole("button", { name: "停止試聽" })).toBeVisible();

  await source.fill("https://media.example.com/replacement.mp3");
  await expect(player.getByRole("button", { name: "試聽" })).toBeVisible();
});

test("one explicit audio source stops on minimize, switches globally and stops on close", async ({ page }) => {
  await installFakeMedia(page);
  const first = musicWindow("music-a", "Player A", 0, ["https://media.example.com/a.mp3", "https://example.com/work"]);
  const second = musicWindow("music-b", "Player B", 1, ["https://media.example.com/b.mp3"]);
  await mockPublicSite(page, publicMusicDocument(first, second));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/@demo");
  const firstDialog = page.getByRole("dialog", { name: "Player A" });
  const secondDialog = page.getByRole("dialog", { name: "Player B" });
  await firstDialog.getByRole("button", { name: "播放" }).click();
  await expect(page.locator(".visitor-task-buttons").getByRole("button", { name: "Player A · 播放中" })).toBeVisible();
  await firstDialog.getByRole("button", { name: "最小化" }).click();
  await expect(firstDialog).toBeHidden();
  await expect(page.locator(".visitor-task-buttons").getByRole("button", { name: "Player A", exact: true })).toBeVisible();
  await expect(page.locator(".visitor-task-buttons").getByText("播放中")).toHaveCount(0);

  await secondDialog.getByRole("button", { name: "播放" }).click();
  await expect(page.locator(".visitor-task-buttons").getByRole("button", { name: "Player B · 播放中" })).toBeVisible();
  await expect(page.locator(".visitor-task-buttons").getByRole("button", { name: "Player A", exact: true })).toBeVisible();
  await secondDialog.getByRole("button", { name: "關閉" }).click();
  await expect(page.locator(".visitor-task-buttons").getByText("播放中")).toHaveCount(0);

  await page.locator(".visitor-task-buttons").getByRole("button", { name: "Player A", exact: true }).click();
  await firstDialog.locator(".music-track").filter({ hasText: "作品頁" }).click();
  await expect(firstDialog.getByRole("button", { name: "開啟原連結" })).toBeVisible();
  await expect(firstDialog.getByRole("button", { name: "播放" })).toHaveCount(0);
});

test("failed audio stays stopped with a useful error", async ({ page }) => {
  await installFakeMedia(page);
  await mockPublicSite(page, publicMusicDocument(musicWindow("music-bad", "Broken Player", 0, ["https://media.example.com/reject.mp3"])));
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto("/@demo");
  const player = page.getByRole("dialog", { name: "Broken Player" });
  await player.getByRole("button", { name: "播放" }).click();
  await expect(player.getByRole("alert")).toContainText(/未能播放|無法載入/);
  await expect(page.locator(".visitor-task-buttons").getByText("播放中")).toHaveCount(0);
});

test("mobile music controls remain reachable at 320px", async ({ page }) => {
  await installFakeMedia(page);
  await mockPublicSite(page, publicMusicDocument(musicWindow("music-mobile", "Music Player.exe", 0)));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/@demo");
  await page.locator(".visitor-mobile").getByRole("button", { name: "Music Player.exe" }).click();
  const dialog = page.locator(".visitor-mobile").getByRole("dialog", { name: "Music Player.exe" });
  await expect(dialog.getByRole("button", { name: "播放" })).toBeVisible();
  const size = await dialog.getByRole("button", { name: "播放" }).boundingBox();
  expect(size?.height ?? 0).toBeGreaterThanOrEqual(42);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
