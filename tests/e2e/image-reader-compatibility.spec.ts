import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createStarterDocument, makeWindow, migrateSiteDocumentV2 } from "@retrodesk/shared";

async function fixture(page: Page) {
  const legacy = createStarterDocument("Image reader", "classic98", "card");
  legacy.windows[0].title = "About.exe";
  const image = makeWindow("image", legacy.windows.length); if (image.type !== "image") throw new Error("image fixture");
  image.title = "Portrait.png";
  image.content = { ...image.content, src: "https://images.example.test/portrait.png", alt: "Portrait with transparent background", caption: "Original artwork", crop: { x: 50, y: 50, zoom: 1 }, pixelated: true };
  legacy.windows.push(image);
  const migrated = migrateSiteDocumentV2(legacy, { siteId: "site-1" }); if (!migrated.ok || migrated.version !== 2) throw new Error("migration");
  let saved = migrated.document, advertisement: unknown = { appearanceP2: 1, imageWindow: 1 }, writes = 0;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://images.example.test/portrait.png", (route) => route.fulfill({ path: "tests/fixtures/image-w3a/transparent.png", contentType: "image/png" }));
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Image reader", draft_document: saved, draft_version: writes + 1, published_document: null, published_version: null, published_at: null, access_role: "owner", writeCompatibility: advertisement } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; writes++; return route.fulfill({ json: { version: writes + 1 } }); });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Image reader", published_document: saved, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  return { image, saved: () => saved, writes: () => writes, advertise: (value: unknown) => { advertisement = value; } };
}

for (const width of [1440, 390]) {
  test(`selecting an existing image keeps the editor reader usable at ${width}px without author controls`, async ({ page }) => {
    const site = await fixture(page), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 }); await page.goto("/editor/site-1");
    const surface = page.locator(width < 768 ? ".m-screen" : ".desktop-canvas");
    if (width < 768) await surface.getByRole("button", { name: "Portrait.png", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Portrait.png", exact: true });
    if (width >= 768) {
      await dialog.locator(".retro-titlebar").click();
      await expect(page.locator("#editor-right-panel").getByRole("textbox").first()).toHaveValue("Portrait.png");
    } else {
      await expect(dialog.locator(".m-window-settings")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "編輯內容", exact: true })).toHaveCount(0);
    }
    await expect(dialog.getByRole("img", { name: site.image.content.alt })).toBeVisible();
    await expect(dialog.locator("[data-frame='simple']")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /上傳|更換/ })).toHaveCount(0);
    expect(site.writes()).toBe(0); expect(errors).toEqual([]);
  });
  test(`existing image documents render through the central reader at ${width}px`, async ({ page }) => {
    const site = await fixture(page);
    await page.setViewportSize({ width, height: 900 }); await page.goto("/@demo");
    const surface = page.locator(width < 768 ? ".visitor-mobile" : ".visitor-desktop");
    if (width < 768) await surface.getByRole("button", { name: "Portrait.png", exact: true }).click();
    const dialog = surface.getByRole("dialog", { name: "Portrait.png", exact: true });
    await expect(dialog.getByRole("img", { name: site.image.content.alt })).toBeVisible();
    await expect(dialog.getByText("Original artwork", { exact: true })).toBeVisible();
    await expect(dialog.locator("[data-frame='simple']")).toBeVisible();
    expect(site.writes()).toBe(0);
  });
}

test("ordinary edits preserve the image and send independent transport contracts while creation is hidden", async ({ page }) => {
  const site = await fixture(page); let body: any;
  await page.route("**/api/sites/site-1/draft", async (route) => { body = route.request().postDataJSON(); await route.fallback(); });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await expect(page.locator(".add-card")).toHaveCount(11);
  await expect(page.locator("[data-appearance-p2-writer]")).toHaveCount(0);
  await page.getByRole("dialog", { name: "About.exe", exact: true }).locator(".retro-titlebar").click();
  await page.locator("#editor-right-panel").getByRole("textbox").first().fill("Edited about");
  await expect.poll(() => site.writes()).toBe(1);
  expect(body.clientImageWindowContract).toBe(1); expect(body.clientAppearanceContract).toBe(1);
  expect(body.document.windows.at(-1)).toEqual(site.image);
  expect(body.document).not.toHaveProperty("clientImageWindowContract");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Portrait.png", exact: true }).getByRole("img", { name: site.image.content.alt })).toBeVisible();
  expect(site.saved().windows.at(-1)).toEqual(site.image);
});

test("phone Add sheet excludes the registered reader and creates no image", async ({ page }) => {
  const site = await fixture(page);
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto("/editor/site-1");
  await page.getByRole("toolbar", { name: "手機編輯工具" }).getByRole("button", { name: "新增", exact: true }).click();
  await expect(page.locator(".m-sheet .m-add")).toHaveCount(11);
  await expect(page.locator(".m-sheet .m-add").filter({ hasText: "單張圖片" })).toHaveCount(0);
  expect(site.writes()).toBe(0);
});

test("neutral 426 recovery retains images and local edits, requires image advertisement, and never resumes this tab", async ({ page }) => {
  const site = await fixture(page); let attempts = 0;
  site.advertise({ appearanceP2: 1 });
  await page.route("**/api/sites/site-1/draft", (route) => { attempts++; return route.fulfill({ status: 426, json: { error: { code: "client_upgrade_required", message: "Update required" } } }); });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/editor/site-1");
  await page.getByRole("dialog", { name: "About.exe", exact: true }).locator(".retro-titlebar").click();
  const title = page.locator("#editor-right-panel").getByRole("textbox").first(); await title.fill("Local image draft");
  const recovery = page.getByRole("alertdialog", { name: "編輯器需要更新", exact: true }); await expect(recovery).toBeVisible();
  await recovery.getByRole("button", { name: "檢查更新後的伺服器", exact: true }).click();
  await expect(recovery.getByRole("link")).toHaveCount(0);
  await expect(recovery.getByRole("status")).toContainText("資料保留契約");
  const downloading = page.waitForEvent("download"); await recovery.getByRole("button", { name: "下載本機復原 JSON", exact: true }).click();
  const download = await downloading, backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.windows[0].title).toBe("Local image draft"); expect(backup.windows.at(-1)).toEqual(site.image);
  site.advertise({ appearanceP2: 1, imageWindow: 1 });
  await recovery.getByRole("button", { name: "檢查更新後的伺服器", exact: true }).click();
  await expect(recovery.getByRole("link")).toHaveAttribute("target", "_blank");
  await recovery.getByRole("button", { name: "繼續在本機編輯", exact: true }).click();
  await expect(title).toHaveValue("Local image draft"); await title.fill("Still local"); await page.waitForTimeout(1000);
  expect(attempts).toBe(1); expect(site.writes()).toBe(0);
  await expect(page.getByRole("button", { name: "發布", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重試儲存", exact: true })).toHaveCount(0);
});
