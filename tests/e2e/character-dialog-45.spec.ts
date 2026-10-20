import { expect, test, type Page } from "@playwright/test";
import { makeWindow, type SiteDocument } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

function characterDocument(): SiteDocument {
  const character = makeWindow("character-dialog");
  character.id = "welcome";
  character.title = "Welcome.exe";
  character.defaultOpen = true;
  character.content = { ...character.content, characterName: "Snow", message: "Welcome", image: "https://images.example.test/portrait.png", imageUrl: "https://images.example.test/portrait.png", autoShow: true };
  character.layout.desktop = { ...character.layout.desktop, x: 40, y: 20, w: 420, h: 530, z: 2 };
  return { ...structuredClone(documentFixture), windows: [character] } as SiteDocument;
}

async function editor(page: Page) {
  const site = { id: "site-1", username: "demo", site_name: "Demo", draft_document: characterDocument(), draft_version: 1, published_document: null, published_version: null, published_at: null, updated_at: "2026-10-17T00:00:00.000Z", access_role: "owner" };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    site.draft_document = route.request().postDataJSON().document;
    site.draft_version++;
    return route.fulfill({ json: { version: site.draft_version, updatedAt: site.updated_at } });
  });
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.route("https://images.example.test/portrait.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm5+WQAAAABJRU5ErkJggg==", "base64") }));
  return site;
}

test("author removes a character image, undoes, then saves removal across reload", async ({ page }) => {
  const site = await editor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/editor/site-1");
  const dialog = page.getByRole("dialog", { name: "Welcome.exe" });
  await dialog.locator(".character-editor-preview > summary").click();
  await expect(dialog.locator(".character-dialog-image")).toBeVisible();
  await dialog.getByRole("button", { name: "移除角色圖片" }).click();
  await expect(dialog.locator(".character-dialog-image")).toHaveCount(0);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(dialog.locator(".character-dialog-image")).toBeVisible();
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect.poll(() => {
    const saved = site.draft_document.windows.find((window) => window.type === "character-dialog");
    return saved?.type === "character-dialog" ? { image: saved.content.image, imageUrl: saved.content.imageUrl, message: saved.content.message } : null;
  }).toEqual({ image: null, imageUrl: "", message: "Welcome" });
  await page.reload();
  await page.getByRole("dialog", { name: "Welcome.exe" }).locator(".character-editor-preview > summary").click();
  await expect(page.getByRole("dialog", { name: "Welcome.exe" }).locator(".character-dialog-placeholder")).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`auto-shown character restores focus on close and receives it again on reopen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: characterDocument(), published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
    const surface = page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop");
    await page.goto("/@demo");
    const dialog = surface.getByRole("dialog", { name: "Welcome.exe" });
    const icon = width < 768 ? surface.getByRole("button", { name: "Welcome.exe" }) : surface.locator(".visitor-icon", { hasText: "Welcome.exe" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await dialog.getByRole("button", { name: "關閉" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(icon).toBeFocused();
    await icon.click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  });
}

for (const width of [1280, 390]) {
  test(`duplicate-title character windows restore the exact opener at ${width}px`, async ({ page }) => {
    const first = makeWindow("character-dialog");
    const second = makeWindow("character-dialog", 1);
    first.id = "first";
    second.id = "second";
    first.title = second.title = "Welcome.exe";
    first.defaultOpen = second.defaultOpen = false;
    first.content.characterName = "First character";
    second.content.characterName = "Second character";
    first.content.autoShow = second.content.autoShow = false;
    const published = { ...structuredClone(documentFixture), windows: [first, second] } as SiteDocument;
    await page.setViewportSize({ width, height: 800 });
    await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
    const surface = page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop");
    await page.goto("/@demo");
    const icons = width < 768 ? surface.getByRole("button", { name: "Welcome.exe" }) : surface.locator(".visitor-icon", { hasText: "Welcome.exe" });
    const secondIcon = icons.nth(1);
    await secondIcon.click();
    const dialog = surface.getByRole("dialog", { name: "Welcome.exe" });
    await expect(dialog).toContainText("Second character");
    await dialog.getByRole("button", { name: "關閉" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(secondIcon).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toContainText("Second character");
  });
}

test("a deferred character focus frame respects a newer icon click and a closed dialog", async ({ page }) => {
  const character = makeWindow("character-dialog");
  const about = makeWindow("about");
  character.id = "welcome";
  character.title = "Welcome.exe";
  character.defaultOpen = false;
  character.content.autoShow = false;
  character.layout.desktop = { ...character.layout.desktop, iconX: 16, iconY: 20, x: 200, y: 40, w: 390, h: 400 };
  about.id = "other";
  about.title = "About.exe";
  about.defaultOpen = false;
  about.layout.desktop = { ...about.layout.desktop, iconX: 1100, iconY: 20, x: 650, y: 50, w: 340, h: 350 };
  const published = { ...structuredClone(documentFixture), windows: [character, about] } as SiteDocument;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.goto("/@demo");
  await page.evaluate(() => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 1;
    window.requestAnimationFrame = (callback) => { const id = next++; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { frames.delete(id); };
    Object.assign(window, { flushFocusFrames: () => { const queued = [...frames.values()]; frames.clear(); queued.forEach((callback) => callback(performance.now())); } });
  });
  const surface = page.locator(".visitor-desktop");
  const characterIcon = surface.locator(".visitor-icon", { hasText: "Welcome.exe" });
  const otherIcon = surface.locator(".visitor-icon", { hasText: "About.exe" });
  const flush = () => page.evaluate(() => (window as typeof window & { flushFocusFrames: () => void }).flushFocusFrames());
  await characterIcon.click();
  const dialog = surface.getByRole("dialog", { name: "Welcome.exe" });
  await expect(dialog).toBeVisible();
  await otherIcon.click();
  await expect(otherIcon).toBeFocused();
  await flush();
  await expect(otherIcon).toBeFocused();
  await dialog.getByRole("button", { name: "關閉" }).click();
  await otherIcon.click();
  await flush();
  await expect(otherIcon).toBeFocused();
  await characterIcon.click();
  await expect(dialog).toBeVisible();
  await flush();
  await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "關閉" }).click();
  await characterIcon.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "關閉" }).click(); // Unmount before its pending focus frame runs.
  await otherIcon.click();
  await flush();
  await expect(dialog).toHaveCount(0);
  await expect(otherIcon).toBeFocused();
});

test("auto-show focus frame does not re-raise the character after another title bar is pressed", async ({ page }) => {
  const character = makeWindow("character-dialog");
  const about = makeWindow("about");
  character.id = "welcome";
  character.title = "Welcome.exe";
  character.defaultOpen = false;
  character.content.autoShow = true;
  character.layout.desktop = { ...character.layout.desktop, x: 200, y: 40, w: 390, h: 400, z: 2 };
  about.id = "other";
  about.title = "About.exe";
  about.defaultOpen = true;
  about.layout.desktop = { ...about.layout.desktop, x: 650, y: 50, w: 340, h: 350, z: 1 };
  const published = { ...structuredClone(documentFixture), windows: [character, about] } as SiteDocument;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const frames = new Map<number, FrameRequestCallback>();
    let next = 1;
    window.requestAnimationFrame = (callback) => { const id = next++; frames.set(id, callback); return id; };
    window.cancelAnimationFrame = (id) => { frames.delete(id); };
    Object.assign(window, { flushFocusFrames: () => { const queued = [...frames.values()]; frames.clear(); queued.forEach((callback) => callback(performance.now())); } });
  });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: published, published_version: 1, published_at: "2026-10-17T00:00:00.000Z" } } }));
  await page.goto("/@demo");
  const surface = page.locator(".visitor-desktop");
  const welcome = surface.getByRole("dialog", { name: "Welcome.exe" });
  const other = surface.getByRole("dialog", { name: "About.exe" });
  await expect(welcome).toBeVisible();
  await expect(other).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await other.locator(".retro-titlebar").click();
  await expect.poll(() => other.evaluate((node) => Number(getComputedStyle(node.parentElement!).zIndex))).toBeGreaterThan(await welcome.evaluate((node) => Number(getComputedStyle(node.parentElement!).zIndex)));
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.evaluate(() => (window as typeof window & { flushFocusFrames: () => void }).flushFocusFrames());
  expect(await other.evaluate((node) => Number(getComputedStyle(node.parentElement!).zIndex))).toBeGreaterThan(await welcome.evaluate((node) => Number(getComputedStyle(node.parentElement!).zIndex)));
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});
