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
