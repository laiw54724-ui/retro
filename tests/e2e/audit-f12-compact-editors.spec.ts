import { expect, test, type Page, type Locator } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, normalizeDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const phase = process.env.F12_CAPTURE_PHASE === "before" ? "before" : "after";
const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#d8e9ff"/><circle cx="80" cy="60" r="30" fill="#4169a8"/><path d="M20 155 Q20 95 80 95 Q140 95 140 155" fill="#4169a8"/></svg>';
const portraitUrl = "https://fixtures.test/portrait.svg";
type Kind = "about" | "character-dialog";
async function setup(page: Page, kind: Kind, width: number, publicOnly = false) {
  const win = makeWindow(kind);
  win.id = kind;
  win.title = `${kind}.exe`;
  win.defaultOpen = true;
  // Keep makeWindow's actual default width/height; only position it for the fixture.
  win.layout.desktop.x = 24;
  win.layout.desktop.y = 24;
  if (win.type === "about") Object.assign(win.content, { nickname: "Demo creator", bio: "I draw characters and tell stories.", avatar: portraitUrl, avatarUrl: portraitUrl });
  else Object.assign(win.content, { characterName: "Demo character", message: "Welcome to my desktop!\nChoose a window to explore.", image: portraitUrl, imageUrl: portraitUrl, autoShow: false });
  const migrated = migrateSiteDocumentV2(normalizeDocument({ ...documentFixture, windows: [win] }), { siteId: "site-1" });
  if (!migrated.ok) throw new Error("Invalid compact editor fixture");
  let draft = migrated.document;
  const initial = structuredClone(draft);
  const saves: typeof draft[] = [];
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route(portraitUrl, route => route.fulfill({ contentType: "image/svg+xml", body: portrait }));
  await page.route("**/api/public/sites/demo", route => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: initial, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  await page.route("**/api/sites/site-1/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", draft_document: draft, draft_version: saves.length + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/draft", route => {
    draft = route.request().postDataJSON().document;
    saves.push(structuredClone(draft));
    return route.fulfill({ json: { version: saves.length + 1, updatedAt: "2026-10-19T00:00:00Z" } });
  });
  if (!publicOnly) await page.addInitScript(value => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.goto(publicOnly ? "/@demo" : "/editor/site-1");
  if (width < 768) {
    await page.getByRole("button", { name: win.title, exact: true }).click();
    if (!publicOnly) await page.getByRole("button", { name: "編輯內容", exact: true }).click();
  }
  const surface = publicOnly ? page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop") : page.locator("main");
  const dialog = surface.getByRole("dialog", { name: win.title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(publicOnly ? kind === "about" ? ".about-view" : ".character-dialog-app" : kind === "about" ? ".about-editor" : ".character-dialog-settings")).toBeVisible();
  return { dialog, initial, saved: () => draft, saves };
}
async function visibility(locator: Locator) {
  return locator.evaluate(node => new Promise(resolve => {
    const observer = new IntersectionObserver(([entry]) => {
      const rect = node.getBoundingClientRect();
      resolve({ ratio: entry.intersectionRatio, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      observer.disconnect();
    });
    observer.observe(node);
  }));
}
for (const width of [1440, 320, 390, 430]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768, isMobile: width < 768 });
    for (const kind of ["about", "character-dialog"] as const) {
      test(`${kind} primary fields fit the initial editor view`, async ({ page }, testInfo) => {
        const { dialog, initial, saved, saves } = await setup(page, kind, width);
        const name = dialog.getByRole("textbox", { name: kind === "about" ? "暱稱" : "角色名稱", exact: true });
        const message = dialog.getByRole("textbox", { name: kind === "about" ? "簡介" : "訊息", exact: true });
        await page.screenshot({ path: testInfo.outputPath(`${phase}-${kind}-${width}.png`) });
        await testInfo.attach("first-screen-metrics", { body: JSON.stringify({ name: await visibility(name), message: await visibility(message), layout: initial.windows[0].layout }), contentType: "application/json" });
        if (phase === "before") return;
        if (kind === "about") await name.focus();
        await expect(name).toBeInViewport({ ratio: 1 });
        if (kind === "about") await message.focus();
        await expect(message).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(saves).toHaveLength(0);
        const disclosure = dialog.locator(kind === "about" ? ".about-avatar-toggle" : ".character-editor-preview > summary");
        const nameBefore = await name.inputValue();
        await name.fill(`${nameBefore} edited`);
        await expect.poll(() => saves.length).toBe(1);
        // Native keyboard disclosure, mounted fields, and no geometry writes.
        expect((await disclosure.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        if (width < 768) await disclosure.tap();
        else { await disclosure.focus(); await disclosure.press("Enter"); }
        if (kind === "about") await expect(dialog.locator(".about-avatar-panel")).toBeVisible();
        else await expect(disclosure.locator("..")).toHaveAttribute("open", "");
        const url = dialog.getByLabel(kind === "about" ? "頭像網址" : "圖片網址", { exact: true });
        await url.fill("https://");
        await url.press("Tab");
        await expect(url).toHaveValue("https://");
        await disclosure.focus();
        await disclosure.press("Space");
        if (kind === "about") await expect(dialog.locator(".about-avatar-panel")).toHaveCount(0);
        else await expect(disclosure.locator("..")).not.toHaveAttribute("open", "");
        await expect(disclosure).toBeFocused();
        await disclosure.press("Enter");
        await expect(url).toHaveValue(kind === "about" ? portraitUrl : "https://");
        await expect(name).toHaveValue(`${nameBefore} edited`);
        await page.waitForTimeout(800);
        expect(saves).toHaveLength(1);
        expect(saved().windows[0].layout).toEqual(initial.windows[0].layout);
        // A rejected URL draft stays local; the published source is untouched.
        expect(saved().windows[0].content).toMatchObject(kind === "about" ? { avatar: portraitUrl, avatarUrl: portraitUrl } : { image: portraitUrl, imageUrl: portraitUrl });
      });
      test(`${kind} public presentation is unchanged`, async ({ page }, testInfo) => {
        const { dialog, saves } = await setup(page, kind, width, true);
        const content = dialog.locator(kind === "about" ? ".about-view" : ".character-dialog-app");
        await expect(content.locator("img")).toBeVisible();
        // The About clock is outside the content area captured for comparison.
        const target = kind === "about" ? content.locator(".about-main") : content;
        await target.screenshot({ path: testInfo.outputPath(`${phase}-public-${kind}-${width}.png`) });
        await expect(dialog.getByRole("textbox")).toHaveCount(0);
        await expect(dialog.locator("summary")).toHaveCount(0);
        expect(saves).toHaveLength(0);
      });
    }
  });
}
