import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };

const svg = (w: number, h: number, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${color}"/><text x="20" y="60" font-size="48" fill="#fff">${w}x${h}</text></svg>`;

async function mockImages(page: Page) {
  await page.route("https://img.test/**", (route) => {
    const name = new URL(route.request().url()).pathname;
    if (name.includes("broken")) return route.fulfill({ status: 404, body: "nope" });
    const dims: Record<string, [number, number, string]> = { "/tall.svg": [400, 3000, "#2255aa"], "/wide.svg": [3000, 300, "#aa5522"], "/square.svg": [800, 800, "#22aa55"] };
    const [w, h, c] = dims[name] ?? [600, 400, "#555555"];
    return route.fulfill({ contentType: "image/svg+xml", body: svg(w, h, c) });
  });
}

type Img = { title: string; src: string | null; caption?: string };

function galleryDoc(images: Img[], extraWindows: ReturnType<typeof makeWindow>[] = []): SiteDocument {
  const gallery = makeWindow("gallery");
  if (gallery.type !== "gallery") throw new Error("gallery fixture mismatch");
  gallery.id = "gallery";
  gallery.title = "Gallery.exe";
  gallery.defaultOpen = true;
  gallery.layout.desktop = { ...gallery.layout.desktop, x: 120, y: 60, w: 420, h: 340, z: 1 };
  gallery.content.images = images.map((image, index) => ({ id: `image-${index}`, src: image.src, srcUrl: "", title: image.title, caption: image.caption ?? "", href: "" }));
  return { ...structuredClone(documentFixture), windows: [gallery, ...extraWindows] } as SiteDocument;
}

async function openPublic(page: Page, doc: SiteDocument, viewport: { width: number; height: number }) {
  await mockImages(page);
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: doc, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
  await page.setViewportSize(viewport);
  await page.goto("/@demo");
  if (viewport.width < 768) await page.locator(".visitor-mobile").getByRole("button", { name: "Gallery.exe" }).click();
  await expect(page.getByRole("dialog", { name: "Gallery.exe" })).toBeVisible();
}

const box = (page: Page, selector: string) => page.locator(selector).first().evaluate((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
async function expectCoversViewport(page: Page) {
  const vp = page.viewportSize()!;
  const b = await box(page, ".lb-root");
  expect(Math.round(b.x)).toBe(0);
  expect(Math.round(b.y)).toBe(0);
  expect(Math.round(b.w)).toBe(vp.width);
  expect(Math.round(b.h)).toBe(vp.height);
}
async function expectImageInsideStage(page: Page) {
  const stage = await box(page, ".lb-stage");
  const img = await box(page, ".lb-img");
  expect(img.x).toBeGreaterThanOrEqual(stage.x - 1);
  expect(img.y).toBeGreaterThanOrEqual(stage.y - 1);
  expect(img.x + img.w).toBeLessThanOrEqual(stage.x + stage.w + 1);
  expect(img.y + img.h).toBeLessThanOrEqual(stage.y + stage.h + 1);
}
const openFirst = async (page: Page, name = "放大 Tall") => {
  await page.getByRole("dialog", { name: "Gallery.exe" }).getByRole("button", { name }).click();
  await expect(page.getByRole("dialog", { name: "圖片檢視" })).toBeVisible();
};

const LONG_TITLE = "Long " + "title ".repeat(30).trim();
const LONG_CAPTION = ("caption " .repeat(120)).slice(0, 950);
const images: Img[] = [
  { title: "Tall", src: "https://img.test/tall.svg" },
  { title: "Wide", src: "https://img.test/wide.svg" },
  { title: "Broken", src: "https://img.test/broken.svg" },
  { title: LONG_TITLE, src: "https://img.test/square.svg", caption: LONG_CAPTION }
];

for (const viewport of [{ width: 1280, height: 540 }, { width: 1440, height: 1100 }, { width: 320, height: 640 }, { width: 430, height: 932 }]) {
  test(`lightbox is a full-viewport portal and fits tall/wide images at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openPublic(page, galleryDoc(images), viewport);
    await openFirst(page);
    await expectCoversViewport(page);
    expect(await page.locator(".lb-root").evaluate((node) => node.parentElement === document.body)).toBe(true);
    await expect(page.locator(".lb-img")).toBeVisible();
    await expectImageInsideStage(page);

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".lb-cap strong")).toHaveText("Wide");
    await expect(page.locator(".lb-img")).toBeVisible();
    await expectImageInsideStage(page);

    // the lightbox is the topmost thing at every corner and the centre
    for (const [fx, fy] of [[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98], [0.5, 0.5]]) {
      const inside = await page.evaluate(([x, y]) => !!document.elementFromPoint(innerWidth * x, innerHeight * y)?.closest(".lb-root"), [fx, fy]);
      expect(inside).toBe(true);
    }
  });
}

test("background is inert and unscrollable while open and restored on close", async ({ page }) => {
  await openPublic(page, galleryDoc(images), { width: 1280, height: 700 });
  const opener = page.getByRole("dialog", { name: "Gallery.exe" }).getByRole("button", { name: "放大 Tall" });
  await opener.click();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  await page.mouse.move(640, 350);
  await page.mouse.wheel(0, 800);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Tab never reaches the page behind
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".lb-root"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator(".lb-root")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  await expect.poll(() => opener.evaluate((node) => node === document.activeElement)).toBe(true);
});

test("clicking the dark backdrop closes; clicking the image does not", async ({ page }) => {
  await openPublic(page, galleryDoc(images), { width: 1280, height: 700 });
  await openFirst(page);
  await page.locator(".lb-img").click();
  await expect(page.locator(".lb-root")).toBeVisible();
  await page.mouse.click(8, 350);
  await expect(page.locator(".lb-root")).toHaveCount(0);
});

test("broken image explains itself and long titles scroll without pushing the controls off-screen", async ({ page }) => {
  await openPublic(page, galleryDoc(images), { width: 390, height: 700 });
  await openFirst(page, "放大 Broken");
  await expect(page.locator(".lb-root").getByRole("alert")).toContainText("圖片無法載入");
  await expectCoversViewport(page);
  await page.getByRole("button", { name: "下一張" }).click();
  await expect(page.locator(".lb-cap strong")).toHaveText(LONG_TITLE);
  const cap = await page.locator(".lb-cap").evaluate((node) => ({ scroll: node.scrollHeight, client: node.clientHeight, overflowY: getComputedStyle(node).overflowY }));
  expect(cap.scroll).toBeGreaterThan(cap.client);
  expect(cap.overflowY).toBe("auto");
  const foot = await box(page, ".lb-foot");
  expect(foot.y + foot.h).toBeLessThanOrEqual(700 + 1);
  await expect(page.getByRole("dialog", { name: "圖片檢視" }).getByRole("button", { name: "關閉" })).toBeInViewport();
  await expectImageInsideStage(page);
});

test("works after the gallery was scrolled and while its window is moved, resized and maximized", async ({ page }) => {
  const many = Array.from({ length: 24 }, (_, i) => ({ title: `Pic ${i}`, src: i % 2 ? "https://img.test/tall.svg" : "https://img.test/wide.svg" }));
  await openPublic(page, galleryDoc(many), { width: 1280, height: 720 });
  const win = page.getByRole("dialog", { name: "Gallery.exe" });
  // move the window by its title bar
  const title = await win.locator(".retro-titlebar").boundingBox();
  await page.mouse.move(title!.x + 80, title!.y + 10);
  await page.mouse.down();
  await page.mouse.move(title!.x + 380, title!.y + 70, { steps: 6 });
  await page.mouse.up();
  // resize from the grip
  const grip = await page.locator(".visitor-window").filter({ has: win }).locator(".window-resize-handle").boundingBox();
  await page.mouse.move(grip!.x + 8, grip!.y + 8);
  await page.mouse.down();
  await page.mouse.move(grip!.x + 108, grip!.y + 48, { steps: 6 });
  await page.mouse.up();
  // scroll the gallery content, then open a picture near the bottom
  await win.locator(".retro-window-body").evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await win.getByRole("button", { name: "放大 Pic 23" }).click();
  await expectCoversViewport(page);
  await expectImageInsideStage(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".lb-root")).toHaveCount(0);

  await win.getByRole("button", { name: "最大化" }).click();
  await win.getByRole("button", { name: "放大 Pic 22" }).first().click().catch(async () => { await win.locator(".gal-item").first().click(); });
  await expectCoversViewport(page);
  await expectImageInsideStage(page);
});

test("lightbox stays above other windows and the visitor preview overlay inside the editor", async ({ page }) => {
  const other = makeWindow("document");
  other.id = "doc";
  other.title = "Doc.exe";
  other.defaultOpen = true;
  other.layout.desktop = { ...other.layout.desktop, x: 200, y: 120, w: 500, h: 400, z: 9 };
  const doc = galleryDoc(images, [other]);
  doc.windows[0].layout.desktop.z = 20; // gallery on top so its thumbnails are clickable; the lightbox must still sit above everything
  const migrated = migrateSiteDocumentV2(doc, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("fixture");
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await mockImages(page);
  const site = { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: migrated.document as SiteDocumentV2Input, draft_version: 1, published_document: null, published_version: null, published_at: null, access_role: "owner" };
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => route.fulfill({ json: { version: 2, updatedAt: "2026-10-17T00:00:00Z" } }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site } }));
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: /訪客預覽/ }).click();
  const preview = page.getByRole("dialog", { name: "訪客預覽" });
  await expect(preview).toBeVisible();
  await preview.getByRole("dialog", { name: "Gallery.exe" }).getByRole("button", { name: "放大 Tall" }).click();
  await expectCoversViewport(page);
  const centreInside = await page.evaluate(() => !!document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest(".lb-root"));
  expect(centreInside).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".lb-root")).toHaveCount(0);
  await expect(preview).toBeVisible();
});

// ---- focus return after closing must never cover a window the user picked next ----
function overlappedDoc(): SiteDocument {
  const notes = makeWindow("document", 1);
  if (notes.type !== "document") throw new Error("document fixture mismatch");
  notes.id = "notes";
  notes.title = "Notes.txt";
  notes.defaultOpen = true;
  notes.layout.desktop = { ...notes.layout.desktop, x: 300, y: 100, w: 420, h: 300, z: 1 }; // centre is under the gallery, right side stays visible
  const doc = galleryDoc([{ title: "Tall", src: "https://img.test/tall.svg" }], [notes]);
  doc.windows[0].layout.desktop.z = 2;
  return doc;
}

const topmost = (page: Page, name: string) => page.getByRole("dialog", { name }).evaluate((win) => {
  const r = win.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && win.contains(hit);
});

async function closeLightboxAndWaitForUi(page: Page) {
  const lightbox = page.getByRole("dialog", { name: "圖片檢視" });
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0); // removed from the DOM, not merely hidden
  await expect(page.locator("#root")).not.toHaveAttribute("inert", ""); // explicit state: the page is interactive again
}

// A real pointer click on a part of `name` that is actually visible, at coordinates found from the page.
async function clickVisiblePart(page: Page, name: string) {
  const point = await page.getByRole("dialog", { name }).evaluate((win) => {
    const r = win.getBoundingClientRect();
    for (let y = r.top + 8; y < r.bottom - 8; y += 10) for (let x = r.right - 10; x > r.left + 10; x -= 10) {
      const hit = document.elementFromPoint(x, y);
      if (hit && win.contains(hit) && !hit.closest("button, input, a")) return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

const nextFrames = (page: Page, count = 2) => page.evaluate((n) => new Promise<void>((resolve) => { const step = (left: number) => left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)); step(n); }), count);

test("after the lightbox closes, an immediate ordinary click on another window keeps that window in front", async ({ page }) => {
  await openPublic(page, overlappedDoc(), { width: 1280, height: 800 });
  expect(await topmost(page, "Notes.txt")).toBe(false); // the gallery covers it at first
  await openFirst(page, "放大 Tall");
  await closeLightboxAndWaitForUi(page);
  await clickVisiblePart(page, "Notes.txt"); // no delay: as soon as the UI says the lightbox is gone
  await nextFrames(page, 3); // let every pending frame callback run, deterministically
  expect(await topmost(page, "Notes.txt")).toBe(true); // the click took effect and nothing covered it again
  expect(await topmost(page, "Gallery.exe")).toBe(false);
});

test("a slow frame cannot move focus back to the gallery after the user already chose another window", async ({ page }) => {
  // Hold animation-frame callbacks so the close handler's deferred focus runs only after the user's click.
  await page.addInitScript(() => {
    const w = window as unknown as { __hold: boolean; __held: FrameRequestCallback[]; __release: () => void };
    w.__hold = false; w.__held = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) => { if (w.__hold) { w.__held.push(callback); return 0; } return raf(callback); };
    w.__release = () => { w.__hold = false; const queued = w.__held.splice(0); queued.forEach((cb) => raf(cb)); };
  });
  await openPublic(page, overlappedDoc(), { width: 1280, height: 800 });
  await openFirst(page, "放大 Tall");
  await page.evaluate(() => { (window as unknown as { __hold: boolean }).__hold = true; });
  await closeLightboxAndWaitForUi(page);
  await clickVisiblePart(page, "Notes.txt");
  expect(await topmost(page, "Notes.txt")).toBe(true); // the click took effect
  await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
  await nextFrames(page, 3);
  expect(await topmost(page, "Notes.txt")).toBe(true); // and the late focus restore did not cover it again
  expect(await page.evaluate(() => !!document.activeElement?.closest(".gal-wrap"))).toBe(false);
});

test("with no other interaction, closing the lightbox still returns focus to the thumbnail that opened it", async ({ page }) => {
  await openPublic(page, overlappedDoc(), { width: 1280, height: 800 });
  const opener = page.getByRole("dialog", { name: "Gallery.exe" }).getByRole("button", { name: "放大 Tall" });
  await opener.click();
  await closeLightboxAndWaitForUi(page);
  await expect(opener).toBeFocused();
});
