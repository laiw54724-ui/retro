import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { createStarterDocument, makeLink, makeWindow, migrateSiteDocumentV2, projectPublicSiteDocument, replaceAssetReferences, type SiteDocument, type SiteDocumentV2Input } from "@retrodesk/shared";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const ASSET = `retro-asset:${ASSET_ID}`;
const SOURCE = "https://images.example.test/transparent.png";
const FILE = "tests/fixtures/image-w3a/transparent.png";

async function fixture(page: Page, options: { legacy?: SiteDocument; advertisement?: unknown } = {}) {
  const legacy = options.legacy ?? createStarterDocument("Image authoring", "classic98", "card");
  if (!options.legacy) legacy.windows = [];
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" });
  if (!migrated.ok || migrated.version !== 2) throw new Error("fixture migration");
  let saved = migrated.document;
  const writes: Array<{ document: SiteDocumentV2Input; clientImageWindowContract: number; clientAppearanceContract: number; expectedVersion: number }> = [], uploads: string[] = [], privateReads: string[] = [];
  let pendingUpload: Route | null = null, holdUpload = false;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  // Mark a response only after the application's JSON consumer has completed.
  // The next task runs after the promise chain that could commit the late asset.
  await page.addInitScript(() => {
    const state = window as typeof window & { imageUploadResponsesConsumed: number };
    state.imageUploadResponsesConsumed = 0;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (String(args[0]).endsWith("/api/sites/site-1/assets") && args[1]?.method === "POST") {
        const json = response.json.bind(response);
        response.json = async () => {
          const value = await json();
          setTimeout(() => { state.imageUploadResponsesConsumed++; }, 0);
          return value;
        };
      }
      return response;
    };
  });
  await page.route("https://example.supabase.co/**", (route) => route.abort());
  await page.route("https://images.example.test/**", (route) => route.fulfill({ path: FILE, contentType: "image/png" }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Image authoring", draft_document: saved, draft_version: writes.length + 1, published_document: null, published_version: null, access_role: "owner", writeCompatibility: options.advertisement ?? { appearanceP2: 1, imageWindow: 1 } } } }));
  const completeUpload = (route: Route) => route.fulfill({ json: { asset: { id: ASSET_ID, url: ASSET, mimeType: "image/png", size: 100, kind: "image", name: "transparent" } } });
  await page.route("**/api/sites/site-1/assets", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { assets: [] } });
    uploads.push(route.request().method());
    if (holdUpload) { pendingUpload = route; return; }
    await completeUpload(route);
  });
  await page.route("**/api/sites/site-1/assets/*/content", (route) => { privateReads.push(route.request().url()); return route.fulfill({ path: FILE, contentType: "image/png" }); });
  await page.route("**/api/sites/site-1/draft", (route) => {
    const body = route.request().postDataJSON(); writes.push(body); saved = body.document;
    return route.fulfill({ json: { version: writes.length + 1 } });
  });
  await page.route("**/api/public/sites/demo", (route) => {
    const projection = projectPublicSiteDocument(saved, "site-1");
    if (!projection.ok) throw new Error("public fixture projection");
    // Simulate the existing publication asset-copy stage; this is not a live publish test.
    const published = replaceAssetReferences(projection.document, new Map([[ASSET_ID, SOURCE]]));
    return route.fulfill({ json: { site: { username: "demo", site_name: "Image authoring", published_document: published, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } });
  });
  return { saved: () => saved, writes, uploads, privateReads,
    holdUpload: () => { holdUpload = true; }, pending: () => pendingUpload !== null,
    completeUpload: async () => { if (!pendingUpload) throw new Error("missing pending upload"); await completeUpload(pendingUpload); }
  };
}

const imageEditor = (page: Page) => page.locator(".canvas-window:visible, .m-window:visible").getByRole("region", { name: "Image settings", exact: true });

function image(document: SiteDocumentV2Input) {
  const window = document.windows.find((item) => item.type === "image");
  if (window?.type !== "image") throw new Error("missing saved image");
  return window;
}

for (const width of [1440, 320, 390]) {
  test(`image focus is edited on the image and remains one Undo step at ${width}px`, async ({ page }, info) => {
    const site = await fixture(page);
    await page.setViewportSize({ width, height: 900 }); await page.goto("/editor/site-1");
    if (width < 500) {
      await page.getByRole("toolbar", { name: "Mobile editor tools" }).getByRole("button", { name: "Add", exact: true }).click();
      await page.locator(".m-sheet .m-add").filter({ hasText: "Upload an image or use an image link" }).click();
    } else {
      await page.locator(".add-card").filter({ hasText: "Upload an image or use an image link" }).click();
    }
    const editor = page.getByRole("region", { name: "Image settings", exact: true });
    await editor.getByLabel("Image URL", { exact: true }).fill(SOURCE);
    await editor.getByLabel("Image URL", { exact: true }).press("Enter");
    await editor.getByRole("radio", { name: "Cover", exact: true }).click();
    await editor.getByRole("toolbar", { name: "Image positioning tools" }).getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => site.saved().windows.find((item) => item.type === "image")?.content.crop?.zoom).toBe(1.2);
    await editor.getByRole("button", { name: "Placement", exact: true }).click();
    await editor.getByRole("button", { name: "Align left" }).click();
    await expect.poll(() => image(site.saved()).content.crop?.x).toBe(0);
    await editor.getByRole("button", { name: "Align horizontal center" }).click();
    await expect.poll(() => image(site.saved()).content.crop?.x).toBe(50);
    await editor.getByRole("button", { name: "Placement", exact: true }).click();
    await page.screenshot({ path: info.outputPath(`image-on-canvas-${width}.png`), fullPage: false });
    const stage = editor.locator("[data-testid='image-stage']");
    await stage.scrollIntoViewIfNeeded();
    const displayed = stage.locator("img");
    await expect.poll(() => displayed.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    const bounds = await displayed.boundingBox(); if (!bounds) throw new Error("image bounds");
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    const originalPosition = await displayed.evaluate((node) => node.style.left);
    await page.mouse.move(x + 14, y, { steps: 5 });
    await expect.poll(() => displayed.evaluate((node) => node.style.left)).not.toBe(originalPosition);
    expect(image(site.saved()).content.crop?.x).toBe(50);
    await page.mouse.up();
    await expect.poll(() => image(site.saved()).content.crop?.x).not.toBe(50);
    const dragged = image(site.saved()).content.crop?.x;
    expect(dragged).toBeGreaterThanOrEqual(0); expect(dragged).toBeLessThanOrEqual(100);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => image(site.saved()).content.crop?.x).toBe(50);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => image(site.saved()).content.crop?.x).toBe(dragged);
    const viewportWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(viewportWidth).toBeLessThanOrEqual(width);
  });
}

test("desktop Add → protected upload → Inspector → history/move → save/reload → projected public image", async ({ page }, info) => {
  const site = await fixture(page); const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await page.locator(".add-card").filter({ hasText: "Upload an image or use an image link" }).click();
  const panel = imageEditor(page);
  await page.locator("#editor-right-panel").getByLabel("Window title", { exact: true }).fill("OC.png");
  await panel.getByLabel("Upload image…", { exact: true }).setInputFiles(FILE);
  await expect.poll(() => site.uploads.length).toBe(1);
  await expect(panel.locator("img")).toHaveAttribute("src", /^blob:/);
  await panel.getByRole("textbox", { name: "Alt text", exact: true }).fill("Transparent OC portrait");
  await panel.getByLabel("Caption", { exact: true }).fill("Original art");
  await panel.getByRole("radio", { name: "Cover", exact: true }).click();
  const imageCanvas = panel.getByRole("group", { name: "Image canvas", exact: true });
  await expect.poll(() => site.saved().windows.find(w => w.type === "image")?.content.src).toBe(ASSET);
  await imageCanvas.focus(); for (let i=0;i<13;i++) await imageCanvas.press("ArrowLeft");
  await expect.poll(() => image(site.saved()).content.crop?.x).toBe(24);
  await panel.getByRole("button", { name: "Frame", exact: true }).click();
  const canvas = page.locator(".canvas-window");
  await expect(canvas.locator(".retro-titlebar")).toHaveCount(0);
  await expect(canvas.locator(".module-host")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(canvas.getByRole("img", { name: "Transparent OC portrait" })).toBeVisible();
  await panel.getByRole("checkbox", { name: "Decorative image", exact: true }).check();
  await expect(panel.getByRole("textbox", { name: "Alt text", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: "Decorative image", exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: "Decorative image", exact: true })).toBeChecked();
  await panel.getByRole("checkbox", { name: "Decorative image", exact: true }).uncheck();
  await expect.poll(() => site.saved().windows.find((w) => w.type === "image")?.content.src).toBe(ASSET);
  const startX = image(site.saved()).layout.desktop.x;
  await page.getByRole("button", { name: "Move image OC.png", exact: true }).press("ArrowRight");
  await expect.poll(() => image(site.saved()).layout.desktop.x).toBe(startX + 1);
  const handle = await page.getByRole("button", { name: "Move image OC.png", exact: true }).boundingBox();
  if (!handle) throw new Error("move handle bounds");
  const startY = image(site.saved()).layout.desktop.y;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 16, handle.y + handle.height / 2 + 8); await page.mouse.up();
  await expect.poll(() => image(site.saved()).layout.desktop).toMatchObject({ x: startX + 17, y: startY + 8 });
  expect(image(site.saved()).content).toMatchObject({ src: ASSET, srcUrl: "", frameMode: "none", alt: "Transparent OC portrait", crop: { x: 24, y: 50, zoom: 1 } });
  await page.screenshot({ path: info.outputPath("image-authoring-desktop.png"), fullPage: false });
  expect(site.writes.at(-1)).toMatchObject({ clientImageWindowContract: 1, clientAppearanceContract: 1 });
  expect(JSON.stringify(site.saved())).not.toContain("blob:");
  await page.reload();
  await expect(page.locator(".canvas-window").getByRole("img", { name: "Transparent OC portrait" })).toBeVisible();
  await expect(page.locator("[data-appearance-p2-writer]")).toHaveCount(0);
  const reads = site.privateReads.length;
  await page.goto("/@demo");
  await expect(page.locator(".visitor-window").getByRole("img", { name: "Transparent OC portrait" })).toBeVisible();
  await expect(page.locator(".visitor-window").getByText("Original art", { exact: true })).toBeVisible();
  expect(site.privateReads.length).toBe(reads); expect(errors).toEqual([]);
});

test("pending upload cannot overwrite a newer URL source", async ({ page }) => {
  const site = await fixture(page); site.holdUpload();
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await page.locator(".add-card").filter({ hasText: "Upload an image or use an image link" }).click();
  const panel = imageEditor(page);
  await panel.getByLabel("Upload image…", { exact: true }).setInputFiles(FILE);
  await expect.poll(site.pending).toBe(true);
  await panel.getByLabel("Image URL", { exact: true }).fill(SOURCE);
  await panel.getByLabel("Image URL", { exact: true }).press("Enter");
  await expect.poll(() => site.saved().windows.find((w) => w.type === "image")?.content.src).toBe(SOURCE);
  await site.completeUpload();
  await expect(panel.getByRole("status").filter({ hasText: "failed" })).toBeVisible();
  expect(image(site.saved()).content.src).toBe(SOURCE);
  expect(image(site.saved()).content.srcUrl).toBe(SOURCE);
});

test("JPEG source decodes through authoring, save/reload and the projected public reader", async ({ page }) => {
  const site = await fixture(page);
  // Encode a real local JPEG; no remote image or browser-specific screenshot fixture.
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 16;
    const context = canvas.getContext("2d")!; context.fillStyle = "#e02030"; context.fillRect(0, 0, 32, 16);
    return canvas.toDataURL("image/jpeg").split(",")[1];
  });
  const source = "https://images.example.test/portrait.jpg";
  await page.route(source, (route) => route.fulfill({ body: Buffer.from(encoded, "base64"), contentType: "image/jpeg" }));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await page.locator(".add-card").filter({ hasText: "Upload an image or use an image link" }).click();
  const panel = imageEditor(page);
  await panel.getByLabel("Image URL", { exact: true }).fill(source);
  await panel.getByLabel("Image URL", { exact: true }).press("Enter");
  await panel.getByRole("textbox", { name: "Alt text", exact: true }).fill("JPEG portrait");
  const portrait = () => page.locator(".canvas-window, .visitor-window").getByRole("img", { name: "JPEG portrait", exact: true });
  const decoded = async () => {
    await expect(portrait()).toBeVisible();
    await expect.poll(() => portrait().evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([32, 16]);
  };
  await decoded(); await expect.poll(() => site.saved().windows.find((window) => window.type === "image")?.content.src).toBe(source);
  await page.reload(); await decoded();
  await page.goto("/@demo"); await decoded();
  expect(site.uploads).toHaveLength(0);
});

test("local opt-in without the matching image API advertisement keeps creation and authoring hidden", async ({ page }) => {
  const legacy = createStarterDocument("Reader", "classic98", "card"), existing = makeWindow("image");
  legacy.windows = [existing];
  const site = await fixture(page, { legacy, advertisement: { appearanceP2: 1 } });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await expect(page.locator(".add-card")).toHaveCount(11);
  await expect(page.locator("#editor-right-panel [data-testid='image-reader-inspector']")).toBeVisible();
  await expect(page.locator("#editor-right-panel").getByLabel("Image URL", { exact: true })).toHaveCount(0);
  await expect(page.locator("#editor-right-panel").getByRole("button", { name: "Duplicate window", exact: true })).toBeDisabled();
  expect(site.writes).toHaveLength(0);
});

test("decorative outer host passes real clicks through in preview and public while editor selection still works", async ({ page }) => {
  const legacy = createStarterDocument("Collage", "classic98", "card");
  const links = makeWindow("links"), note = makeWindow("document"), art = makeWindow("image");
  if (links.type !== "links" || note.type !== "document" || art.type !== "image") throw new Error("fixture");
  links.title = "Links"; note.title = "Note"; art.title = "Decoration"; note.defaultOpen = false;
  links.content.links = [makeLink({ label: "Open note", target: "window", windowId: note.id })];
  art.content = { ...art.content, src: SOURCE, frameMode: "none", interactionMode: "decorative" };
  art.layout.desktop = { ...art.layout.desktop, ...links.layout.desktop, z: 5 };
  legacy.windows = [links, note, art];
  const site = await fixture(page, { legacy });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "Move image Decoration", exact: true }).focus();
  await expect(imageEditor(page).getByRole("checkbox", { name: "Decorative image", exact: true })).toBeChecked();
  await page.getByRole("button", { name: /Visitor preview/ }).click();
  async function pointerThrough() {
    const host = page.locator(`[data-visitor-window='${art.id}']`);
    await expect(host).toHaveCSS("pointer-events", "none"); await expect(host).toHaveAttribute("inert", "");
    await expect(host.locator(".retro-titlebar")).toHaveCount(0);
    const button = page.locator(`[data-visitor-window='${links.id}']`).getByRole("button", { name: "Open note", exact: true });
    const rect = await button.boundingBox(); if (!rect) throw new Error("link bounds");
    const over = await host.boundingBox(); if (!over) throw new Error("decoration bounds");
    expect(rect.x + rect.width / 2).toBeGreaterThan(over.x); expect(rect.y + rect.height / 2).toBeGreaterThan(over.y);
    expect(rect.x + rect.width / 2).toBeLessThan(over.x + over.width); expect(rect.y + rect.height / 2).toBeLessThan(over.y + over.height);
    await button.click(); await expect(page.locator(".visitor-desktop").getByRole("dialog", { name: "Note", exact: true })).toBeVisible();
    expect(await host.locator(":focus").count()).toBe(0);
  }
  await pointerThrough();
  const writes = site.writes.length;
  await page.goto("/@demo"); await pointerThrough(); expect(site.writes.length).toBe(writes);
});

for (const width of [320, 375, 430]) {
test(`phone ${width}px Add and inline authoring keep Back reachable after switching to frameless/decorative`, async ({ page }, info) => {
  const site = await fixture(page);
  await page.setViewportSize({ width, height: 900 }); await page.goto("/editor/site-1");
  await page.getByRole("toolbar", { name: "Mobile editor tools" }).getByRole("button", { name: "Add", exact: true }).click();
  await page.locator(".m-sheet .m-add").filter({ hasText: "Upload an image or use an image link" }).click();
  // Adding now opens content immediately; assert that contract before editing.
  if(await page.locator(".m-edit-toggle").count()) await expect(page.locator(".m-edit-toggle")).toHaveAttribute("aria-pressed", "true"); else await expect(page.locator(".m-window-settings")).toBeVisible();
  await page.getByLabel("Image URL", { exact: true }).fill(SOURCE); await page.getByLabel("Image URL", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await page.getByRole("checkbox", { name: "Decorative image", exact: true }).check();
  const help = page.getByRole("region", { name: "Image settings", exact: true }).getByText("Visitors cannot click decorative images", { exact: false });
  const contrast = await help.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = (color: number[]) => color.slice(0, 3).map((value) => {
      const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    let parent: Element | null = element;
    while (parent) {
      const background = rgb(getComputedStyle(parent).backgroundColor);
      if (background.length === 3 || background[3] === 1) {
        const pair = [luminance(rgb(getComputedStyle(element).color)), luminance(background)].sort((a, b) => a - b);
        return (pair[1] + 0.05) / (pair[0] + 0.05);
      }
      parent = parent.parentElement;
    }
    throw new Error("No opaque editor background");
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: info.outputPath(`image-authoring-${width}.png`), fullPage: false });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".m-screen [data-image-shell='none']")).toBeVisible();
  await page.getByRole("button", { name: "‹ Desktop", exact: true }).click();
  await expect(page.locator(".m-icon")).toBeFocused();
  await expect.poll(() => site.saved().windows.find((w) => w.type === "image")?.content).toMatchObject({ src: SOURCE, frameMode: "none", interactionMode: "decorative" });
  await page.reload(); await page.locator(".m-icon").click();
  await expect(page.locator(".m-screen [data-image-shell='none'] img")).toBeVisible();
  await page.getByRole("button", { name: "‹ Desktop", exact: true }).click();
});

}

for (const edited of [true, false]) {
  test(`delayed upload from an existing URL ${edited ? "preserves newer uncommitted URL input" : "commits when source input is untouched"}`, async ({ page }) => {
    const legacy = createStarterDocument("Existing URL", "classic98", "card"), existing = makeWindow("image");
    if (existing.type !== "image") throw new Error("fixture");
    existing.content.src = SOURCE; existing.content.srcUrl = SOURCE; legacy.windows = [existing];
    const site = await fixture(page, { legacy }); site.holdUpload();
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
    const panel = imageEditor(page), url = panel.getByRole("textbox", { name: "Image URL", exact: true });
    await panel.getByLabel("Replace image…", { exact: true }).setInputFiles(FILE);
    await expect.poll(site.pending).toBe(true);
    await panel.getByRole("button", { name: "Image source", exact: true }).click();
    const next = "https://images.example.test/newer.png";
    if (edited) await url.fill(next); // Keep focus: no blur/Enter persistence yet.
    await site.completeUpload();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { imageUploadResponsesConsumed: number }).imageUploadResponsesConsumed)).toBe(1);
    if (edited) {
      await expect(url).toHaveValue(next);
      await expect(url).toBeFocused();
      expect(image(site.saved()).content).toMatchObject({ src: SOURCE, srcUrl: SOURCE });
      await expect(panel.locator('[data-upload-state="failed"]')).toHaveCount(1);
      await url.press("Enter");
      await expect.poll(() => image(site.saved()).content).toMatchObject({ src: next, srcUrl: next });
    } else {
      await expect(url).toHaveValue("");
      await expect(panel.locator('[data-upload-state="completed"]')).toHaveCount(1);
      await expect.poll(() => image(site.saved()).content).toMatchObject({ src: ASSET, srcUrl: "" });
    }
  });
}

test("shell Edit content opens the inline Image canvas while its sidebar stays collapsed", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "Add component", exact: true }).click();
  await page.getByRole("dialog", { name: "Add component", exact: true }).getByRole("button", { name: /Upload an image or use an image link/ }).click();
  await page.getByRole("button", { name: "Collapse Right properties panel", exact: true }).click();
  await page.getByRole("toolbar", { name: "Selected component actions" }).getByRole("button", { name: "Edit content", exact: true }).click();
  await expect(imageEditor(page).getByLabel("Image URL", { exact: true })).toBeVisible();
});

test("shell Image content entry stays disabled without the compatible writer", async ({ page }) => {
  const legacy = createStarterDocument("Reader", "classic98", "card");
  legacy.windows = [makeWindow("image")];
  await fixture(page, { legacy, advertisement: { appearanceP2: 1 } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await expect(page.getByRole("toolbar", { name: "Selected component actions" }).getByRole("button", { name: "Edit content", exact: true })).toBeDisabled();
});

for (const action of ["Control+z", "Meta+z", "Control+Shift+z", "Escape", "document", "selection", "pointercancel"]) test(`crop drag is invalidated by ${action} without a stale release commit`, async ({ page }) => {
  const site = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto("/editor/site-1");
  await page.locator(".add-card").filter({ hasText: "Upload an image or use an image link" }).click();
  const editor = page.getByRole("region", { name: "Image settings", exact: true });
  await editor.getByLabel("Image URL", { exact: true }).fill(SOURCE);
  await editor.getByLabel("Image URL", { exact: true }).press("Enter");
  await editor.getByRole("radio", { name: "Cover", exact: true }).click();
  await editor.getByRole("button", { name: "Zoom in", exact: true }).click();
  await editor.getByRole("button", { name: "Placement", exact: true }).click();
  await editor.getByRole("button", { name: "Align left", exact: true }).click();
  await editor.getByRole("button", { name: "Placement", exact: true }).click();
  if (action === "Control+Shift+z") await page.keyboard.press("Control+z");
  const read = () => page.evaluate(async () => { const { useEditorStore } = await import("/src/features/editor/store.ts"); const s=useEditorStore.getState(); return s.document?.windows.find(w=>w.type==="image")?.content.crop; });
  await expect.poll(async () => (await read())?.x).toBe(action === "Control+Shift+z" ? 50 : 0);
  const displayed = editor.locator("[data-testid='image-stage'] img");
  await expect.poll(() => displayed.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  const stage = editor.locator("[data-testid='image-stage']");
  await stage.scrollIntoViewIfNeeded();
  const b = await stage.boundingBox(); if (!b) throw new Error("stage bounds");
  const before = await displayed.evaluate(node => node.style.left);
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down();
  await page.mouse.move(b.x+b.width/2-14,b.y+b.height/2,{steps:4});
  await expect.poll(() => displayed.evaluate(node => node.style.left)).not.toBe(before);
  if (action === "document") await page.evaluate(async () => { const {useEditorStore}=await import("/src/features/editor/store.ts");useEditorStore.getState().setSiteName("Changed while dragging"); });
  else if (action === "selection") await page.evaluate(async () => { const {useEditorStore}=await import("/src/features/editor/store.ts");useEditorStore.getState().select(null); });
  else if (action === "pointercancel") await displayed.dispatchEvent("pointercancel", {pointerId:1,bubbles:true});
  else await page.keyboard.press(action);
  const undone = await read();
  const historyBeforeRelease = await page.evaluate(async () => { const {useEditorStore}=await import("/src/features/editor/store.ts"); const s=useEditorStore.getState(); return {document:s.versionedDocument,past:s.past.length,future:s.future.length}; });
  await page.mouse.up();
  expect(await page.evaluate(async () => { const {useEditorStore}=await import("/src/features/editor/store.ts"); const s=useEditorStore.getState(); return {document:s.versionedDocument,past:s.past.length,future:s.future.length}; })).toEqual(historyBeforeRelease);
  const released = await read();
  expect(released).toEqual(undone);
});

test("image on-canvas actions meet the 44px mobile target", async ({ page }, info) => {
  await fixture(page);
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto("/editor/site-1");
  await page.getByRole("toolbar", { name: "Mobile editor tools" }).getByRole("button", { name: "Add", exact: true }).click();
  await page.locator(".m-sheet .m-add").filter({ hasText: "Upload an image or use an image link" }).click();
  const editor = page.getByRole("region", { name: "Image settings", exact: true });
  await editor.getByLabel("Image URL", { exact: true }).fill(SOURCE);
  await editor.getByLabel("Image URL", { exact: true }).press("Enter");
  const toolbar = editor.getByRole("toolbar", { name: "Image positioning tools" });
  await toolbar.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("image-tools-320.png") });
  const sizes = await toolbar.locator("button").evaluateAll(nodes => nodes.map(node => ({ name: node.getAttribute("aria-label"), w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  expect(sizes.length).toBeGreaterThanOrEqual(8);
  expect(sizes.every(size => size.w >= 44 && size.h >= 44)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("v2 image canvas replaces old forms with direct fit, keyboard, wheel and inline appearance controls", async ({ page }, info) => {
  const site = await fixture(page);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor/site-1');
  await page.locator('.add-card').filter({ hasText: 'Upload an image or use an image link' }).click();
  const editor = page.getByRole('region', { name: 'Image settings', exact: true });
  await editor.getByLabel('Image URL', { exact: true }).fill(SOURCE); await editor.getByLabel('Image URL', { exact: true }).press('Enter');
  await expect.poll(() => site.saved().windows.find(w => w.type === 'image')?.content.src).toBe(SOURCE);
  await expect(editor.locator('fieldset, input[type=range], select')).toHaveCount(0);
  await editor.getByRole('radio', { name: 'Cover', exact: true }).click();
  const stage = editor.getByRole('group', { name: 'Image canvas', exact: true });
  await expect(stage.locator('img')).toBeVisible();
  await stage.focus(); await stage.press('Shift+ArrowLeft');
  await expect.poll(() => image(site.saved()).content.crop?.x).toBe(40);
  await stage.press('+'); await expect.poll(() => image(site.saved()).content.crop?.zoom).toBe(1.1);
  await stage.hover(); await page.mouse.wheel(0, -50); await expect.poll(() => image(site.saved()).content.crop?.zoom).toBe(1.2);
  await stage.dblclick(); await expect.poll(() => image(site.saved()).content.crop).toBeUndefined();
  await editor.getByRole('radio', { name: 'Original size', exact: true }).click();
  await expect.poll(() => image(site.saved()).content.fit).toBe('original');
  await editor.getByRole('button', { name: 'White background', exact: true }).click();
  await expect.poll(() => image(site.saved()).content.background).toEqual({color:'#ffffff'});
  await editor.getByRole('checkbox', { name: 'Decorative image', exact: true }).check();
  await expect(editor.getByLabel('Alt text', { exact: true })).toBeDisabled();
  await editor.getByRole('checkbox', { name: 'Decorative image', exact: true }).uncheck();
  await expect(editor.getByLabel('Alt text', { exact: true })).toBeEnabled();
  await page.screenshot({path:info.outputPath('image-v2-desktop.png')});
});

test('v2 desktop editor lives inside the image window and accepts paste/drop from its bottom tools',async({page},info)=>{
 const legacy=createStarterDocument('Canvas entry','classic98','blank'),art=makeWindow('image');
 if(art.type!=='image')throw Error('fixture');art.content.src=SOURCE;art.content.srcUrl=SOURCE;art.content.alt='Keep this description';art.layout.desktop={...art.layout.desktop,x:20,y:20,w:560,h:520};legacy.windows=[art];
 const site=await fixture(page,{legacy});await page.setViewportSize({width:1440,height:1000});await page.goto('/editor/site-1');
 const editor=imageEditor(page);await expect(editor).toBeVisible();await expect(page.locator('#editor-right-panel').getByRole('region',{name:'Image settings',exact:true})).toHaveCount(0);
 expect(await editor.evaluate(node=>!!node.closest('.canvas-window'))).toBe(true);
 const tools=editor.getByRole('toolbar',{name:'Image positioning tools',exact:true});const button=tools.getByRole('button',{name:'Frame',exact:true});await button.focus();
 await button.evaluate((node,bytes)=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'pasted.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},Array.from(readFileSync(FILE)));
 await expect.poll(()=>site.uploads.length).toBe(1);await expect.poll(()=>image(site.saved()).content.src).toBe(ASSET);
 await tools.dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'dropped.png',{type:'image/png'}));return dt;},Array.from(readFileSync(FILE)))});
 await expect.poll(()=>site.uploads.length).toBe(2);expect(image(site.saved()).content.alt).toBe('Keep this description');
 await page.screenshot({path:info.outputPath('image-v2-real-canvas.png')});
});

test('v2 first crop drag can focus a background image without invalidating its own gesture',async({page})=>{
 const legacy=createStarterDocument('Background crop','classic98','blank'),art=makeWindow('image'),note=makeWindow('document');if(art.type!=='image')throw Error('fixture');
 art.content={...art.content,src:SOURCE,srcUrl:SOURCE,alt:'Portrait',fit:'cover',crop:{x:50,y:50,zoom:1.2}};art.layout.desktop={...art.layout.desktop,x:20,y:20,w:560,h:520,z:1};note.layout.desktop={...note.layout.desktop,x:650,y:20,w:300,h:200,z:2};legacy.windows=[art,note];
 const site=await fixture(page,{legacy});await page.setViewportSize({width:1440,height:1000});await page.goto('/editor/site-1');const stage=imageEditor(page).locator('[data-testid=image-stage]'),img=stage.locator('img');await expect.poll(()=>img.evaluate((node:HTMLImageElement)=>node.naturalWidth)).toBeGreaterThan(0);const box=await stage.boundingBox();
 await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2-16,box!.y+box!.height/2,{steps:4});await page.mouse.up();await expect.poll(()=>image(site.saved()).content.crop?.x).not.toBe(50);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>image(site.saved()).content.crop?.x).toBe(50);expect(site.saved().windows.find(w=>w.id===note.id)?.content).toEqual(note.content);
});
