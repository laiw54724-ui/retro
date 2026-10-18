import { expect, test, type Locator, type Page } from "@playwright/test";
import { migrateSiteDocumentV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";
import { igDocument } from "./ig-fixture";

const LOCALE_KEY = "retrodesk:locale";
const PREVIEW_LOCALES = process.env.VITE_I18N_PREVIEW_LOCALES === "true";
const FIXED_INSTANT = "2026-10-17T09:07:00.000Z";
const OC_NAME = "common:app.home";
const OC_BIO = "{{name}} <b>使用者自己的內容</b> / 日本語 / 한국어";
const OC_WINDOW = "common:landing.title";
const session = {
  access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800,
  expires_in: 3600, token_type: "bearer",
  user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" }
};

test.use({ locale: "zh-TW", timezoneId: "UTC" });

/** Supply ordered browser preferences; never overwrite a later manual choice on reload. */
async function browserPreferences(page: Page, languages: string[], storedLocale?: string) {
  await page.addInitScript(({ preferences, stored, key }) => {
    Object.defineProperty(navigator, "languages", { configurable: true, get: () => preferences });
    Object.defineProperty(navigator, "language", { configurable: true, get: () => preferences[0] ?? "" });
    if (stored !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key, stored);
  }, { preferences: languages, stored: storedLocale, key: LOCALE_KEY });
}

async function switchLanguage(page: Page, selector: Locator, locale: string) {
  await selector.focus();
  await selector.selectOption(locale);
  await expect(selector).toHaveValue(locale);
  await expect(selector).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(selector).toBeFocused();
}

function aboutDocument(): SiteDocumentV2Input {
  const source = structuredClone(documentFixture);
  source.windows = source.windows.filter((window) => window.id === "about");
  const result = migrateSiteDocumentV2(source, { siteId: "site-1" });
  if (!result.ok || result.version !== 2) throw new Error("About fixture migration failed");
  return result.document;
}

function authoredOcDocument(): SiteDocumentV2Input {
  const result = migrateSiteDocumentV2(igDocument({ name: OC_NAME, bio: OC_BIO }), { siteId: "site-1" });
  if (!result.ok || result.version !== 2) throw new Error("OC fixture migration failed");
  const profile = result.document.entities.profiles[0];
  if (!profile) throw new Error("OC fixture has no canonical profile");
  profile.displayName = OC_NAME;
  profile.name = OC_NAME;
  profile.bio = OC_BIO;
  profile.visibility = "published";
  result.document.siteName = "editor:shell.home";
  result.document.windows[0].title = OC_WINDOW;
  return result.document;
}

async function mockEditor(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  // Starting from canonical v2 avoids counting the intentional v1 migration autosave.
  const site = {
    id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: aboutDocument(), draft_version: 2,
    published_document: null, published_version: null, published_at: null, updated_at: FIXED_INSTANT, access_role: "owner"
  };
  const saves: Array<{ document: SiteDocumentV2Input }> = [];
  let reads = 0;
  await page.route("**/api/sites/site-1", (route) => {
    reads += 1;
    return route.fulfill({ json: { site } });
  });
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON() as { document: SiteDocumentV2Input };
    saves.push(body);
    site.draft_document = body.document;
    site.draft_version += 1;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: FIXED_INSTANT } });
  });
  return { saves, readCount: () => reads };
}

async function mockPublic(page: Page, document: SiteDocumentV2Input | SiteDocument = authoredOcDocument()) {
  let reads = 0;
  const writes: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && !["GET", "HEAD"].includes(request.method())) writes.push(request.url());
  });
  await page.route("**/api/public/sites/demo", (route) => {
    reads += 1;
    return route.fulfill({ json: { site: {
      username: "demo", site_name: document.siteName, published_document: document,
      published_version: 2, published_at: FIXED_INSTANT
    } } });
  });
  return { writes, readCount: () => reads };
}

/** White-box invariant only: include both canonical and render documents/history. */
async function editorSnapshot(page: Page) {
  return page.evaluate(async () => {
    const storePath = "/src/features/editor/store.ts";
    const { useEditorStore } = await import(storePath);
    const state = useEditorStore.getState();
    return JSON.stringify({
      document: state.document, versionedDocument: state.versionedDocument,
      lastSavedDocument: state.lastSavedDocument, publishedDocument: state.publishedDocument,
      past: state.past, future: state.future, versionedPast: state.versionedPast, versionedFuture: state.versionedFuture,
      selectedId: state.selectedId, device: state.device, viewState: state.viewState, saveStatus: state.saveStatus, version: state.version
    });
  });
}

async function expectReachable(page: Page, control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport();
  const bounds = await control.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.height).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

async function captureScreen(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path });
  await test.info().attach(name, { path, contentType: "image/png" });
}

for (const [browserLocale, expected] of [["en-SG", "en"], ["zh-HK", "zh-Hant"], ["zh-Hans-CN", "zh-Hant"]] as const) {
  test(`browser preference ${browserLocale} resolves to ${expected}`, async ({ page }) => {
    await browserPreferences(page, [browserLocale]);
    await page.goto("/");
    await expect(page.getByTestId("language-switcher")).toHaveValue(expected);
    await expect(page.locator("html")).toHaveAttribute("lang", expected);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    expect(await page.evaluate((key) => localStorage.getItem(key), LOCALE_KEY)).toBeNull();
    if (expected === "en") await expect(page.getByRole("link", { name: "Create my desktop →" })).toBeVisible();
  });
}

test("browser preferences skip unsupported entries in order", async ({ page }) => {
  await browserPreferences(page, ["fr-FR", "de-DE", "en-GB", "zh-TW"]);
  await page.goto("/");
  await expect(page.getByTestId("language-switcher")).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("manual language overrides the browser and survives reload", async ({ page }) => {
  await browserPreferences(page, ["zh-TW"], "en-SG");
  await page.goto("/");
  const selector = page.getByTestId("language-switcher");
  await expect(selector).toHaveValue("en");
  await switchLanguage(page, selector, "zh-Hant");
  expect(await page.evaluate((key) => localStorage.getItem(key), LOCALE_KEY)).toBe("zh-Hant");
  await switchLanguage(page, selector, "en");
  await page.reload();
  await expect(selector).toHaveValue("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Create my desktop →" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), LOCALE_KEY)).toBe("en");
});

test("invalid saved and unsupported browser locales fall back to Traditional Chinese", async ({ page }) => {
  await browserPreferences(page, ["fr-FR", "de-DE"], "not_a_locale!");
  await page.goto("/");
  await expect(page.getByTestId("language-switcher")).toHaveValue("zh-Hant");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page.getByRole("link", { name: "開始建立我的桌面 →" })).toBeVisible();
});

test("release exposes only reviewed locales and ignores a persisted beta locale", async ({ page }) => {
  test.skip(PREVIEW_LOCALES, "This assertion covers the release build, not the beta preview build.");
  await browserPreferences(page, ["zh-TW"], "ko");
  await page.goto("/");
  const selector = page.getByTestId("language-switcher");
  expect(await selector.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["zh-Hant", "en"]);
  await expect(selector).toHaveValue("zh-Hant");
});

test("blocked locale storage keeps the authenticated editor and current-session switching usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await browserPreferences(page, ["en-SG"]);
  await page.addInitScript((localeKey) => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === localeKey) throw new DOMException("Locale reads blocked", "SecurityError");
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === localeKey) throw new DOMException("Locale writes blocked", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  }, LOCALE_KEY);
  const api = await mockEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const selector = page.locator(".editor-topbar").getByTestId("language-switcher");
  await expect(page.locator(".about.editing")).toBeVisible();
  await expect(selector).toHaveValue("en");
  await switchLanguage(page, selector, "zh-Hant");
  await expect(page.getByRole("button", { name: "復原", exact: true })).toBeDisabled();
  await page.reload();
  await expect(selector).toHaveValue("en");
  await expect(page.locator(".about.editing")).toBeVisible();
  expect(api.saves).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("white-box locale change preserves a focused dirty draft, caret, canonical history and undo", async ({ page }) => {
  const api = await mockEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.locator(".about.editing")).toBeVisible();
  // An incomplete title pauses autosave, keeping this a real dirty draft without timer races.
  await page.getByLabel("視窗標題", { exact: true }).fill("");
  const bio = page.locator(".about.editing textarea").first(); // the bio field; its label is translated, so locate it structurally
  const originalBio = await bio.inputValue();
  await bio.fill(OC_BIO);
  await expect(page.locator(".save-text")).toHaveText("有欄位未完成，暫不儲存");
  await bio.focus();
  await bio.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(3, 7));
  const originalNode = await bio.elementHandle();
  const before = await editorSnapshot(page);
  const readsBefore = api.readCount();
  // A native select intentionally takes focus. This isolated programmatic change
  // tests the separate contract that an i18n update itself must not steal it.
  expect(await page.evaluate(async () => {
    const modulePath = "/src/i18n/index.ts";
    const { changeLocale } = await import(modulePath);
    return changeLocale("en");
  })).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".save-text")).toHaveText("Complete required fields to save");
  await expect(bio).toBeFocused();
  expect(await bio.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([3, 7]);
  expect(await originalNode!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await editorSnapshot(page)).toBe(before);
  expect(api.readCount()).toBe(readsBefore);
  expect(api.saves).toHaveLength(0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(bio).toHaveValue(originalBio);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(bio).toHaveValue(OC_BIO);
  const beforeNativeSwitch = await editorSnapshot(page);
  await switchLanguage(page, page.locator(".editor-topbar").getByTestId("language-switcher"), "zh-Hant");
  expect(await editorSnapshot(page)).toBe(beforeNativeSwitch);
  expect(api.saves).toHaveLength(0);
});

test("native editor switching leaves the saved document and snapshot unchanged", async ({ page }) => {
  const api = await mockEditor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  await expect(page.locator(".save-text")).toHaveText("已儲存");
  const before = await editorSnapshot(page);
  const readsBefore = api.readCount();
  await switchLanguage(page, page.locator(".editor-topbar").getByTestId("language-switcher"), "en");
  await expect(page.locator(".save-text")).toHaveText("Saved");
  await expect(page.locator(".editor-status2")).toContainText("1 window · Not published");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
  // Let the editor's 650ms autosave window elapse before ruling out delayed writes.
  await page.waitForTimeout(800);
  expect(await editorSnapshot(page)).toBe(before);
  expect(api.readCount()).toBe(readsBefore);
  expect(api.saves).toHaveLength(0);
});

test("public desktop switch retains minimized windows and literal OC content while formatting the date", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_INSTANT));
  const api = await mockPublic(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/@demo");
  const dialog = page.getByRole("dialog", { name: OC_WINDOW, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(OC_NAME, { exact: true })).toBeVisible();
  await expect(dialog).toContainText(OC_BIO);
  const clock = page.locator(".visitor-taskbar time");
  await expect(clock).toHaveAttribute("datetime", FIXED_INSTANT);
  const originalDate = await clock.getAttribute("title");
  const readsBefore = api.readCount();
  await dialog.getByRole("button", { name: "最小化", exact: true }).click();
  await page.locator(".start-btn").click();
  await switchLanguage(page, page.locator(".start-menu").getByTestId("language-switcher"), "en");
  await expect(page.locator(".start-btn")).toHaveText("Start");
  await expect(dialog).toBeHidden();
  await expect(clock).toHaveAttribute("datetime", FIXED_INSTANT);
  await expect(clock).toHaveAttribute("title", "Saturday, October 17, 2026");
  expect(await clock.getAttribute("title")).not.toBe(originalDate);
  await page.locator(".start-btn").click();
  await page.locator(".visitor-task-buttons").getByRole("button", { name: OC_WINDOW, exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(OC_NAME, { exact: true })).toBeVisible();
  await expect(dialog).toContainText(OC_BIO);
  await expect(dialog.locator("b").filter({ hasText: "使用者自己的內容" })).toHaveCount(0);
  expect(api.readCount()).toBe(readsBefore);
  expect(api.writes).toEqual([]);
});

test("320px public mobile switching preserves its open OC window and authored text", async ({ page }) => {
  const api = await mockPublic(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/@demo");
  await page.locator(".m-icon").filter({ hasText: OC_WINDOW }).click();
  const dialog = page.getByRole("dialog", { name: OC_WINDOW, exact: true });
  await expect(dialog).toBeVisible();
  // with an app open the site options (language) live in the title bar's menu
  await page.getByRole("button", { name: "網站選項", exact: true }).click();
  const selector = page.locator(".m-site-panel").getByTestId("language-switcher");
  await switchLanguage(page, selector, "en");
  await expectReachable(page, selector);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(OC_NAME, { exact: true })).toBeVisible();
  await expect(dialog).toContainText(OC_BIO);
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  expect(api.writes).toEqual([]);
});

test("public music keeps playback position, volume and active track across native switching", async ({ page }) => {
  // Controlled media events test lifecycle preservation without remote audio timing.
  await page.addInitScript(() => {
    const addListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type !== "error") addListener.call(this, type, listener, options);
    };
    Object.defineProperty(HTMLMediaElement.prototype, "duration", { configurable: true, get: () => 90 });
    Object.defineProperty(HTMLMediaElement.prototype, "seekable", { configurable: true, get: () => ({ length: 1, start: () => 0, end: () => 90 }) });
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new Event("pause")); };
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event("loadedmetadata"));
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
  });
  const music: SiteDocument = {
    ...structuredClone(documentFixture),
    windows: [{
      id: "music", type: "music", title: "Original Player", icon: "music", defaultOpen: true,
      layout: { desktop: { x: 80, y: 50, w: 390, h: 430, z: 1, iconX: 16, iconY: 18 }, mobile: { order: 0 } },
      content: {
        tracks: [{ id: "track-1", title: OC_NAME, artist: "Original Creator", cover: null, coverUrl: "", lyrics: OC_BIO, rightsNote: "Original work", source: { kind: "audioUrl", url: "https://media.example.com/theme.mp3" } }],
        playlist: { id: "playlist-1", title: "Original Playlist", trackIds: ["track-1"] }
      }
    }]
  } as SiteDocument;
  await mockPublic(page, music);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/@demo");
  const dialog = page.getByRole("dialog", { name: "Original Player", exact: true });
  await dialog.getByRole("button", { name: "播放", exact: true }).click();
  const progress = dialog.locator(".music-progress input");
  await expect(progress).toBeVisible();
  await progress.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(progress).toHaveValue("2");
  const volume = dialog.getByRole("slider").last(); // volume; its accessible name is translated on switch
  await volume.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveValue("0.95");
  await page.locator(".start-btn").click();
  await switchLanguage(page, page.locator(".start-menu").getByTestId("language-switcher"), "en");
  await expect(dialog.locator(".music-play")).toHaveAttribute("aria-label", "Pause");
  await expect(progress).toHaveValue("2");
  await expect(volume).toHaveValue("0.95");
  await expect(dialog.locator(".music-meta strong")).toHaveText(OC_NAME);
});

test("320px landing and editor language controls keep the main actions reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  const landingSelector = page.getByTestId("language-switcher");
  await switchLanguage(page, landingSelector, "en");
  await expectReachable(page, landingSelector);
  await expect(page.getByRole("link", { name: "Create my desktop →" })).toBeVisible();
  const api = await mockEditor(page);
  await page.goto("/editor/site-1");
  const editorSelector = page.locator(".editor-topbar").getByTestId("language-switcher");
  await expect(editorSelector).toHaveValue("en");
  await expectReachable(page, editorSelector);
  await expect(page.locator(".editor-topbar").getByRole("button", { name: "Publish", exact: true })).toBeInViewport();
  await expect(page.getByRole("toolbar", { name: "Mobile editor tools", exact: true })).toBeVisible();
  await captureScreen(page, "i18n-editor-en-320px");
  await switchLanguage(page, editorSelector, "zh-Hant");
  await expectReachable(page, editorSelector);
  await captureScreen(page, "i18n-editor-zh-Hant-320px");
  expect(api.saves).toHaveLength(0);
});

for (const [locale, browserLocale, label, beta, fallbackFamily] of [
  ["ja", "ja-JP", "表示言語", "ベータ版", "Yu Gothic"],
  ["ko", "ko-KR", "인터페이스 언어", "베타", "Malgun Gothic"]
] as const) {
  test(`preview ${locale} detects its regional variant and exposes a beta switch with a CJK fallback stack`, async ({ page }) => {
    test.skip(!PREVIEW_LOCALES, "Run against VITE_I18N_PREVIEW_LOCALES=true to review Japanese/Korean beta UI.");
    await browserPreferences(page, [browserLocale]);
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto("/");
    const selector = page.getByTestId("language-switcher");
    await expect(selector).toHaveValue(locale);
    await expect(selector).toHaveAccessibleName(label);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(selector.locator("option:checked")).toContainText(beta);
    // This verifies stack selection only, not glyph coverage on the host OS.
    await expect(selector).toHaveCSS("font-family", new RegExp(fallbackFamily));
    await expectReachable(page, selector);
    await switchLanguage(page, selector, "en");
    await switchLanguage(page, selector, locale);
    await page.reload();
    await expect(selector).toHaveValue(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await captureScreen(page, `i18n-${locale}-320px`);

    await mockPublic(page);
    await page.goto("/@demo");
    await page.locator(".m-icon").filter({ hasText: OC_WINDOW }).click();
    await page.getByRole("button", { name: /^(網站選項|Site options|サイトのオプション|사이트 옵션)$/ }).click();
    const mobileSelector = page.locator(".m-site-panel").getByTestId("language-switcher");
    await expect(mobileSelector).toHaveValue(locale);
    await switchLanguage(page, mobileSelector, "en");
    await switchLanguage(page, mobileSelector, locale);
    await expectReachable(page, mobileSelector);
    const dialog = page.getByRole("dialog", { name: OC_WINDOW, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(OC_BIO);
    await captureScreen(page, `i18n-public-${locale}-320px`);
  });
}
