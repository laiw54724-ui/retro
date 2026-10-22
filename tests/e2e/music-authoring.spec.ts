import { expect, test, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  createAssetReference, makeWindow, migrateSiteDocumentV2,
  normalizeDocument, projectPublicSiteDocument, replaceAssetReferences
} from "../../packages/shared/src";
import { documentFixture } from "./fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const pickedFile = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

function fixture() {
  const music = makeWindow("music");
  if (music.type !== "music") throw new Error("music fixture");
  music.id = "music-a"; music.title = "Music A"; music.defaultOpen = true;
  music.layout.desktop = { ...music.layout.desktop, x: 10, y: 10, w: 440, h: 680, z: 3 };
  music.content.tracks = ["First", "Second"].map((title) => ({ id: title, title, artist: "Creator", cover: null, coverUrl: "", source: { kind: "audioUrl" as const, url: "https://media.test/theme.mp3" }, lyrics: "Keep lyrics", rightsNote: "Original work" }));
  music.content.playlist.trackIds = music.content.tracks.map((track) => track.id);
  const other = structuredClone(music); other.id = "music-b"; other.title = "Music B"; other.defaultOpen = false;
  other.layout.desktop.x = 480;
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [music, other] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration");
  return migrated.document;
}

async function mockMedia(page: Page, { width = 1440, failOnce = "", hold = "" } = {}) {
  let draft = fixture();
  let published = structuredClone(draft);
  let version = 1;
  let protectedFailure = false;
  const calls: string[] = [];
  const assets: Array<{ id: string; url: string; kind: string; name: string }> = [];
  const held = new Map<string, () => void>();
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://assets.test/**", (route) => route.request().url().includes("broken")
    ? route.fulfill({ status: 404, body: "missing" })
    : route.fulfill({ contentType: "image/png", body: PNG }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: draft, draft_version: version, published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00Z", access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    draft = structuredClone(route.request().postDataJSON().document);
    version++;
    return route.fulfill({ json: { version, updatedAt: "2026-10-17T00:01:00Z" } });
  });
  await page.route("**/api/sites/site-1/assets**", async (route: Route) => {
    if (route.request().url().endsWith("/content")) return protectedFailure
      ? route.fulfill({ status: 403, body: "unavailable" })
      : route.fulfill({ contentType: "image/png", body: PNG });
    if (route.request().method() !== "POST") return route.fulfill({ json: { assets } });
    const body = route.request().postDataBuffer()?.toString() ?? "";
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? "unknown";
    calls.push(name);
    if (name === hold) await new Promise<void>((resolve) => held.set(name, resolve));
    if (name === failOnce && calls.filter((value) => value === name).length === 1) {
      return route.fulfill({ status: 503, json: { error: { code: "upload_failed", message: "Temporary upload failure" } } });
    }
    const id = randomUUID();
    const asset = { id, url: createAssetReference(id), kind: name.endsWith(".wav") ? "audio" : "image", name, mimeType: name.endsWith(".wav") ? "audio/wav" : "image/png", size: PNG.length, createdAt: "2026-10-17T00:00:00Z" };
    assets.push(asset);
    return route.fulfill({ json: { asset } });
  });
  await page.route("**/api/public/sites/demo", (route) => {
    const projected = projectPublicSiteDocument(published, "site-1");
    if (!projected.ok) throw new Error("invalid public fixture");
    const publicDocument = replaceAssetReferences(projected.document, new Map(assets.map((asset) => [asset.id, `https://assets.test/${asset.id}.png`])));
    return route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: publicDocument, published_version: version, published_at: "2026-10-17T00:01:00Z" } } });
  });
  await page.setViewportSize({ width, height: 950 });
  await page.goto("/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: "Music A", exact: true }).click();
    await page.getByRole("button", { name: "編輯內容" }).click();
  }
  const player = page.getByRole("dialog", { name: "Music A", exact: true });
  await expect(player.locator(".music-editor")).toBeVisible();
  return {
    player, calls, assets, saved: () => draft,
    failProtected: () => { protectedFailure = true; },
    restoreProtected: () => { protectedFailure = false; },
    release: (name: string) => { const resolve = held.get(name); if (!resolve) throw new Error("request not held"); held.delete(name); resolve(); },
    publishSaved: () => { published = structuredClone(draft); },
    tracks: (id = "music-a") => {
      const window = draft.windows.find((window) => window.id === id);
      if (window?.type !== "music") throw new Error("missing music");
      return window.content.tracks;
    }
  };
}

const audioFile = (name = "theme.wav") => ({ name, mimeType: "audio/wav", buffer: Buffer.from("RIFF0000WAVEfmt ") });
const select = (player: ReturnType<Page["locator"]>, title: string) => player.locator(".music-authoring-track").filter({ hasText: title }).click();

test("selected editor keeps unfinished source/cover drafts, order, keyboard selection and reload", async ({ page }) => {
  const site = await mockMedia(page); const player = site.player;
  await expect(player.locator(".music-track-editor")).toHaveCount(1);
  // An invalid draft must not replace the saved source.
  await player.getByLabel("貼上連結或上傳檔案").fill("not a url yet");
  await player.getByLabel("封面圖片網址").fill("unfinished cover");
  await select(player, "Second");
  await expect(player.getByLabel("曲名")).toHaveValue("Second");
  const first = player.locator(".music-authoring-track").filter({ hasText: "First" });
  await first.focus(); await page.keyboard.press("Enter");
  await expect(player.getByLabel("貼上連結或上傳檔案")).toHaveValue("not a url yet");
  await expect(player.getByLabel("封面圖片網址")).toHaveValue("unfinished cover");
  await select(player, "Second");
  await player.getByRole("button", { name: "往前", exact: true }).click();
  await expect(player.getByLabel("曲名")).toHaveValue("Second");
  await expect.poll(() => site.tracks().map((track) => track.title)).toEqual(["Second", "First"]);
  await page.reload();
  await expect(player.getByLabel("曲名")).toHaveValue("Second");
  site.publishSaved(); await page.goto("/@demo");
  await expect(page.locator(".music-track").filter({ hasText: "Second" })).toHaveCount(1);
});

test("per-track audio failure retries alone and preserves a successful cover and newer edits", async ({ page }, testInfo) => {
  const site = await mockMedia(page, { hold: "cover.png", failOnce: "theme.wav" }); const player = site.player;
  await player.getByLabel("上傳封面…", { exact: true }).setInputFiles(pickedFile("cover.png"));
  await expect(player.locator('[data-upload-state="uploading"]')).toHaveCount(1);
  await select(player, "Second");
  await player.locator('.music-source-field input[type=file]').setInputFiles(audioFile());
  await expect(player.locator('[data-upload-state="queued"]')).toHaveCount(1);
  site.release("cover.png");
  await expect(player.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await player.getByLabel("演出者").fill("New artist");
  await expect(player.locator(".music-authoring-track").filter({ hasText: "First" })).toContainText("完成 1");
  await player.getByRole("button", { name: "重試 theme.wav", exact: true }).click();
  await expect(player.locator('[data-upload-state="completed"]')).toHaveCount(1);
  expect(site.calls).toEqual(["cover.png", "theme.wav", "theme.wav"]);
  await expect.poll(() => site.tracks()[1].source.kind).toBe("uploadedAudio");
  expect(site.tracks()[0].cover).toMatch(/^retro-asset:/);
  expect(site.tracks()[1].artist).toBe("New artist");
  await page.screenshot({ path: testInfo.outputPath("music-editor-desktop.png") });
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(player.locator('.music-source-field')).toHaveAttribute("data-source-kind", "audioUrl");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect.poll(() => site.tracks()[1].source.kind).toBe("uploadedAudio");
  await page.reload(); await select(player, "Second");
  await expect(player.locator('.music-source-field')).toHaveAttribute("data-source-kind", "uploadedAudio");
  await expect(player.getByRole("region", { name: "上傳任務" })).toHaveCount(0);
});

for (const change of ["source draft", "delete", "undo", "window"] as const) {
  test(`late audio cannot overwrite after ${change}`, async ({ page }) => {
    const site = await mockMedia(page, { hold: "late.wav" }); const player = site.player;
    await player.getByLabel("演出者").fill("Changed before upload");
    await player.locator('.music-source-field input[type=file]').setInputFiles(audioFile("late.wav"));
    await expect.poll(() => site.calls).toEqual(["late.wav"]);
    if (change === "source draft") await player.getByLabel("貼上連結或上傳檔案").fill("unfinished source");
    if (change === "delete") await player.getByRole("button", { name: "刪除", exact: true }).click();
    if (change === "undo") await page.getByRole("button", { name: "復原", exact: true }).click();
    if (change === "window") {
      await page.locator(".task-items").getByRole("button", { name: "Music B", exact: true }).click();
      await page.getByRole("dialog", { name: "Music B", exact: true }).getByLabel("演出者").fill("Other window edit");
    } else {
      await expect(player.locator('[data-upload-state="failed"]')).toHaveCount(1);
      await expect(player.getByRole("button", { name: "重試 late.wav", exact: true })).toHaveCount(0);
    }
    site.release("late.wav");
    await expect.poll(() => site.assets.length).toBe(1);
    if (change === "window") {
      await expect.poll(() => site.tracks()[0].source.kind).toBe("uploadedAudio");
      await expect.poll(() => site.tracks("music-b")[0].artist).toBe("Other window edit");
      expect(site.tracks("music-b")[0].source.kind).toBe("audioUrl");
    } else {
      await expect.poll(() => site.tracks().some((track) => track.source.kind === "uploadedAudio")).toBe(false);
    }
  });
}

for (const width of [320, 390]) {
  test(`selected-track editing and upload failure fit ${width}px`, async ({ page }, testInfo) => {
    const site = await mockMedia(page, { width, failOnce: "theme.wav" }); const player = site.player;
    await player.getByLabel("曲名").fill("LongTitle".repeat(18));
    await player.locator('.music-source-field input[type=file]').setInputFiles(audioFile());
    await expect(player.locator('[data-upload-state="failed"]')).toHaveCount(1);
    await expect(player.getByRole("button", { name: "重試 theme.wav", exact: true })).toBeVisible();
    await expect(player.locator(".music-track-editor")).toHaveCount(1);
    expect(await player.locator(".music-editor").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`music-editor-${width}.png`) });
  });
}

test("failed preparation stays beside the uploaded track and retries without uploading again", async ({ page }) => {
  const site = await mockMedia(page); const player = site.player;
  await player.locator('.music-source-field input[type=file]').setInputFiles(audioFile());
  await expect.poll(() => site.tracks()[0].source.kind).toBe("uploadedAudio");
  site.failProtected(); await page.reload();
  await expect(player.getByRole("alert")).toContainText("無法準備上傳的音訊");
  site.restoreProtected();
  await player.getByRole("button", { name: "重試準備音訊", exact: true }).click();
  await expect(player.getByRole("button", { name: "▶ 試聽上傳檔", exact: true })).toBeEnabled();
  expect(site.calls).toEqual(["theme.wav"]);
});

test("undo clears a hidden unfinished draft before returning to its track", async ({ page }) => {
  const site = await mockMedia(page); const player = site.player;
  await player.getByLabel("演出者").fill("Undo this edit");
  await player.getByLabel("貼上連結或上傳檔案").fill("unfinished draft");
  await select(player, "Second");
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await select(player, "First");
  await expect(player.getByLabel("貼上連結或上傳檔案")).toHaveValue("https://media.test/theme.mp3");
});

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


test("upload completion stops a restarted old preview and selection stops the previous track", async ({ page }) => {
  await installFakeMedia(page);
  const site = await mockMedia(page, { hold: "late.wav" }); const player = site.player;
  await player.locator('.music-source-field input[type=file]').setInputFiles(audioFile("late.wav"));
  await expect.poll(() => site.calls).toEqual(["late.wav"]);
  await player.getByRole("button", { name: "▶ 試聽", exact: true }).click();
  await expect(player.getByRole("button", { name: "Ⅱ 停止試聽", exact: true })).toBeVisible();
  site.release("late.wav");
  await expect(player.getByRole("button", { name: "▶ 試聽上傳檔", exact: true })).toBeEnabled();
  await player.getByRole("button", { name: "▶ 試聽上傳檔", exact: true }).click();
  await expect(player.getByRole("button", { name: "Ⅱ 停止試聽", exact: true })).toBeVisible();
  await select(player, "Second");
  await select(player, "First");
  await expect(player.getByRole("button", { name: "▶ 試聽上傳檔", exact: true })).toBeEnabled();
});
