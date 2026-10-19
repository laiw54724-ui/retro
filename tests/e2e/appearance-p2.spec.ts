import { expect, test, type Page } from "@playwright/test";
import { makeWindow, SiteDocumentSchema } from "../../packages/shared/src/site";
import { migrateSiteDocumentV2 } from "../../packages/shared/src/site-versioning";
import { documentFixture } from "./fixture";

async function mockColors(page: Page) {
  const source = SiteDocumentSchema.parse(structuredClone(documentFixture));
  source.theme.appearance = { titleText: "#ffffcc", frameColor: "#554433", contentBackground: "#ddeeff", contentText: "#112233", desktopLabelText: "#101010", desktopLabelBackground: "#eeeeee" };
  source.windows = [makeWindow("document", 0), makeWindow("links", 1)];
  source.windows[0].title = "First.exe";
  source.windows[1].title = "Second.exe";
  source.windows[0].defaultOpen = true;
  source.windows[1].defaultOpen = true;
  source.windows[0].appearance = { titleFrom: "#002244", titleTo: "#003355", titleText: "#ffccdd", frameColor: "#334455", contentBackground: "#ffeecc", contentText: "#331122", desktopLabelText: "#ffffff", desktopLabelBackground: "#222222" };
  const result = migrateSiteDocumentV2(source, { siteId: "site-1" });
  if (!result.ok) throw new Error("fixture migration");
  let saved = result.document;
  let writes = 0;
  const session = { access_token: "a.b.c", refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u", email: "x@y.z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
  await page.addInitScript((value) => localStorage.setItem("sb-example-auth-token", JSON.stringify(value)), session);
  await page.route("**/api/sites/site-1", (route) => route.fulfill({ json: { site: { id: "site-1", username: "demo", site_name: "Demo", draft_document: saved, draft_version: writes + 1, published_document: null, published_version: null, published_at: null, access_role: "owner" } } }));
  await page.route("**/api/sites/site-1/assets**", (route) => route.fulfill({ json: { assets: [] } }));
  await page.route("**/api/sites/site-1/draft", (route) => { saved = route.request().postDataJSON().document; writes++; return route.fulfill({ json: { version: writes + 1, updatedAt: "2026-10-19T00:00:00Z" } }); });
  await page.route("**/api/public/sites/demo", (route) => route.fulfill({ json: { site: { username: "demo", site_name: "Demo", published_document: saved, published_version: 1, published_at: "2026-10-19T00:00:00Z" } } }));
  return { saved: () => saved, writes: () => writes };
}

for (const width of [320, 390, 430]) {
  test(`P2 public colors, labels and explicit tiles at ${width}`, async ({ page }, testInfo) => {
    await mockColors(page);
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/@demo");
    const firstLabel = page.getByRole("button", { name: "First.exe", exact: true }).locator(".m-label");
    await expect(firstLabel).toHaveCSS("background-color", "rgb(34, 34, 34)");
    await expect(firstLabel).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "First.exe", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "First.exe", exact: true });
    await expect(dialog).toHaveCSS("background-color", "rgb(51, 68, 85)");
    await expect(dialog.locator(".retro-titlebar")).toHaveCSS("color", "rgb(255, 204, 221)");
    await expect(dialog.locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
    await expect(dialog.locator(".module-host")).toHaveCSS("color", "rgb(51, 17, 34)");
    await page.screenshot({ path: testInfo.outputPath(`p2-mobile-${width}.png`) });
    await page.getByRole("button", { name: "關閉", exact: true }).click();
    await page.getByRole("button", { name: "Second.exe", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Second.exe", exact: true });
    await expect(dialog).toHaveCSS("background-color", "rgb(85, 68, 51)");
    await expect(dialog.locator(".module-host")).toHaveCSS("background-color", "rgb(221, 238, 255)");
    // Explicit tile fill is above generic content appearance.
    await expect(dialog.locator(".link-tile").first()).not.toHaveCSS("background-color", "rgb(221, 238, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("P2 reader isolates two windows in owner, preview and public; title reset retains other colors", async ({ page }, testInfo) => {
  const site = await mockColors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/editor/site-1");
  const first = page.getByRole("dialog", { name: "First.exe", exact: true });
  const second = page.getByRole("dialog", { name: "Second.exe", exact: true });
  await expect(first).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await expect(second).toHaveCSS("background-color", "rgb(85, 68, 51)");
  await expect(first.locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
  await expect(second.locator(".module-host")).toHaveCSS("background-color", "rgb(221, 238, 255)");
  await page.screenshot({ path: testInfo.outputPath("p2-desktop-two-windows.png") });
  await page.getByRole("button", { name: "▶ 訪客預覽", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "訪客預覽", exact: true });
  await expect(preview.getByRole("dialog", { name: "First.exe", exact: true })).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await preview.getByRole("button", { name: "手機版", exact: true }).click();
  await preview.getByRole("button", { name: "First.exe", exact: true }).click();
  await expect(preview.getByRole("dialog", { name: "First.exe", exact: true }).locator(".module-host")).toHaveCSS("color", "rgb(51, 17, 34)");
  await preview.getByRole("button", { name: "‹ 回到編輯器", exact: true }).click();
  expect(site.writes()).toBe(0);
  await first.locator(".retro-titlebar").click();
  await page.getByRole("tab", { name: "版面", exact: true }).click();
  await page.getByRole("button", { name: "恢復主題設定", exact: true }).click();
  await expect.poll(() => site.saved().windows[0].appearance?.titleFrom).toBeUndefined();
  expect(site.saved().windows[0].appearance?.contentBackground).toBe("#ffeecc");
  expect(site.saved().windows[0].appearance?.desktopLabelText).toBe("#ffffff");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "First.exe", exact: true })).toHaveCSS("background-color", "rgb(51, 68, 85)");
  await page.goto("/@demo");
  await expect(page.getByRole("dialog", { name: "First.exe", exact: true }).locator(".module-host")).toHaveCSS("background-color", "rgb(255, 238, 204)");
});
