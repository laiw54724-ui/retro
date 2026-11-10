import { expect, test, type Page } from "@playwright/test";
import { makeGalleryImage, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const ASSET = "retro-asset:11111111-1111-4111-8111-111111111111";
const CONTENT = "**/api/sites/site-1/assets/*/content";
const PNG = "tests/fixtures/image-w3a/wide.png";
const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

async function fixture(page: Page, type: "gallery" | "about", width = 1440) {
  const window = makeWindow(type);
  window.id = "photo";
  window.title = "Photo.exe";
  window.defaultOpen = true;
  window.layout.desktop = { ...window.layout.desktop, x: 10, y: 10, w: 430, h: 540 };
  if (window.type === "gallery") window.content.images = [makeGalleryImage({ id: "photo", title: "Saved photo", alt: "Saved photo", src: ASSET })];
  if (window.type === "about") { window.content.avatar = ASSET; window.content.nickname = "Synthetic profile"; }
  const migrated = migrateSiteDocumentV2({ ...structuredClone(documentFixture), windows: [window] }, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture migration failed");
  let hold = true;
  let requests = 0;
  let aborted = 0;
  const writes: string[] = [];
  await page.clock.install();
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: migrated.document, draft_version: 1, published_document: null, published_version: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    writes.push(route.request().postData() ?? "");
    return route.fulfill({ json: { version: writes.length + 1 } });
  });
  await page.route(CONTENT, async (route) => {
    requests++;
    // An intentionally unanswered request exercises the real fetch AbortSignal.
    if (!hold) await route.fulfill({ path: PNG, contentType: "image/png" });
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/content")) aborted++;
  });
  await page.setViewportSize({ width, height: 900 });
  const open = async () => {
    if (width < 768) await page.getByRole("button", { name: "Photo.exe", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Photo.exe", exact: true })).toBeVisible();
  };
  await page.goto("/editor/site-1");
  await open();
  await expect.poll(() => requests).toBe(1);
  return { writes, open, requests: () => requests, aborted: () => aborted, recover: () => { hold = false; },
    photo: page.getByRole("dialog", { name: "Photo.exe", exact: true }) };
}

for (const [type, width] of [["gallery", 1440], ["gallery", 320], ["about", 1440]] as const) {
  test(`${type} reports a stalled protected image and recovers after reload at ${width}px`, async ({ page }) => {
    const site = await fixture(page, type, width);
    await expect(site.photo.getByRole("alert")).toHaveCount(0);
    await page.clock.runFor(30_001);
    await expect(site.photo.getByRole("alert").first()).toContainText(type === "about" ? "頭像無法載入" : "無法載入");
    await expect.poll(site.aborted).toBe(1);
    await page.clock.runFor(30_001);
    expect(site.requests()).toBe(1); // No automatic retry storm.
    expect(site.writes).toHaveLength(0);
    if (width < 768) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    site.recover();
    await page.reload();
    await site.open();
    await expect.poll(site.requests).toBe(2);
    const image = site.photo.locator('img[src^="blob:"]').first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(site.photo.getByRole("alert")).toHaveCount(0);
    expect(site.writes).toHaveLength(0);
  });
}

test("SPA navigation cancels a stalled image and Back creates a fresh resolver", async ({ page }) => {
  const site = await fixture(page, "gallery");
  await page.locator('.editor-topbar a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(site.aborted).toBe(1);
  site.recover();
  await page.goBack();
  await site.open();
  await expect.poll(site.requests).toBe(2);
  await expect(site.photo.locator('img[src^="blob:"]').first()).toBeVisible();
  await expect(site.photo.getByRole("alert")).toHaveCount(0);
  expect(site.writes).toHaveLength(0);
});
