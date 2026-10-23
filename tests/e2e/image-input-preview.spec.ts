import { expect, test, type Page, type Route } from "@playwright/test";
import { makeWindow, makeGalleryImage, migrateSiteDocumentV2, type DesktopWindow, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const SOURCE = "https://images.example.test/preview.png";
const FILE = "tests/fixtures/image-w3a/wide.png";
const ASSET = "retro-asset:11111111-1111-4111-8111-111111111111";
async function fixture(page: Page, windows: DesktopWindow[] = []) {
  const migrated = migrateSiteDocumentV2({ ...structuredClone(documentFixture), windows }, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration");
  let saved = migrated.document;
  const writes: SiteDocumentV2Input[] = [];
  let pending: Route | null = null;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.addInitScript(() => {
    const state = window as typeof window & { consumed: number }; state.consumed = 0;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (String(args[0]).endsWith("/assets") && args[1]?.method === "POST") {
        const json = response.json.bind(response);
        response.json = async () => { const value = await json(); setTimeout(() => { state.consumed++; }, 0); return value; };
      }
      return response;
    };
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", draft_document: saved, draft_version: writes.length + 1, published_document: null, published_version: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { assets: [] } });
    pending = route;
  });
  await page.route("**/api/sites/site-1/assets/*/content", (route) => route.fulfill({ path: FILE, contentType: "image/png" }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saved = route.request().postDataJSON().document; writes.push(saved);
    return route.fulfill({ json: { version: writes.length + 1 } });
  });
  await page.route("https://images.example.test/**", (route) => route.fulfill({ path: FILE, contentType: "image/png" }));
  return { writes, saved: () => saved, pending: () => !!pending, finish: async () => {
    if (!pending) throw new Error("no upload");
    await pending.fulfill({ json: { asset: { id: ASSET.slice(12), url: ASSET, kind: "image", mimeType: "image/png", size: 100, name: "preview" } } });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { consumed: number }).consumed)).toBe(1);
  } };
}
async function themePanel(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 }); await page.goto("/editor/site-1");
  if (width < 768) { await page.getByRole("button", { name: "主題", exact: true }).click(); return page.getByRole("dialog", { name: "主題", exact: true }); }
  await page.getByRole("tab", { name: "主題", exact: true }).click(); return page.locator(".left-panel2");
}
for (const width of [320, 390, 1440]) {
  test(`theme URL previews immediately; cancel, Apply and reload at ${width}px`, async ({ page }, testInfo) => {
    const site = await fixture(page);
    const panel = await themePanel(page, width);
    const input = panel.getByRole("textbox", { name: "圖片連結", exact: true });
    await input.fill("javascript:alert(1)"); await input.press("Enter");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    expect(site.writes).toHaveLength(0);
    await input.fill(SOURCE); await input.press("Enter");
    const canvas = page.locator(width < 768 ? ".m-screen:visible" : ".desktop-canvas");
    await expect(canvas).toHaveCSS("background-image", `url("${SOURCE}")`);
    await expect(panel.locator(".theme-wallpaper-preview")).toBeVisible();
    await page.waitForTimeout(800); expect(site.writes).toHaveLength(0);
    await expect(page.locator(".theme-preview-notice")).toContainText("尚未儲存");
    await panel.locator(".theme-wallpaper-preview").scrollIntoViewIfNeeded();
    if (width < 768) await input.evaluate((element) => {
      const body = element.closest(".m-sheet-body");
      if (body) body.scrollTop += element.getBoundingClientRect().top - body.getBoundingClientRect().top - 150;
    });
    await page.screenshot({ path: testInfo.outputPath(`theme-source-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.getByRole("button", { name: "取消預覽", exact: true }).click();
    await expect(canvas).not.toHaveCSS("background-image", `url("${SOURCE}")`);
    await input.fill(SOURCE); await input.press("Enter");
    if (width < 768) await panel.getByRole("button", { name: "關閉", exact: true }).click();
    await page.locator(".theme-preview-notice").getByRole("button", { name: "套用至草稿" }).click();
    await expect.poll(() => site.writes.length).toBe(1);
    expect(site.saved().theme.wallImage).toBe(SOURCE);
    if (width >= 768) {
      await page.keyboard.press("ControlOrMeta+z");
      await expect(canvas).not.toHaveCSS("background-image", `url("${SOURCE}")`);
      await expect.poll(() => site.writes.length).toBe(2);
    }
    await page.reload();
    if (width < 768) await expect(canvas).toHaveCSS("background-image", `url("${SOURCE}")`);
    else await expect(canvas).not.toHaveCSS("background-image", `url("${SOURCE}")`);
  });
}
for (const edited of [false, true]) test(`wallpaper delayed upload ${edited ? "preserves typed URL" : "previews untouched upload"}`, async ({ page }) => {
  const site = await fixture(page); const panel = await themePanel(page, 1440);
  await panel.locator('input[type="file"]').setInputFiles(FILE);
  await expect.poll(site.pending).toBe(true);
  const input = panel.getByRole("textbox", { name: "圖片連結", exact: true });
  if (edited) await input.fill(SOURCE);
  await site.finish();
  if (edited) { await expect(input).toHaveValue(SOURCE); await expect(page.locator(".theme-preview-notice")).toHaveCount(0); await input.press("Enter"); }
  await expect(panel.locator(".theme-wallpaper-preview")).toBeVisible();
  await expect(page.locator(".theme-preview-notice")).toBeVisible();
  expect(site.writes).toHaveLength(0);
});

test("character and Moodboard image URL fields preview and survive reload", async ({ page }) => {
  const character = makeWindow("character-dialog"); character.id = "character"; character.title = "Character.exe";
  const board = makeWindow("moodboard"); board.id = "board"; board.title = "Moodboard.exe";
  board.layout.desktop = { ...board.layout.desktop, x: 10, y: 10, w: 750, h: 650, z: 2 };
  const site = await fixture(page, [character, board]);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/editor/site-1");
  const editor = page.locator(".moodboard-editor:visible");
  await editor.getByRole("button", { name: "從連結新增圖片", exact: true }).click();
  await editor.getByRole("textbox", { name: "從連結新增圖片", exact: true }).fill(SOURCE);
  await editor.getByRole("textbox", { name: "從連結新增圖片", exact: true }).press("Enter");
  await expect(editor.locator(".moodboard-stage img")).toHaveAttribute("src", SOURCE);
  await page.getByRole("button", { name: "開始", exact: true }).click();
  await page.getByRole("menuitem", { name: "Character.exe", exact: true }).click();
  const dialog = page.locator(".character-dialog-app:visible");
  await dialog.locator(".character-image-toggle").click();
  await dialog.getByRole("textbox", { name: "圖片網址", exact: true }).fill(SOURCE);
  await dialog.getByRole("textbox", { name: "圖片網址", exact: true }).press("Enter");
  await expect(dialog.locator(".character-dialog-image")).toHaveAttribute("src", SOURCE);
  await expect.poll(() => site.writes.length).toBeGreaterThan(0);
  await page.reload();
  await expect(editor.locator(".moodboard-stage img")).toHaveAttribute("src", SOURCE);
  await expect(dialog.locator(".character-dialog-image")).toHaveAttribute("src", SOURCE);
});

for (const type of ["about", "document", "gallery", "character-dialog", "moodboard"] as const) test(`${type} URL typing invalidates a late source upload`, async ({ page }) => {
  const window = makeWindow(type); window.id = type;
  if (window.type === "moodboard") window.content.elements = [];
  if (window.type === "character-dialog") { window.content.image = SOURCE; window.content.imageUrl = SOURCE; }
  if (window.type === "about") { window.content.avatar = SOURCE; window.content.avatarUrl = SOURCE; }
  if (window.type === "document") window.content.blocks = [{ id: "photo", kind: "image", src: SOURCE, srcUrl: SOURCE, alt: "", caption: "" }];
  if (window.type === "gallery") window.content.images = [makeGalleryImage({ src: SOURCE, srcUrl: SOURCE })];
  window.layout.desktop = { ...window.layout.desktop, x: 10, y: 10, w: 720, h: 720, z: 2 };
  const site = await fixture(page, [window]);
  await page.setViewportSize({ width: 1440, height: 950 }); await page.goto("/editor/site-1");
  const module = page.locator(".canvas-window");
  if (type === "about") await module.locator(".about-avatar-toggle").click();
  if (type === "document") await module.locator(".doc-block").first().click();
  if (type === "gallery") await module.locator("[data-image-id]").first().click();
  if (type === "character-dialog") await module.locator(".character-image-toggle").click();
  await module.locator(type === "moodboard" ? '.moodboard-toolbar input[type="file"]' : 'input[type="file"]').last().setInputFiles(FILE);
  await expect.poll(site.pending).toBe(true);
  if (type === "about") await module.locator(".about-avatar-toggle").click();
  if (type === "moodboard") await module.getByRole("button", { name: "圖片說明", exact: true }).click();
  const input = module.getByRole("textbox", { name: type === "about" ? "頭像網址" : "圖片網址", exact: true });
  const next = "https://images.example.test/newer.png";
  await input.fill(next); await site.finish();
  await expect(input).toHaveValue(next);
  await expect(module.locator('[data-upload-state="failed"]')).toHaveCount(1);
  await input.press("Enter");
  await expect.poll(() => JSON.stringify(site.saved()).includes(next)).toBe(true);
});
