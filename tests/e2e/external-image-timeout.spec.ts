import { expect, test, type Page } from "@playwright/test";
import { makeGalleryImage, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const ASSET = "https://images.example.test/photo.png";
const CONTENT = "https://images.example.test/photo.png";
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
  const held: import("@playwright/test").Route[] = [];
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
    // Native image loads can remain pending without firing onError.
    if (hold) held.push(route);
    else await route.fulfill({ path: PNG, contentType: "image/png" });
  });
  await page.setViewportSize({ width, height: 900 });
  const open = async () => {
    if (width < 768) await page.getByRole("button", { name: "Photo.exe", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Photo.exe", exact: true })).toBeVisible();
  };
  await page.goto("/editor/site-1");
  await open();
  await expect.poll(() => requests).toBe(1);
  return { writes, open, requests: () => requests, releaseHeld: () => Promise.all(held.map((route) => route.fulfill({ path: PNG, contentType: "image/png" }).catch(() => {}))), recover: () => { hold = false; },
    photo: page.getByRole("dialog", { name: "Photo.exe", exact: true }) };
}

for (const [type, width] of [["gallery", 1440], ["gallery", 320], ["about", 1440]] as const) {
  test(`${type} reports a stalled external image and recovers after reload at ${width}px`, async ({ page }) => {
    const site = await fixture(page, type, width);
    await expect(site.photo.getByRole("alert")).toHaveCount(0);
    await page.clock.runFor(30_001);
    await expect(site.photo.getByRole("alert").first()).toContainText(type === "about" ? "頭像無法載入" : "無法載入");

    await page.clock.runFor(30_001);
    expect(site.requests()).toBe(1); // No automatic retry storm.
    expect(site.writes).toHaveLength(0);
    if (width < 768) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    site.recover();
    await page.reload();
    await site.open();
    await expect.poll(site.requests).toBe(2);
    const image = site.photo.locator('img[src^="https://images.example.test/"]').first();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(site.photo.getByRole("alert")).toHaveCount(0);
    expect(site.writes).toHaveLength(0);
  });
}

test("SPA navigation clears a stalled image deadline and Back can recover", async ({ page }) => {
  const site = await fixture(page, "gallery");
  await page.locator('.editor-topbar a[href="/"]').click();
  await expect(page).toHaveURL(/\/$/);

  site.recover();
  await page.goBack();
  await site.open();
  await site.releaseHeld();
  await expect(site.photo.locator('img[src^="https://images.example.test/"]').first()).toBeVisible();
  await page.clock.runFor(60_001);
  await expect.poll(() => site.photo.locator("img").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(site.photo.getByRole("alert")).toHaveCount(0);
  expect(site.writes).toHaveLength(0);
});

// Exercise shared component lifetimes directly, in the same browser/Vite runtime.
async function imageHarness(page: Page) {
  await page.clock.install();
  await page.route("https://images.example.test/**", () => {});
  await page.goto("/");
  await page.evaluate(async () => {
    const OriginalObserver = window.IntersectionObserver;
    (window as any).visibleSources = [];
    window.IntersectionObserver = class extends OriginalObserver {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super((entries, observer) => {
          for (const entry of entries) if (entry.isIntersecting) (window as any).visibleSources.push((entry.target as HTMLImageElement).src);
          callback(entries, observer);
        }, options);
      }
    };
    document.documentElement.style.cssText = "height:auto;overflow:auto";
    document.body.style.cssText = "height:auto;overflow:auto;margin:0";
    const reactPath = "/node_modules/.vite/deps/react.js";
    const domPath = "/node_modules/.vite/deps/react-dom_client.js";
    const componentPath = "/src/features/modules/ui.tsx";
    const { default: React } = await import(reactPath);
    const { default: { createRoot } } = await import(domPath);
    const { SafeImg } = await import(componentPath);
    const host = document.createElement("div");
    host.id = "image-harness";
    host.style.display = "flow-root";
    document.body.replaceChildren(host);
    const root = createRoot(host);
    (window as any).showImage = (source: string, top = 0) => root.render(React.createElement(SafeImg, {
      src: source, alt: "Harness photo", style: { display: "block", width: 100, height: 100, marginTop: top },
    }));
  });
  return page.locator("#image-harness");
}

test("offscreen lazy images receive a full deadline only when visible", async ({ page }) => {
  const host = await imageHarness(page);
  await page.evaluate(() => (window as any).showImage("https://images.example.test/offscreen.png", 10000));
  await expect(host.locator("img")).toHaveCount(1);
  await page.clock.runFor(60_001);
  await expect(host.getByRole("alert")).toHaveCount(0);
  await host.locator("img").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).visibleSources.length)).toBe(1);
  await expect(host.getByRole("alert")).toHaveCount(0);
  await page.clock.runFor(30_001);
  await expect(host.getByRole("alert")).toBeVisible();
});

test("A to B to A resets failure and ignores the previous image deadline", async ({ page }) => {
  const host = await imageHarness(page);
  const show = async (name: string) => {
    await page.evaluate((name) => {
      (window as any).visibleSources = [];
      (window as any).showImage(`https://images.example.test/${name}.png`);
    }, name);
    await expect.poll(() => page.evaluate(() => (window as any).visibleSources.length)).toBe(1);
  };
  await show("a");
  await expect(host.locator("img")).toBeVisible();
  await page.clock.runFor(31_000);
  await expect(host.getByRole("alert")).toBeVisible();
  await show("b");
  await expect(host.locator("img")).toHaveAttribute("src", /b.png$/);
  await page.clock.runFor(20_000);
  await show("a");
  await expect(host.locator("img")).toHaveAttribute("src", /a.png$/);
  await page.clock.runFor(15_000);
  await expect(host.getByRole("alert")).toHaveCount(0);
  await page.clock.runFor(16_000);
  await expect(host.getByRole("alert")).toBeVisible();
});

test("success clears its deadline and stays visible", async ({ page }) => {
  const host = await imageHarness(page);
  await page.route("https://images.example.test/loaded.png", (route) => route.fulfill({ path: PNG, contentType: "image/png" }));
  await page.evaluate(() => (window as any).showImage("https://images.example.test/loaded.png"));
  await expect.poll(() => host.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.clock.runFor(60_001);
  await expect(host.locator("img")).toBeVisible();
  await expect(host.getByRole("alert")).toHaveCount(0);
});
