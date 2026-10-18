import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { createStarterDocument, makeGalleryImage, makeWindow, type SiteDocument } from "@retrodesk/shared";
import { igWindow } from "./ig-fixture";

/**
 * R4 (#70 + #71): the phone shell contract.
 *  - One return path: the app's own title bar (‹ Desktop / title / site menu / close). No second site header and no
 *    bottom taskbar while an app is open.
 *  - The content area gets the height: the shell chrome is one slim bar, not three stacked layers.
 *  - 44px touch targets for every shell control; ordinary taps (never `force`).
 *  - Editing controls live in the title bar instead of floating over the content.
 *  - Bottom space follows the safe area through `--m-safe-bottom` (env(safe-area-inset-bottom) on a real phone).
 *  - Music: one scroll area on a phone (no nested list/lyrics scrollers).
 * `CAPTURE_DIR=<dir>` also writes screenshots of every app for before/after review.
 */
const CAPTURE_DIR = process.env.CAPTURE_DIR;
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const LONG = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long lyric`).join("\n");

function shellDocument(): SiteDocument {
  const doc = createStarterDocument("Shell Demo", "classic98", "blank");
  const win = <T extends SiteDocument["windows"][number]>(window: T, id: string, title: string, order: number): T => { window.id = id; window.title = title; window.defaultOpen = false; window.layout.mobile = { order }; return window; };
  const about = win(makeWindow("about", 0), "about", "About.exe", 0);
  const links = win(makeWindow("links", 1), "links", "Links.exe", 1);
  const document = win(makeWindow("document", 2), "document", "Notes.exe", 2);
  const gallery = win(makeWindow("gallery", 3), "gallery", "Photos.exe", 3);
  if (gallery.type === "gallery") gallery.content.images = [makeGalleryImage({ title: "One", src: "https://assets.test/g.png", srcUrl: "https://assets.test/g.png" })];
  const explorer = win(makeWindow("explorer", 4), "explorer", "Files.exe", 4);
  const music = win(makeWindow("music", 5), "music", "Music.exe", 5);
  if (music.type === "music") {
    music.content.tracks = Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, title: `Track ${i + 1}`, artist: "Me", cover: null, coverUrl: "", source: { kind: "audioUrl" as const, url: `https://media.example.com/${i}.mp3` }, lyrics: i === 0 ? LONG : "", rightsNote: "" }));
    music.content.playlist = { id: "pl", title: "List", trackIds: music.content.tracks.map((track) => track.id) };
  }
  const ig = { ...igWindow(), id: "ig", title: "Instagram.exe", defaultOpen: false, layout: { desktop: { x: 20, y: 20, w: 400, h: 600, z: 7, iconX: 16, iconY: 18 }, mobile: { order: 6 } } } as unknown as SiteDocument["windows"][number];
  doc.windows = [about, links, document, gallery, explorer, music, ig];
  return doc;
}

const APPS = ["About.exe", "Links.exe", "Notes.exe", "Photos.exe", "Files.exe", "Music.exe", "Instagram.exe"] as const;

async function openVisitor(page: Page) {
  await page.route("https://assets.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") }));
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Shell Demo", published_document: shellDocument(), published_version: 1, published_at: "2026-10-15T00:00:00.000Z" } } }));
  await page.goto("/@demo");
  await expect(page.locator(".m-screen")).toBeVisible();
}

const box = async (locator: ReturnType<Page["locator"]>) => (await locator.first().boundingBox())!;
const shot = async (page: Page, name: string) => { if (CAPTURE_DIR) await page.screenshot({ path: join(CAPTURE_DIR, `${name}.png`) }); };

for (const [width, height] of [[320, 568], [390, 844], [430, 932], [667, 375]] as const) {
  test.describe(`visitor shell at ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    for (const app of APPS) {
      test(`${app}: one return path, slim chrome, big touch targets`, async ({ page }) => {
        await openVisitor(page);
        await shot(page, `visitor-home-${width}`);
        await page.getByRole("button", { name: app, exact: true }).click();
        await expect(page.locator(".m-win-body")).toBeVisible();
        await shot(page, `visitor-${app.replace(".exe", "")}-${width}`);

        // single return path: no second site header, no bottom taskbar, exactly one "‹ Desktop"
        await expect(page.locator(".m-titlebar")).toBeHidden();
        await expect(page.locator(".m-taskbar")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /‹ 桌面/ })).toHaveCount(1);

        // the content gets the height (one slim bar instead of three stacked layers)
        const body = await box(page.locator(".m-win-body"));
        const chromeBudget = height <= 400 ? 70 : 84;
        expect(height - body.height, `${app}: shell chrome at ${width}x${height}`).toBeLessThanOrEqual(chromeBudget);

        // every shell control is a real 44px touch target and sits inside the viewport
        for (const control of [page.getByRole("button", { name: /‹ 桌面/ }), page.getByRole("button", { name: "網站選項" }), page.getByRole("button", { name: "關閉" })]) {
          const rect = await box(control);
          expect(rect.height, `${app} control height`).toBeGreaterThanOrEqual(43.5);
          expect(rect.width, `${app} control width`).toBeGreaterThanOrEqual(43.5);
          expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.5);
        }

        // the language/site options moved into the title bar menu and stay reachable
        await page.getByRole("button", { name: "網站選項" }).click();
        await expect(page.getByTestId("language-switcher")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByTestId("language-switcher")).toBeHidden();

        // the way back works with a plain tap
        await page.getByRole("button", { name: /‹ 桌面/ }).click();
        await expect(page.locator(".m-titlebar")).toBeVisible();
        await expect(page.getByRole("button", { name: app, exact: true })).toBeVisible();
      });
    }
  });
}

test.describe("bottom space follows the safe area", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const app of ["About.exe", "Instagram.exe", "Music.exe"] as const) {
    test(`${app}: nothing sits behind a 34px home-indicator inset`, async ({ page }) => {
      await openVisitor(page);
      await page.addStyleTag({ content: ":root { --m-safe-bottom: 34px; }" }); // what env(safe-area-inset-bottom) is on an iPhone
      await page.getByRole("button", { name: app, exact: true }).click();
      const win = await box(page.locator(".m-win-body"));
      expect(win.y + win.height, "content ends above the safe-area inset").toBeLessThanOrEqual(844 - 34 + 0.5);
    });
  }
});

test.describe("music on a phone has one scroll area", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("a long playlist and long lyrics scroll naturally to the end, every control reachable", async ({ page }) => {
    await openVisitor(page);
    await page.addStyleTag({ content: ":root { --m-safe-bottom: 34px; }" });
    await page.getByRole("button", { name: "Music.exe", exact: true }).click();
    await shot(page, "visitor-music-top");
    const list = page.locator(".music-track-list");
    // no nested scroller: the list shows all its tracks and the window body is the only thing that scrolls
    expect(await list.evaluate((node) => getComputedStyle(node).maxHeight)).toBe("none");
    expect(await list.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
    await page.locator(".music-lyrics summary").click();
    const lyrics = page.locator(".music-lyrics pre");
    expect(await lyrics.evaluate((node) => getComputedStyle(node).maxHeight)).toBe("none");
    expect(await lyrics.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);

    // the module area is the one scroller (its list and lyrics no longer scroll inside it)
    const body = page.locator(".module-music");
    expect(await body.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);
    await body.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await shot(page, "visitor-music-bottom");
    // the last lyric line is fully visible above the safe-area inset after scrolling to the end
    const last = await box(lyrics);
    expect(last.y + last.height).toBeLessThanOrEqual(844 - 34 + 1);
    // tracks stay selectable and the single-source rule still holds (one tap, no force)
    await page.getByRole("button", { name: "選擇 Track 14" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "選擇 Track 14" }).click();
    await expect(page.getByRole("button", { name: "選擇 Track 14" })).toHaveAttribute("aria-current", "true");
  });
});

test.describe("phone editor shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  async function openEditor(page: Page) {
    await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
    await page.route("https://assets.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") }));
    const site = { id: "site-1", username: "demo", site_name: "Shell Demo", draft_document: shellDocument(), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-15T00:00:00.000Z", access_role: "owner" };
    await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
    await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
    await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-15T00:01:00.000Z" } }));
    await page.goto("/editor/site-1");
    await expect(page.locator(".m-screen")).toBeVisible({ timeout: 15000 });
  }

  test("the edit/finish control is in the app's title bar, not floating over its content", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "About.exe", exact: true }).click();
    await shot(page, "editor-About-390");
    await expect(page.locator(".m-fab")).toHaveCount(0);
    await expect(page.locator(".m-titlebar")).toBeHidden();
    const toggle = page.getByRole("button", { name: "編輯此視窗", exact: true });
    const rect = await box(toggle);
    expect(rect.height).toBeGreaterThanOrEqual(43.5);
    // it sits in the title bar row, above the content
    expect(rect.y + rect.height).toBeLessThanOrEqual((await box(page.locator(".m-win-body"))).y + 1);
    await toggle.click();
    await expect(page.getByRole("button", { name: "完成編輯", exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "editor-About-editing-390");
    await page.getByRole("button", { name: "完成編輯", exact: true }).click();
    await expect(page.getByRole("button", { name: "編輯此視窗", exact: true })).toBeVisible();
    // the editor's own toolbar stays reachable above the home indicator
    await expect(page.getByRole("toolbar")).toBeVisible();
    await page.getByRole("button", { name: /‹ 桌面/ }).click();
    await expect(page.locator(".m-titlebar")).toBeVisible();
  });
});

test.describe("phone startup contract (#71 defaultOpen)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("defaultOpen is a desktop-only setting: a phone starts on the home screen and opens no app by itself", async ({ page }) => {
    const doc = shellDocument();
    doc.windows.forEach((window) => { window.defaultOpen = true; }); // every app asks to open by default
    await page.route("https://assets.test/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgo=", "base64") }));
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Shell Demo", published_document: doc, published_version: 1, published_at: "2026-10-15T00:00:00.000Z" } } }));
    await page.goto("/@demo");
    await expect(page.locator(".m-titlebar")).toBeVisible();
    await expect(page.getByRole("button", { name: /‹ 桌面/ })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
