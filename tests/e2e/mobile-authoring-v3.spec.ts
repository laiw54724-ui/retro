import { enterContentEditor } from "./content-entry.fixture";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createStarterDocument, makeGalleryImage, makeWindow, migrateSiteDocumentV2 } from "../../packages/shared/src";

// Synthetic local API only. Viewport resizing is not a real-device keyboard test.
async function fixture(page: Page) {
  await page.addInitScript(() => localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "mobile@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } })));
  const legacy = createStarterDocument("Mobile authoring", "classic98", "blank");
  const window = makeWindow("gallery");
  window.id = "gallery"; window.title = "Gallery.exe"; window.defaultOpen = false;
  window.content.images = Array.from({ length: 8 }, (_, index) => makeGalleryImage({ id: `image-${index}`, title: `Image ${index}`, src: null, srcUrl: "" }));
  legacy.windows = [window];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "mobile" });
  if (!migrated.ok) throw new Error("Invalid mobile fixture");
  let document = migrated.document, version = 1;
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname.endsWith("/draft")) {
      document = route.request().postDataJSON().document;
      return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-22T00:00:00Z" } });
    }
    if (url.pathname === "/api/sites/mobile") return route.fulfill({ json: { site: { id: "mobile", username: "mobile", site_name: document.siteName, draft_document: document, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } });
    if (url.pathname.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
  });
  await page.goto("/editor/mobile");
  await expect(page.locator(".editor-topbar")).toBeVisible();
}

async function fullyVisible(control: Locator, width: number, height: number) {
  await expect(control).toBeInViewport({ ratio: 1 });
  const box = (await control.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}

for (const width of [320, 375, 390, 430]) {
  test(`authoring controls and focused input survive a short viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.locator(".m-icon").click();
    await enterContentEditor(page);
    await page.locator(".gal-editor-toolbar button[aria-expanded]").click();
    const input = page.getByLabel("新增圖片網址", { exact: true });
    await input.fill("https://unfinished");
    await input.focus();
    await page.addStyleTag({ content: ":root { --m-safe-bottom: 34px; }" });
    await page.setViewportSize({ width, height: 420 });
    // No test-side scrollIntoView: the author shell must keep its focused input visible.
    await expect(input).toBeFocused();
    await expect(input).toBeInViewport({ ratio: 1 });
    await expect(input).toHaveValue("https://unfinished");
    const publish = page.getByRole("button", { name: "發布", exact: true });
    for (const control of [publish, page.getByRole("button", { name: "復原", exact: true }), page.getByRole("button", { name: "重做", exact: true }), page.locator(".save-text"), page.locator(".m-window-settings"), page.locator(".m-back")]) await fullyVisible(control, width, 420);
    expect((await publish.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const body = (await page.locator(".m-win-body").boundingBox())!;
    const field = (await input.boundingBox())!;
    await expect(page.locator(".m-toolbar")).toHaveCount(0);
    expect(field.y).toBeGreaterThanOrEqual(body.y);
    expect(field.y + field.height).toBeLessThanOrEqual(body.y + body.height);
    expect(body.y + body.height).toBeLessThanOrEqual(420 - 34);
    await page.screenshot({ path: test.info().outputPath(`short-${width}.png`) });
    const settings = page.getByRole("button", { name: "視窗設定", exact: true });
    await settings.click();
    await page.keyboard.press("Escape");
    await expect(settings).toBeFocused();
    await expect(page.locator(".m-window-settings")).toBeVisible();
    await expect(input).toHaveValue("https://unfinished");
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: test.info().outputPath(`phone-${width}.png`) });
  });
}

test("desktop keeps its full authoring toolbar and phone preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  await expect(page.locator(".editor-topbar .brand")).toContainText("Retro Desktop");
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "手機版", exact: true }).click();
  await page.locator(".m-icon").click();
  await expect(page.locator(".m-status")).toBeVisible();
  await expect(page.locator(".m-window-settings")).toHaveAccessibleName("視窗設定");
  await page.screenshot({ path: test.info().outputPath("desktop-phone-preview.png") });
});

// Model the browser distinction between layout and visual viewports. This is an
// injected resize signal, not evidence of a native software keyboard or pinch.
test("English visual-viewport-only resize retains input, chrome and height through zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => localStorage.setItem("retrodesk:locale", "en"));
  await fixture(page);
  await page.locator(".m-icon").click();
  await enterContentEditor(page);
  await page.locator(".gal-editor-toolbar button[aria-expanded]").click();
  const input = page.locator(".gal-add-url textarea");
  await input.fill("https://unfinished");
  await page.addStyleTag({ content: ":root { --m-safe-bottom: 34px; }" });
  const resizeVisual = async (height: number, scale: number) => page.evaluate(({ height, scale }) => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { configurable: true, value: height });
    Object.defineProperty(viewport, "scale", { configurable: true, value: scale });
    viewport.dispatchEvent(new Event("resize"));
  }, { height, scale });
  await resizeVisual(420, 1);
  await expect(page.locator(".editor-app")).toHaveCSS("height", "420px");
  await expect(input).toBeFocused();
  await expect(input).toBeInViewport({ ratio: 1 });
  for (const control of [input, page.locator(".m-window-settings"), page.locator(".m-back"), page.getByRole("button", { name: "Publish", exact: true })]) await fullyVisible(control, 320, 420);
  const body = (await page.locator(".m-win-body").boundingBox())!;
  await expect(page.locator(".m-toolbar")).toHaveCount(0);
  expect(body.y + body.height).toBeLessThanOrEqual(420 - 34);
  await page.screenshot({ path: test.info().outputPath("english-visual-viewport-420.png") });
  await resizeVisual(210, 2);
  await expect(page.locator(".editor-app")).toHaveCSS("height", "420px");
  await expect(input).toHaveValue("https://unfinished");
  await resizeVisual(844, 1);
  await expect(page.locator(".editor-app")).toHaveCSS("height", "844px");
  await expect(input).toBeFocused();
});

test("phone zoom preserves the last unzoomed visual viewport height", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: 420 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".editor-app")).toHaveCSS("height", "420px");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "scale", { configurable: true, value: 2 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".editor-app")).toHaveCSS("height", "420px");
});
