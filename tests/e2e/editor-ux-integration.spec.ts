import { expect, test, type Page } from "@playwright/test";
import { makeWindow, migrateSiteDocumentV2, type SiteDocumentV2Input } from "@retrodesk/shared";
import { documentFixture } from "./fixture";

const SOURCE = "https://images.example.test/combined.png";
async function fixture(page: Page, width: number) {
  const win = makeWindow("about"); win.id = "about"; win.title = "About.exe";
  win.layout.desktop = { ...win.layout.desktop, x: 10, y: 10, w: 500, h: 650 };
  const migration = migrateSiteDocumentV2({ ...structuredClone(documentFixture), windows: [win] }, { siteId: "a" });
  if (!migration.ok) throw new Error("integration fixture migration");
  const docs: Record<string, SiteDocumentV2Input> = { a: migration.document, b: { ...structuredClone(migration.document), siteName: "Beta Desk" } };
  const versions: Record<string, number> = { a: 1, b: 50 };
  const saves: Array<{ id: string; document: SiteDocumentV2Input }> = [];
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("https://images.example.test/**", (route) => route.fulfill({ path: "tests/fixtures/image-w3a/wide.png", contentType: "image/png" }));
  await page.route("**/api/sites**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sites") return route.fulfill({ json: { sites: ["a", "b"].map((id) => ({ id, username: id, site_name: docs[id].siteName, draft_version: versions[id], published_version: null, access_role: "owner", updated_at: "2026-10-19T00:00:00Z" })) } });
    const id = path.split("/")[3];
    if (!docs[id]) return route.fulfill({ status: 404, json: { error: { code: "not_found" } } });
    if (path.endsWith("/assets")) return route.fulfill({ json: { assets: [] } });
    if (path.endsWith("/draft")) {
      const payload = route.request().postDataJSON();
      docs[id] = payload.document; saves.push({ id, document: payload.document });
      return route.fulfill({ json: { version: ++versions[id] } });
    }
    return route.fulfill({ json: { site: { id, username: id, site_name: docs[id].siteName, draft_document: docs[id], draft_version: versions[id], published_document: null, published_version: null, access_role: "owner" } } });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/auth"); await page.locator('a[href="/editor/a"]').click();
  await expect(page.locator(".editor-topbar")).toBeVisible();
  return { docs, saves };
}
async function openTheme(page: Page, width: number) {
  if (width < 768) { await page.getByRole("button", { name: "主題", exact: true }).click(); return page.getByRole("dialog", { name: "主題", exact: true }); }
  await page.getByRole("tab", { name: "主題", exact: true }).click(); return page.locator(".left-panel2");
}
for (const width of [320, 390, 1440]) test(`pending image theme guards Stay and explicit Back discard at ${width}px`, async ({ page }, testInfo) => {
  const state = await fixture(page, width);
  const panel = await openTheme(page, width);
  const input = panel.getByRole("textbox", { name: "圖片連結", exact: true });
  await input.fill(SOURCE); await input.press("Enter");
  const canvas = page.locator(width < 768 ? ".m-screen:visible" : ".desktop-canvas");
  await expect(canvas).toHaveCSS("background-image", `url("${SOURCE}")`);
  if (width < 768) await panel.getByRole("button", { name: "關閉", exact: true }).click();
  await page.locator(".editor-topbar .brand").click();
  const prompt = page.getByRole("dialog", { name: "離開編輯器？", exact: true });
  await expect(prompt).toBeVisible();
  expect(state.saves).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath(`preview-leave-${width}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await prompt.getByRole("button", { name: "保留並繼續編輯", exact: true }).click();
  await expect(canvas).toHaveCSS("background-image", `url("${SOURCE}")`);
  await expect(page.locator(".theme-preview-notice")).toBeVisible();
  await page.goBack(); await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "仍要離開", exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.locator('a[href="/editor/b"]').click();
  await expect(page.locator(".editor-topbar")).toBeVisible();
  await expect(page.locator(".theme-preview-notice")).toHaveCount(0);
  await expect(canvas).not.toHaveCSS("background-image", `url("${SOURCE}")`);
  expect(state.saves).toHaveLength(0);
  expect(state.docs.a.theme.wallImage).not.toBe(SOURCE);
});

test("blank geometry draft and theme Apply preserve canonical width then one Undo restores committed width", async ({ page }) => {
  const state = await fixture(page, 1440);
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  const width = page.locator("#editor-right-panel").getByLabel("寬", { exact: true });
  await width.fill(""); await expect(width).toHaveValue("");
  const panel = await openTheme(page, 1440);
  await expect(width).toHaveValue("500"); // Leaving an invalid numeric buffer restores the applied value.
  await panel.getByRole("button", { name: "粉紅 98", exact: true }).click();
  await panel.getByRole("button", { name: "套用至草稿", exact: true }).click();
  await expect.poll(() => state.docs.a.theme.id).toBe("pink98");
  expect(state.docs.a.windows[0].layout.desktop.w).toBe(500);
  await width.fill("430"); await width.press("Enter");
  await expect.poll(() => state.docs.a.windows[0].layout.desktop.w).toBe(430);
  await page.getByRole("button", { name: "復原", exact: true }).click();
  await expect(width).toHaveValue("500");
  await expect.poll(() => state.docs.a.windows[0].layout.desktop.w).toBe(500);
  expect(state.docs.a.theme.id).toBe("pink98");
});
