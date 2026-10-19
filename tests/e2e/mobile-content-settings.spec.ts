import { expect, test, type Page } from "@playwright/test";
import { createStarterDocument, makeGalleryImage, makeWindow, migrateSiteDocumentV2, type DesktopWindow } from "@retrodesk/shared";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const types: DesktopWindow["type"][] = ["image", "document", "gallery", "links", "about", "instagram", "music", "moodboard", "explorer", "minesweeper", "character-dialog", "guestbook"];

async function openEditor(page: Page, type: DesktopWindow["type"] = "gallery", empty = false) {
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  const legacy = createStarterDocument("Entry demo", "classic98", "blank");
  const window = makeWindow(type);
  window.id = "current"; window.title = `${type}.exe`; window.defaultOpen = false;
  if (window.type === "gallery") window.content.images = Array.from({ length: 8 }, (_, index) => makeGalleryImage({ id: `image-${index}`, title: `Image ${index}`, src: null, srcUrl: "" }));
  legacy.windows = empty ? [] : [window];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration failed");
  let draft = migrated.document;
  let version = 1;
  let saves = 0;
  await page.route("**/api/sites/site-1", route => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Entry demo", draft_document: draft, draft_version: version, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", route => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/guestbook**", route => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/sites/site-1/draft", route => {
    saves += 1; draft = route.request().postDataJSON().document;
    return route.fulfill({ json: { version: ++version, updatedAt: "2026-10-19T00:00:00Z" } });
  });
  await page.goto("/editor/site-1");
  await expect(page.locator(".m-toolbar")).toBeVisible();
  return { title: window.title, saves: () => saves };
}

const settingsButton = (page: Page) => page.locator(".m-toolbar").getByRole("button", { name: "視窗設定", exact: true });
const settings = (page: Page) => page.getByRole("dialog", { name: "視窗設定", exact: true });

test.use({ hasTouch: true });

for (const type of types) {
  test(`${type}: content and window settings have distinct names and preserve the current app`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const backend = await openEditor(page, type);
    await page.locator(".m-icon").tap();
    const content = page.locator(".m-edit-toggle");
    await expect(content).toHaveAccessibleName("編輯內容");
    await expect(content).toHaveAttribute("aria-pressed", "false");
    await settingsButton(page).tap();
    const back = settings(page).getByRole("button", { name: `返回「${backend.title}」內容`, exact: true });
    await expect(back).toBeVisible();
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await back.tap();
    await expect(settings(page)).toBeHidden();
    await expect(content).toBeFocused();
    await expect(content).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".m-win-body")).toBeVisible();
    await expect(page.locator(".m-icon")).toHaveAttribute("data-window-id", "current");
    await expect(page.locator(".m-icon")).toHaveCSS("outline-style", "dotted");
    expect(backend.saves()).toBe(0);
  });
}

for (const width of [320, 390, 430]) {
  test(`settings return preserves an unfinished content draft and scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await openEditor(page);
    await page.locator(".m-icon").tap();
    await page.getByRole("button", { name: "編輯內容", exact: true }).tap();
    const input = page.getByLabel("新增圖片網址", { exact: true });
    await input.fill("https://unfinished");
    const body = page.locator(".m-win-body");
    const scroll = await body.evaluate(element => { element.scrollTop = 180; return element.scrollTop; });
    expect(scroll).toBeGreaterThan(0);
    const node = await input.elementHandle();
    await settingsButton(page).tap();
    const back = settings(page).getByRole("button", { name: `返回「${backend.title}」內容`, exact: true });
    const panel = (await settings(page).boundingBox())!;
    expect((await back.boundingBox())!.y).toBeLessThan(panel.y + 110);
    await page.screenshot({ path: test.info().outputPath("window-settings-entry.png") });
    await back.tap();
    await expect(page.getByRole("button", { name: "完成", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveValue("https://unfinished");
    expect(await node!.evaluate(element => element.isConnected)).toBe(true);
    expect(await body.evaluate(element => element.scrollTop)).toBe(scroll);
    await expect(page.locator(".m-icon")).toHaveCSS("outline-style", "dotted");
    await page.waitForTimeout(750);
    expect(backend.saves()).toBe(0);
  });
}

test("settings without an open app explains how to reach content without inventing a return target", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const backend = await openEditor(page);
  await settingsButton(page).tap();
  await expect(settings(page).getByRole("button", { name: /返回.*內容/ })).toHaveCount(0);
  await expect(settings(page).getByText("先開啟視窗，再按「編輯內容」。", { exact: true })).toBeVisible();
  expect(backend.saves()).toBe(0);
});

test("settings with no selected window retains the selection hint", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const backend = await openEditor(page, "gallery", true);
  await settingsButton(page).tap();
  await expect(settings(page).getByRole("button", { name: /返回.*內容/ })).toHaveCount(0);
  await expect(settings(page).locator(".m-note")).toBeVisible();
  expect(backend.saves()).toBe(0);
});

test("settings return preserves the mounted IG editor and its unfinished Handle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await openEditor(page, "instagram");
  await page.locator(".m-icon").tap();
  await page.getByRole("button", { name: "編輯內容", exact: true }).tap();
  const handle = page.getByRole("textbox", { name: "Handle", exact: true });
  await handle.fill("");
  const node = await handle.elementHandle();
  await settingsButton(page).tap();
  await settings(page).getByRole("button", { name: `返回「${backend.title}」內容`, exact: true }).tap();
  await expect(page.getByRole("button", { name: "完成", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(handle).toHaveValue("");
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  await page.waitForTimeout(750);
  expect(backend.saves()).toBe(0);
});

test("English content and settings labels fit the 320px toolbar", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("retrodesk:locale", "en"));
  await page.setViewportSize({ width: 320, height: 844 });
  const backend = await openEditor(page);
  await page.locator(".m-icon").tap();
  await expect(page.locator(".m-edit-toggle")).toHaveAccessibleName("Edit content");
  const opener = page.locator(".m-toolbar").getByRole("button", { name: "Window settings", exact: true });
  expect((await opener.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await opener.evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
  await opener.tap();
  const dialog = page.getByRole("dialog", { name: "Window settings", exact: true });
  await dialog.getByRole("button", { name: `Return to ${backend.title} content`, exact: true }).tap();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".m-edit-toggle")).toBeFocused();
});
