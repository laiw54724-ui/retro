import { expect, test, type Page } from "@playwright/test";
import { SiteDocumentSchema } from "../../packages/shared/src/site";
import { migrateSiteDocumentV2 } from "../../packages/shared/src/site-versioning";
import { documentFixture } from "./fixture";

function appearanceDocument() {
  const doc = SiteDocumentSchema.parse(structuredClone(documentFixture));
  doc.windows[0].appearance = { titleFrom: "#ffffff", titleTo: "#000000", titleGradient: false };
  doc.windows[1].appearance = { titleFrom: "#001144", titleTo: "#004444", titleGradient: true };
  return doc;
}

async function mockSite(page: Page, doc = appearanceDocument()) {
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  // Start with canonical v2 so a legitimate v1 migration autosave is not
  // mistaken for a write caused by previewing a theme.
  const migrated = migrateSiteDocumentV2(doc, { siteId: "site-1" });
  if (!migrated.ok) throw new Error("appearance fixture migration failed");
  let saved = migrated.document;
  let writes = 0;
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo Desk", draft_document: saved, draft_version: writes + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => {
    saved = route.request().postDataJSON().document;
    writes++;
    return route.fulfill({ json: { version: writes + 1, updatedAt: "2026-10-17T00:00:00Z" } });
  });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo Desk", published_document: saved, published_version: 1, published_at: "2026-10-17T00:00:00Z" } } }));
  return { saved: () => saved, writes: () => writes };
}

for (const width of [320, 375, 430]) {
  test(`public mobile title colors match stored window appearances at ${width}px`, async ({ page }, testInfo) => {
    await mockSite(page);
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    await page.getByRole("button", { name: "About.exe", exact: true }).click();
    const title = page.getByRole("dialog", { name: "About.exe" }).locator(".m-win-title");
    await expect(title).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(title).toHaveCSS("color", "rgb(0, 0, 0)");
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    await page.getByRole("button", { name: "Links.exe", exact: true }).click();
    const gradient = page.getByRole("dialog", { name: "Links.exe" }).locator(".m-win-title");
    await expect(gradient).toHaveCSS("background-image", "linear-gradient(90deg, rgb(0, 17, 68), rgb(0, 68, 68))");
    await expect(gradient).toHaveCSS("color", "rgb(255, 255, 255)");
    if (width === 375) await page.screenshot({ path: testInfo.outputPath("mobile-title.png") });
  });
}

test("desktop editor preview and public windows use the same active/inactive title colors", async ({ page }, testInfo) => {
  await mockSite(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const dialog = page.getByRole("dialog", { name: "About.exe" });
  await dialog.locator(".retro-titlebar").click();
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  const preview = page.getByLabel("標題列預覽", { exact: true });
  await expect(preview).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(preview).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(dialog.locator(".retro-titlebar")).toHaveCSS("color", "rgb(0, 0, 0)");
  await page.getByRole("button", { name: "未作用中", exact: true }).click();
  await expect(preview).toHaveCSS("background-image", "linear-gradient(90deg, rgb(128, 128, 128), rgb(223, 223, 223))");
  await page.getByRole("button", { name: "作用中", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("desktop-appearance.png") });
  await page.goto("/@demo");
  await expect(page.getByRole("dialog", { name: "About.exe" }).locator(".retro-titlebar")).toHaveCSS("color", "rgb(0, 0, 0)");
  await page.locator(".visitor-icon").filter({ hasText: "Links.exe" }).click();
  await expect(page.getByRole("dialog", { name: "Links.exe" }).locator(".retro-titlebar")).toHaveCSS("background-image", "linear-gradient(90deg, rgb(0, 17, 68), rgb(0, 68, 68))");
  await expect(page.getByRole("dialog", { name: "About.exe" }).locator(".retro-titlebar")).toHaveCSS("background-image", "linear-gradient(90deg, rgb(128, 128, 128), rgb(223, 223, 223))");
});

test("mobile theme changes stay in preview until applied and retain window overrides", async ({ page }, testInfo) => {
  const site = await mockSite(page);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "主題", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "主題", exact: true });
  await sheet.locator("summary").filter({ hasText: "更多主題設定" }).click();
  await sheet.getByRole("button", { name: "粉紅 98", exact: true }).click();
  await expect(page.locator(".m-titlebar")).toHaveCSS("background-image", "linear-gradient(90deg, rgb(194, 24, 91), rgb(244, 143, 177))");
  await sheet.getByRole("button", { name: "取消預覽", exact: true }).click();
  await expect(sheet.getByRole("button", { name: "套用至草稿", exact: true })).toBeDisabled();
  // Observe beyond the 650ms autosave debounce: preview/cancel must not write.
  await page.waitForTimeout(800);
  expect(site.writes()).toBe(0);
  await sheet.getByRole("button", { name: "粉紅 98", exact: true }).click();
  await sheet.locator(".editing-sheet-body").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath("mobile-theme-preview.png") });
  await sheet.getByRole("button", { name: "套用至草稿", exact: true }).click();
  await expect.poll(() => site.writes()).toBe(1);
  expect(site.saved().theme.id).toBe("pink98");
  expect(site.saved().windows[0].appearance).toEqual(appearanceDocument().windows[0].appearance);
  await sheet.getByRole("button", { name: "關閉", exact: true }).click();
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "About.exe" }).locator(".m-inline-titlebar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("mobile window appearance validates hex input, persists and resets to inheritance", async ({ page }, testInfo) => {
  const site = await mockSite(page);
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await page.getByRole("button", { name: "視窗設定", exact: true }).click();
  let sheet = page.getByRole("dialog", { name: "視窗設定", exact: true });
  await sheet.locator("summary").filter({ hasText: "更多視窗設定" }).click();
  await sheet.getByRole("textbox", { name: "標題起始色色碼", exact: true }).fill("#12");
  await expect(sheet.getByRole("textbox", { name: "標題起始色色碼", exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(site.writes()).toBe(0);
  await sheet.getByRole("textbox", { name: "標題起始色色碼", exact: true }).fill("#aabbcc");
  await expect(sheet.getByLabel("標題列預覽", { exact: true })).toHaveCSS("background-color", "rgb(170, 187, 204)");
  await expect.poll(() => site.saved().windows[0].appearance?.titleFrom).toBe("#aabbcc");
  await page.screenshot({ path: testInfo.outputPath("mobile-window-settings.png") });
  await page.reload();
  await page.getByRole("button", { name: "About.exe", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "About.exe" }).locator(".m-inline-titlebar")).toHaveCSS("background-color", "rgb(170, 187, 204)");
  await page.getByRole("button", { name: "視窗設定", exact: true }).click();
  sheet = page.getByRole("dialog", { name: "視窗設定", exact: true });
  await sheet.locator("summary").filter({ hasText: "更多視窗設定" }).click();
  await sheet.getByRole("button", { name: "恢復主題設定", exact: true }).click();
  await expect.poll(() => site.saved().windows[0].appearance).toBeUndefined();
  expect(site.saved().windows[1].appearance).toEqual(appearanceDocument().windows[1].appearance);
});

test("global title color edits keep accent and window overrides unchanged", async ({ page }) => {
  const site = await mockSite(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("tab", { name: "主題", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "工具面板" });
  await panel.getByRole("button", { name: "標題列配色", exact: true }).nth(2).click();
  await panel.getByRole("textbox", { name: "主題標題起始色色碼", exact: true }).fill("#112233");
  await panel.getByRole("button", { name: "套用至草稿", exact: true }).click();
  await expect.poll(() => site.writes()).toBe(1);
  expect(site.saved().theme.accent).toBe(documentFixture.theme.accent);
  expect(site.saved().theme.titleFrom).toBe("#112233");
  expect(site.saved().windows[0].appearance).toEqual(appearanceDocument().windows[0].appearance);
});

test("visitor preview renders the same custom title on desktop and phone without saving", async ({ page }) => {
  const site = await mockSite(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  await page.getByRole("button", { name: "▶ 訪客預覽", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "訪客預覽", exact: true });
  await expect(overlay.getByRole("dialog", { name: "About.exe" }).locator(".retro-titlebar")).toHaveCSS("color", "rgb(0, 0, 0)");
  await overlay.getByRole("button", { name: "手機版", exact: true }).click();
  await overlay.getByRole("button", { name: "About.exe", exact: true }).click();
  const title = overlay.getByRole("dialog", { name: "About.exe" }).locator(".m-win-title");
  await expect(title).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(title).toHaveCSS("color", "rgb(0, 0, 0)");
  await overlay.getByRole("button", { name: "‹ 回到編輯器", exact: true }).click();
  expect(site.writes()).toBe(0);
});
